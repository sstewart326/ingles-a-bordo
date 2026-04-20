import { db } from '../config/firebase';
import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  getCountFromServer,
  doc,
  getDoc,
  deleteDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import {
  ContentLibraryComment,
  ContentLibraryCommentResolved,
} from '../types/interfaces';
import { stripNullUndefined } from './firebaseUtils';

const CONTENT_LIBRARY_PATH = 'contentLibrary';
const COMMENTS_SUBCOLLECTION = 'comments';
const VERSIONS_SUBCOLLECTION = 'versions';

/**
 * Returns the number of comments for a content library item (lightweight count, no document reads).
 */
export async function getCommentCountForItem(itemId: string): Promise<number> {
  const commentsRef = collection(db, CONTENT_LIBRARY_PATH, itemId, COMMENTS_SUBCOLLECTION);
  const snapshot = await getCountFromServer(commentsRef);
  return snapshot.data().count;
}

/**
 * Fetches all comments for a content library item with resolved content.
 * If a comment has versions, the displayed content is the latest version; otherwise the comment's original content.
 */
export async function getCommentsForItem(
  itemId: string
): Promise<ContentLibraryCommentResolved[]> {
  const commentsRef = collection(db, CONTENT_LIBRARY_PATH, itemId, COMMENTS_SUBCOLLECTION);
  const q = query(commentsRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);
  const comments: ContentLibraryComment[] = snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      authorId: data.authorId,
      authorName: typeof data.authorName === 'string' ? data.authorName : undefined,
      authorProfilePictureUrl:
        typeof data.authorProfilePictureUrl === 'string'
          ? data.authorProfilePictureUrl
          : undefined,
      authorIsTeacher: data.authorIsTeacher,
      content: data.content,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      parentCommentId: data.parentCommentId,
      deleted: data.deleted === true,
    } as ContentLibraryComment;
  });

  const resolved: ContentLibraryCommentResolved[] = [];
  for (const comment of comments) {
    if (comment.deleted) {
      resolved.push({
        ...comment,
        content: '',
        hasEdits: false,
      });
      continue;
    }
    const versionsRef = collection(
      db,
      CONTENT_LIBRARY_PATH,
      itemId,
      COMMENTS_SUBCOLLECTION,
      comment.id,
      VERSIONS_SUBCOLLECTION
    );
    const versionQ = query(
      versionsRef,
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const versionSnap = await getDocs(versionQ);
    const latestVersion = versionSnap.docs[0];
    const content = latestVersion
      ? (latestVersion.data().content as string)
      : comment.content;
    const hasEdits = !!latestVersion;
    resolved.push({
      ...comment,
      content,
      hasEdits,
    });
  }
  return resolved;
}

export interface CreateContentLibraryCommentPayload {
  authorId: string;
  authorName: string;
  /** Optional; omitted when empty. Must be a URL the client can load (e.g. Storage download URL). */
  authorProfilePictureUrl?: string | null;
  authorIsTeacher: boolean;
  content: string;
  parentCommentId?: string;
}

/**
 * Creates a comment on a content library item. No targetStudentId; visibility = item visibility.
 */
export async function createContentLibraryComment(
  itemId: string,
  payload: CreateContentLibraryCommentPayload
): Promise<string> {
  const itemRef = doc(db, CONTENT_LIBRARY_PATH, itemId);
  const itemSnap = await getDoc(itemRef);
  if (!itemSnap.exists()) {
    throw new Error('Content library item not found');
  }
  const now = Timestamp.now();
  const data: Record<string, unknown> = {
    authorId: payload.authorId,
    authorName: payload.authorName.trim(),
    authorIsTeacher: payload.authorIsTeacher,
    content: payload.content,
    createdAt: now,
    updatedAt: now,
  };
  if (payload.parentCommentId) {
    data.parentCommentId = payload.parentCommentId;
  }
  const pic = payload.authorProfilePictureUrl?.trim();
  if (pic) {
    data.authorProfilePictureUrl = pic;
  }
  const clean = stripNullUndefined(data);
  const commentsRef = collection(db, CONTENT_LIBRARY_PATH, itemId, COMMENTS_SUBCOLLECTION);
  const docRef = await addDoc(commentsRef, clean);
  return docRef.id;
}

/**
 * Edits a comment by adding a new version. The comment document is never updated.
 */
export async function addCommentVersion(
  itemId: string,
  commentId: string,
  content: string,
  updatedBy?: string
): Promise<string> {
  const commentRef = doc(
    db,
    CONTENT_LIBRARY_PATH,
    itemId,
    COMMENTS_SUBCOLLECTION,
    commentId
  );
  const commentSnap = await getDoc(commentRef);
  if (!commentSnap.exists()) {
    throw new Error('Comment not found');
  }
  const data: Record<string, unknown> = {
    content: content.trim(),
    createdAt: Timestamp.now(),
  };
  if (updatedBy) {
    data.updatedBy = updatedBy;
  }
  const clean = stripNullUndefined(data);
  const versionsRef = collection(
    db,
    CONTENT_LIBRARY_PATH,
    itemId,
    COMMENTS_SUBCOLLECTION,
    commentId,
    VERSIONS_SUBCOLLECTION
  );
  const versionRef = await addDoc(versionsRef, clean);
  return versionRef.id;
}

/**
 * Deletes a comment. Author or item teacher only (enforced by rules).
 * If the comment has replies, it is soft-deleted (marked deleted, shown as [Deleted]) so replies stay visible.
 */
export async function deleteContentLibraryComment(
  itemId: string,
  commentId: string
): Promise<void> {
  const commentsRef = collection(db, CONTENT_LIBRARY_PATH, itemId, COMMENTS_SUBCOLLECTION);
  const repliesQuery = query(
    commentsRef,
    where('parentCommentId', '==', commentId),
    limit(1)
  );
  const repliesSnap = await getDocs(repliesQuery);
  const hasReplies = !repliesSnap.empty;

  const commentRef = doc(
    db,
    CONTENT_LIBRARY_PATH,
    itemId,
    COMMENTS_SUBCOLLECTION,
    commentId
  );

  if (hasReplies) {
    await updateDoc(commentRef, {
      deleted: true,
      deletedAt: Timestamp.now(),
    });
  } else {
    await deleteDoc(commentRef);
  }
}
