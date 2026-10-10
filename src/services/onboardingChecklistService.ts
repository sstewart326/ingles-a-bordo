import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  OnboardingChecklistItem,
  OnboardingChecklistMeta,
  OnboardingChecklistProgress,
  OnboardingChecklistVersion,
} from '../types/interfaces';
import { v4 as uuidv4 } from 'uuid';
import { logQuery } from '../utils/firebaseUtils';

const COLLECTION_CHECKLISTS = 'onboardingChecklists';
const COLLECTION_PROGRESS = 'onboardingChecklistProgress';
const VERSIONS_SUBCOLLECTION = 'versions';

export function progressDocId(teacherId: string, studentId: string): string {
  return `${teacherId}_${studentId}`;
}

function versionDocRef(teacherId: string, version: number) {
  return doc(
    db,
    COLLECTION_CHECKLISTS,
    teacherId,
    VERSIONS_SUBCOLLECTION,
    String(version)
  );
}

export async function getChecklistMeta(
  teacherId: string
): Promise<OnboardingChecklistMeta | null> {
  logQuery('Getting onboarding checklist meta', { teacherId });
  const snap = await getDoc(doc(db, COLLECTION_CHECKLISTS, teacherId));
  if (!snap.exists()) return null;
  return { ...snap.data(), teacherId } as OnboardingChecklistMeta;
}

export async function getChecklistVersion(
  teacherId: string,
  version: number
): Promise<OnboardingChecklistVersion | null> {
  logQuery('Getting onboarding checklist version', { teacherId, version });
  const snap = await getDoc(versionDocRef(teacherId, version));
  if (!snap.exists()) return null;
  return snap.data() as OnboardingChecklistVersion;
}

export async function getLatestChecklist(
  teacherId: string
): Promise<{ meta: OnboardingChecklistMeta; version: OnboardingChecklistVersion } | null> {
  const meta = await getChecklistMeta(teacherId);
  if (!meta || meta.latestVersion < 1) return null;
  const version = await getChecklistVersion(teacherId, meta.latestVersion);
  if (!version) return null;
  return { meta, version };
}

/**
 * Appends a new immutable checklist version and bumps meta.latestVersion.
 * Preserves item ids from the payload (caller keeps stable ids for kept/renamed items).
 */
export async function saveChecklistVersion(
  teacherId: string,
  items: OnboardingChecklistItem[],
  createdBy: string
): Promise<number> {
  const cleaned = items
    .map((item) => ({
      id: item.id || uuidv4(),
      label: item.label.trim(),
    }))
    .filter((item) => item.label.length > 0);

  logQuery('Saving onboarding checklist version', {
    teacherId,
    itemCount: cleaned.length,
  });

  const metaRef = doc(db, COLLECTION_CHECKLISTS, teacherId);
  const metaSnap = await getDoc(metaRef);
  const nextVersion = metaSnap.exists()
    ? ((metaSnap.data() as OnboardingChecklistMeta).latestVersion || 0) + 1
    : 1;

  const versionData: Omit<OnboardingChecklistVersion, 'createdAt'> & {
    createdAt: ReturnType<typeof serverTimestamp>;
  } = {
    version: nextVersion,
    items: cleaned,
    createdAt: serverTimestamp(),
    createdBy,
  };

  await setDoc(versionDocRef(teacherId, nextVersion), versionData);
  await setDoc(
    metaRef,
    {
      teacherId,
      latestVersion: nextVersion,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return nextVersion;
}

export async function getStudentProgress(
  teacherId: string,
  studentId: string
): Promise<OnboardingChecklistProgress | null> {
  logQuery('Getting onboarding checklist progress', { teacherId, studentId });
  const snap = await getDoc(
    doc(db, COLLECTION_PROGRESS, progressDocId(teacherId, studentId))
  );
  if (!snap.exists()) return null;
  return snap.data() as OnboardingChecklistProgress;
}

async function createProgressAtVersion(
  teacherId: string,
  studentId: string,
  studentEmail: string,
  checklistVersion: number,
  checkedItemIds: string[]
): Promise<OnboardingChecklistProgress> {
  const version = await getChecklistVersion(teacherId, checklistVersion);
  const validIds = new Set((version?.items || []).map((i) => i.id));
  const filtered = checkedItemIds.filter((id) => validIds.has(id));

  const data: Omit<OnboardingChecklistProgress, 'updatedAt'> & {
    updatedAt: ReturnType<typeof serverTimestamp>;
  } = {
    teacherId,
    studentId,
    studentEmail,
    checklistVersion,
    checkedItemIds: filtered,
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, COLLECTION_PROGRESS, progressDocId(teacherId, studentId)), data);

  return {
    ...data,
    updatedAt: new Date(),
  };
}

/**
 * Persists a student's checklist version pin and checked items.
 */
export async function saveStudentProgress(
  teacherId: string,
  studentId: string,
  studentEmail: string,
  checklistVersion: number,
  checkedItemIds: string[]
): Promise<OnboardingChecklistProgress> {
  logQuery('Saving onboarding checklist progress', {
    teacherId,
    studentId,
    checklistVersion,
    checkedCount: checkedItemIds.length,
  });
  return createProgressAtVersion(
    teacherId,
    studentId,
    studentEmail,
    checklistVersion,
    checkedItemIds
  );
}

/** Helper for editors: assign a new id to a blank checklist row. */
export function newChecklistItem(label = ''): OnboardingChecklistItem {
  return { id: uuidv4(), label };
}
