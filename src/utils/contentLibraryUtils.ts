import { db, storage } from '../config/firebase';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  DocumentSnapshot,
  startAfter,
  DocumentData,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { ContentLibraryItem, ContentLibraryItemType } from '../types/interfaces';
import { stripNullUndefined } from './firebaseUtils';

const COLLECTION_PATH = 'contentLibrary';

const DEFAULT_PAGE_SIZE = 12;
const MAX_IMAGE_SIZE_MB = 5;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * Parses YouTube video ID from various URL formats.
 * Supports: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
 */
export function parseYouTubeVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  // youtu.be/ID
  const shortMatch = trimmed.match(/(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  // youtube.com/watch?v=ID or youtube.com/embed/ID
  const watchMatch = trimmed.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];
  return null;
}

/**
 * Returns YouTube thumbnail URL for a video ID.
 * Uses maxresdefault when available; falls back to default.
 */
export function getYouTubeThumbnailUrl(videoId: string, useMaxRes = true): string {
  const size = useMaxRes ? 'maxresdefault' : 'default';
  return `https://img.youtube.com/vi/${videoId}/${size}.jpg`;
}

export interface PaginatedContentLibraryResult {
  items: ContentLibraryItem[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}

/**
 * Fetches a page of content library items for a teacher (cursor-based pagination).
 */
export async function getContentLibraryPage(
  teacherId: string,
  pageSize: number = DEFAULT_PAGE_SIZE,
  startAfterDoc: DocumentSnapshot | null = null
): Promise<PaginatedContentLibraryResult> {
  const colRef = collection(db, COLLECTION_PATH);
  const constraints = [
    where('teacherId', '==', teacherId),
    orderBy('createdAt', 'desc'),
    limit(pageSize + 1), // fetch one extra to know if there's more
  ];
  const q = startAfterDoc
    ? query(colRef, ...constraints, startAfter(startAfterDoc))
    : query(colRef, ...constraints);

  const snapshot = await getDocs(q);
  const docs = snapshot.docs;
  const hasMore = docs.length > pageSize;
  const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;
  const lastDoc = pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null;

  const items: ContentLibraryItem[] = pageDocs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      teacherId: data.teacherId,
      type: data.type as ContentLibraryItemType,
      title: data.title,
      description: data.description,
      studentIds: data.studentIds ?? [],
      videoId: data.videoId,
      videoUrl: data.videoUrl,
      imageUrl: data.imageUrl,
      imagePath: data.imagePath,
      order: data.order,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    } as ContentLibraryItem;
  });

  return { items, lastDoc, hasMore };
}

const OVER_FETCH_CAP = 50;

function docToContentLibraryItem(d: DocumentSnapshot): ContentLibraryItem {
  const data = d.data();
  if (!data) throw new Error('Missing document data');
  return {
    id: d.id,
    teacherId: data.teacherId,
    type: data.type as ContentLibraryItemType,
    title: data.title,
    description: data.description,
    studentIds: data.studentIds ?? [],
    videoId: data.videoId,
    videoUrl: data.videoUrl,
    imageUrl: data.imageUrl,
    imagePath: data.imagePath,
    order: data.order,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  } as ContentLibraryItem;
}

/**
 * Fetches a page of content library items visible to a student (cursor-based pagination).
 * Items are from the student's teacher; visible if `studentIds` is empty or contains `studentDocId`.
 * Firestore cannot express "empty OR array-contains" as a single query, so we run both queries and merge.
 */
