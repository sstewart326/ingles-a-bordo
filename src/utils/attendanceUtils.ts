import { doc, getDoc, setDoc, collection, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { stripNullUndefined } from './firebaseUtils';
import { ClassAttendance } from '../types/interfaces';
import { getLocalDateString } from './dateUtils';

/**
 * Format a Date as YYYY-MM-DD for use as attendance document ID.
 */
export const toClassDateString = (date: Date): string => {
  return getLocalDateString(date);
};

/**
 * Get attendance for a single class session.
 * Path: classes/{classId}/attendance/{classDate}
 */
export const getAttendanceForClassDate = async (
  classId: string,
  classDate: string
): Promise<ClassAttendance | null> => {
  const docRef = doc(db, 'classes', classId, 'attendance', classDate);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    absentStudentIds: data.absentStudentIds ?? [],
    teacherId: data.teacherId,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : new Date(data.createdAt),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : new Date(data.updatedAt),
  };
};

/**
 * Set which students were absent for a class session.
 * Creates or updates the doc at classes/{classId}/attendance/{classDate}.
 */
export const setAbsences = async (
  classId: string,
  classDate: string,
  absentStudentIds: string[],
  teacherId: string
): Promise<void> => {
  const docRef = doc(db, 'classes', classId, 'attendance', classDate);
  const now = Timestamp.now();
  const payload: Record<string, unknown> = {
    absentStudentIds,
    teacherId,
    updatedAt: now,
  };
  const existing = await getDoc(docRef);
  if (!existing.exists()) {
    payload.createdAt = now;
  } else {
    payload.createdAt = existing.data()?.createdAt ?? now;
  }
  const clean = stripNullUndefined(payload);
  await setDoc(docRef, clean, { merge: true });
};

/**
 * Get attendance records for a class over a date range (for chart).
 * Lists docs in classes/{classId}/attendance; doc IDs are YYYY-MM-DD.
 */
export interface AttendanceRecordWithDate extends ClassAttendance {
  classDate: string;
}

export const getAttendanceForClass = async (
  classId: string,
  fromDate?: Date,
  toDate?: Date
): Promise<AttendanceRecordWithDate[]> => {
  const collRef = collection(db, 'classes', classId, 'attendance');
  const snapshot = await getDocs(collRef);
  const results: AttendanceRecordWithDate[] = [];
  snapshot.docs.forEach((d) => {
    const classDate = d.id;
    if (fromDate || toDate) {
      const [y, m, d] = classDate.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      if (fromDate && date < fromDate) return;
      if (toDate && date > toDate) return;
    }
    const data = d.data();
    results.push({
      classDate: d.id,
      absentStudentIds: data.absentStudentIds ?? [],
      teacherId: data.teacherId,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt : new Date(data.createdAt),
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : new Date(data.updatedAt),
    });
  });
  results.sort((a, b) => a.classDate.localeCompare(b.classDate));
  return results;
};