export async function getContentLibraryPageForStudent(
  teacherId: string,
  studentDocId: string,
  pageSize: number = DEFAULT_PAGE_SIZE,
  startAfterDoc: DocumentSnapshot | null = null
): Promise<PaginatedContentLibraryResult> {
  const overFetchLimit = Math.min(pageSize * 3, OVER_FETCH_CAP);
  const colRef = collection(db, COLLECTION_PATH);

  const baseFilters = [where('teacherId', '==', teacherId)];
  const orderBys = [orderBy('createdAt', 'desc')];

  const buildQuery = (extraConstraints: ReturnType<typeof where>[]) => {
    const filters = [...baseFilters, ...extraConstraints];
    return startAfterDoc
      ? query(colRef, ...filters, ...orderBys, startAfter(startAfterDoc), limit(overFetchLimit))
      : query(colRef, ...filters, ...orderBys, limit(overFetchLimit));
  };

  const qEmpty = buildQuery([where('studentIds', '==', [])]);
  const qStudent = buildQuery([where('studentIds', 'array-contains', studentDocId)]);

  const [emptySnapshot, studentSnapshot] = await Promise.all([getDocs(qEmpty), getDocs(qStudent)]);

  const combined = [
    ...emptySnapshot.docs.map((d) => ({ doc: d, item: docToContentLibraryItem(d) })),
    ...studentSnapshot.docs.map((d) => ({ doc: d, item: docToContentLibraryItem(d) })),
  ];

  // Safety: ensure we only keep items that are actually visible for this student.
  const visiblePairs = combined.filter(({ item }) => (
    item.studentIds.length === 0 || item.studentIds.includes(studentDocId)
  ));

  visiblePairs.sort((a, b) => {
    const tA = a.item.createdAt?.toMillis?.() ?? 0;
    const tB = b.item.createdAt?.toMillis?.() ?? 0;
    if (tA !== tB) return tB - tA;
    return b.doc.id.localeCompare(a.doc.id); // desc doc id tie-breaker
  });

  const pagePairs = visiblePairs.slice(0, pageSize);
  const items = pagePairs.map((p) => p.item);
  const lastDoc = pagePairs.length > 0 ? pagePairs[pagePairs.length - 1].doc : null;

  const hasMore =
    visiblePairs.length > pageSize ||
    emptySnapshot.docs.length >= overFetchLimit ||
    studentSnapshot.docs.length >= overFetchLimit;

  return { items, lastDoc, hasMore };
}

/**
 * Creates a new content library item.
 */
export async function createContentLibraryItem(
  teacherId: string,
  item: Omit<ContentLibraryItem, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const now = Timestamp.now();
  const payload: Record<string, unknown> = {
    ...item,
    teacherId,
    studentIds: item.studentIds ?? [],
    createdAt: now,
    updatedAt: now,
  };
  if (item.imagePath !== undefined) payload.imagePath = item.imagePath;
  const clean = stripNullUndefined(payload);
  const docRef = await addDoc(collection(db, COLLECTION_PATH), clean);
  return docRef.id;
}

/**
 * Updates an existing content library item.
 */
export async function updateContentLibraryItem(
  itemId: string,
  teacherId: string,
  updates: Partial<Omit<ContentLibraryItem, 'id' | 'teacherId' | 'createdAt'>>
): Promise<void> {
  const docRef = doc(db, COLLECTION_PATH, itemId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists() || docSnap.data()?.teacherId !== teacherId) {
    throw new Error('Content library item not found or access denied');
  }
  const payload = { ...updates, updatedAt: Timestamp.now() };
  const clean = stripNullUndefined(payload as Record<string, unknown>);
  await updateDoc(docRef, clean as DocumentData);
}

/**
 * Deletes a content library item. If type is image and imageUrl is set, deletes from Storage.
 */
export async function deleteContentLibraryItem(
  itemId: string,
  teacherId: string
): Promise<void> {
  const docRef = doc(db, COLLECTION_PATH, itemId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists() || docSnap.data()?.teacherId !== teacherId) {
    throw new Error('Content library item not found or access denied');
  }
  const data = docSnap.data();
  if (data?.type === 'image') {
    const pathToDelete = data?.imagePath ?? data?.imageUrl;
    if (pathToDelete) {
      try {
        const storageRef = ref(storage, pathToDelete);
        await deleteObject(storageRef);
      } catch (e) {
        console.warn('Failed to delete image from Storage:', e);
      }
    }
  }
  await deleteDoc(docRef);
}

/**
 * Validates image file for content library upload.
 */
export function validateContentLibraryImage(file: File): string | null {
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_IMAGE_SIZE_MB) {
    return `Image must be less than ${MAX_IMAGE_SIZE_MB}MB`;
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return `Image type not allowed. Use JPEG, PNG, GIF, or WebP`;
  }
  return null;
}

export interface UploadedImageResult {
  imageUrl: string;
  imagePath: string;
}

/**
 * Uploads an image to Firebase Storage for content library and returns the download URL and path.
 */
export async function uploadContentLibraryImage(
  file: File,
  teacherId: string
): Promise<UploadedImageResult> {
  const err = validateContentLibraryImage(file);
  if (err) throw new Error(err);
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const path = `contentLibrary/${teacherId}/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  const imageUrl = await getDownloadURL(storageRef);
  return { imageUrl, imagePath: path };
}
