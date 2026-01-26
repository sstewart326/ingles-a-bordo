import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { ClassException } from '../types/interfaces';
import { invalidateCache } from './cacheUtils';
import { invalidateCalendarCache } from '../services/calendarService';

/**
 * Diagnostic function to check if a user has permission to create exceptions for a class.
 * This helps debug permission issues.
 * 
 * NOTE: Classes do NOT have a teacherId field. Teachers are identified by having isAdmin: true
 * in their user document. Students have a 'teacher' field pointing to their teacher's UID.
 */
export const checkExceptionPermissions = async (
  classId: string,
  userId: string
): Promise<{
  canCreate: boolean;
  reason: string;
  classExists: boolean;
  isUserAdmin: boolean;
}> => {
  try {
    // Check if class exists
    const classDocRef = doc(db, 'classes', classId);
    const classDoc = await getDoc(classDocRef);
    
    if (!classDoc.exists()) {
      return {
        canCreate: false,
        reason: 'Class document does not exist',
        classExists: false,
        isUserAdmin: false,
      };
    }
    
    // Check if user is admin
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
      return {
        canCreate: false,
        reason: 'User document does not exist',
        classExists: true,
        isUserAdmin: false,
      };
    }
    
    const userData = userDoc.data();
    const isAdmin = userData?.isAdmin === true;
    
    if (isAdmin) {
      return {
        canCreate: true,
        reason: 'User is an admin',
        classExists: true,
        isUserAdmin: true,
      };
    }
    
    return {
      canCreate: false,
      reason: 'User is not an admin',
      classExists: true,
      isUserAdmin: false,
    };
  } catch (error) {
    console.error('Error checking permissions:', error);
    return {
      canCreate: false,
      reason: `Error checking permissions: ${error instanceof Error ? error.message : 'Unknown error'}`,
      classExists: false,
      isUserAdmin: false,
    };
  }
};

/**
 * Utility functions for managing class exceptions (cancellations, reschedules).
 * Exceptions are stored as a subcollection under each class document.
 * Dates are stored as YYYY-MM-DD strings to avoid timezone issues.
 */

// Helper to convert Date to YYYY-MM-DD string
const toDateString = (date: Date | null): string | null => {
  return date ? date.toISOString().split('T')[0] : null;
};

// Helper to convert Date or string to YYYY-MM-DD string
const toDateStringSafe = (date: Date | string | null | undefined): string | null | undefined => {
  if (!date) return date === null ? null : undefined;
  if (typeof date === 'string') return date;
  return date.toISOString().split('T')[0];
};

// Helper to convert Firestore Timestamp to Date (for createdAt field only)
const timestampToDate = (timestamp: Timestamp | { toDate: () => Date } | null): Date | null => {
  if (!timestamp) return null;
  if (timestamp instanceof Timestamp) return timestamp.toDate();
  if (typeof timestamp.toDate === 'function') return timestamp.toDate();
  return null;
};

/**
 * Creates a new class exception (cancellation or reschedule).
 * @param classId - The ID of the class
 * @param exception - The exception data (dates can be Date objects or strings, will be converted to YYYY-MM-DD strings)
 * @returns The created exception with its ID
 * @throws Error if the exception cannot be saved to the database
 */
export const createClassException = async (
  classId: string,
  exception: {
    originalDate?: Date | string | null;
    newDate?: Date | string | null;
    type: 'cancelled' | 'rescheduled';
    originalStartTime: string;
    originalEndTime: string;
    newStartTime?: string;
    newEndTime?: string;
    reason?: string;
    timezone: string;
    createdAt: Date;
    createdBy: string;
  }
): Promise<ClassException> => {
  // Validate inputs
  if (!classId) {
    throw new Error('classId is required');
  }
  if (!exception.type) {
    throw new Error('exception type is required');
  }
  if (!exception.createdBy) {
    throw new Error('createdBy is required');
  }
  if (!exception.timezone) {
    throw new Error('timezone is required');
  }
  if (!exception.originalStartTime) {
    throw new Error('originalStartTime is required');
  }
  if (!exception.originalEndTime) {
    throw new Error('originalEndTime is required');
  }
  // Validate that original times are provided for reschedule exceptions
  if (exception.type === 'rescheduled' && (!exception.originalStartTime || !exception.originalEndTime)) {
    throw new Error('originalStartTime and originalEndTime are required for reschedule exceptions');
  }
  
  // Check permissions before attempting to write
  const permissionCheck = await checkExceptionPermissions(classId, exception.createdBy);
  
  if (!permissionCheck.classExists) {
    throw new Error(`Cannot create exception: Class document '${classId}' does not exist`);
  }
  
  if (!permissionCheck.isUserAdmin) {
    throw new Error('Permission denied: Only admins can create class exceptions');
  }
  
  const exceptionsRef = collection(db, 'classes', classId, 'classExceptions');
  const newDocRef = doc(exceptionsRef);
  
  // Convert dates to strings if they're Date objects
  const originalDateString = toDateStringSafe(exception.originalDate);
  const newDateString = toDateStringSafe(exception.newDate);
  
  // Build exception data, excluding undefined values (Firestore doesn't accept undefined)
  const exceptionData: Record<string, unknown> = {
    classId,
    type: exception.type,
    originalDate: originalDateString,
    originalStartTime: exception.originalStartTime,
    originalEndTime: exception.originalEndTime,
    timezone: exception.timezone,
    createdAt: Timestamp.now(),
    createdBy: exception.createdBy,
  };
  
  // Only add optional fields if they have values
  if (newDateString) {
    exceptionData.newDate = newDateString;
  }
  if (exception.newStartTime) {
    exceptionData.newStartTime = exception.newStartTime;
  }
  if (exception.newEndTime) {
    exceptionData.newEndTime = exception.newEndTime;
  }
  if (exception.reason) {
    exceptionData.reason = exception.reason;
  }
  
  try {
    await setDoc(newDocRef, exceptionData);
    
    // Invalidate calendar cache so the UI updates immediately
    invalidateCalendarCache();
  } catch (error) {
    console.error('Error saving class exception:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to save class exception: ${errorMessage}`);
  }

  return {
    id: newDocRef.id,
    classId,
    originalDate: originalDateString ?? null,
    type: exception.type,
    originalStartTime: exception.originalStartTime,
    originalEndTime: exception.originalEndTime,
    newDate: newDateString ?? undefined,
    newStartTime: exception.newStartTime,
    newEndTime: exception.newEndTime,
    reason: exception.reason,
    timezone: exception.timezone,
    createdAt: new Date(),
    createdBy: exception.createdBy,
  };
};

/**
 * Gets a single class exception by ID.
 * @param classId - The ID of the class
 * @param exceptionId - The ID of the exception
 * @returns The exception or null if not found
 */
export const getClassException = async (
  classId: string,
  exceptionId: string
): Promise<ClassException | null> => {
  const docRef = doc(db, 'classes', classId, 'classExceptions', exceptionId);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) return null;
  
  const data = docSnap.data();
  return {
    id: docSnap.id,
    classId: data.classId,
    originalDate: data.originalDate || null,
    type: data.type,
    originalStartTime: data.originalStartTime,
    originalEndTime: data.originalEndTime,
    newDate: data.newDate || undefined,
    newStartTime: data.newStartTime,
    newEndTime: data.newEndTime,
    reason: data.reason,
    timezone: data.timezone || 'UTC',
    createdAt: timestampToDate(data.createdAt) || new Date(),
    createdBy: data.createdBy,
  };
};

/**
 * Gets all exceptions for a class within a date range.
 * Fetches exceptions where originalDate OR newDate falls within the range.
 * @param classId - The ID of the class
 * @param startDate - Start of date range
 * @param endDate - End of date range
 * @returns Array of exceptions
 */
export const getClassExceptionsInRange = async (
  classId: string,
  startDate: Date,
  endDate: Date
): Promise<ClassException[]> => {
  const exceptionsRef = collection(db, 'classes', classId, 'classExceptions');
  
  // Convert dates to YYYY-MM-DD strings for querying
  const startDateString = toDateString(startDate) || '';
  const endDateString = toDateString(endDate) || '';
  
  // Query 1: Exceptions where originalDate is in range
  // Catches: cancellations, reschedules where original date was in this range
  const byOriginalDateQuery = query(
    exceptionsRef,
    where('originalDate', '>=', startDateString),
    where('originalDate', '<=', endDateString)
  );
  
  // Query 2: Exceptions where newDate is in range
  // Catches: reschedules that LAND in this range (even if from another month)
  const byNewDateQuery = query(
    exceptionsRef,
    where('newDate', '>=', startDateString),
    where('newDate', '<=', endDateString)
  );
  
  // Run in parallel
  const [byOriginalSnapshot, byNewSnapshot] = await Promise.all([
    getDocs(byOriginalDateQuery),
    getDocs(byNewDateQuery),
  ]);
  
  // Deduplicate by document ID (a reschedule within the same month appears in both)
  const exceptionsMap = new Map<string, ClassException>();
  
  const processDoc = (docSnap: { id: string; data: () => Record<string, unknown> }) => {
    const data = docSnap.data();
    const exception: ClassException = {
      id: docSnap.id,
      classId: data.classId as string,
      originalDate: (data.originalDate as string) || null,
      type: data.type as 'cancelled' | 'rescheduled',
      originalStartTime: data.originalStartTime as string,
      originalEndTime: data.originalEndTime as string,
      newDate: (data.newDate as string) || undefined,
      newStartTime: data.newStartTime as string | undefined,
      newEndTime: data.newEndTime as string | undefined,
      reason: data.reason as string | undefined,
      timezone: (data.timezone as string) || 'UTC',
      createdAt: timestampToDate(data.createdAt as Timestamp) || new Date(),
      createdBy: data.createdBy as string,
    };
    exceptionsMap.set(docSnap.id, exception);
  };
  
  byOriginalSnapshot.docs.forEach(processDoc);
  byNewSnapshot.docs.forEach(processDoc);
  
  return Array.from(exceptionsMap.values());
};

/**
 * Gets all exceptions for a class.
 * @param classId - The ID of the class
 * @returns Array of all exceptions
 */
export const getAllClassExceptions = async (
  classId: string
): Promise<ClassException[]> => {
  const exceptionsRef = collection(db, 'classes', classId, 'classExceptions');
  const snapshot = await getDocs(exceptionsRef);
  
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      classId: data.classId,
      originalDate: (data.originalDate as string) || null,
      type: data.type,
      originalStartTime: data.originalStartTime as string,
      originalEndTime: data.originalEndTime as string,
      newDate: (data.newDate as string) || undefined,
      newStartTime: data.newStartTime,
      newEndTime: data.newEndTime,
      reason: data.reason,
      timezone: (data.timezone as string) || 'UTC',
      createdAt: timestampToDate(data.createdAt) || new Date(),
      createdBy: data.createdBy,
    };
  });
};

/**
 * Updates an existing class exception.
 * @param classId - The ID of the class
 * @param exceptionId - The ID of the exception to update
 * @param updates - Partial exception data to update (dates can be Date objects or strings)
 */
export const updateClassException = async (
  classId: string,
  exceptionId: string,
  updates: Partial<Omit<ClassException, 'id' | 'classId' | 'createdAt' | 'createdBy'>> & {
    originalDate?: Date | string | null;
    newDate?: Date | string | null;
  }
): Promise<void> => {
  const docRef = doc(db, 'classes', classId, 'classExceptions', exceptionId);
  
  const updateData: Record<string, unknown> = { ...updates };
  
  // Convert dates to strings if they're Date objects
  if (updates.originalDate !== undefined) {
    updateData.originalDate = toDateStringSafe(updates.originalDate);
  }
  if (updates.newDate !== undefined) {
    updateData.newDate = toDateStringSafe(updates.newDate) ?? null;
  }
  
  await updateDoc(docRef, updateData as DocumentData);
  
  // Invalidate calendar cache so the UI updates immediately
  invalidateCalendarCache();
};

/**
 * Deletes a class exception.
 * @param classId - The ID of the class
 * @param exceptionId - The ID of the exception to delete
 */
export const deleteClassException = async (
  classId: string,
  exceptionId: string
): Promise<void> => {
  const docRef = doc(db, 'classes', classId, 'classExceptions', exceptionId);
  await deleteDoc(docRef);
  
  // Invalidate calendar cache so the UI updates immediately
  invalidateCalendarCache();
};

/**
 * Creates a cancellation exception for a class on a specific date.
 * @param classId - The ID of the class
 * @param originalDate - The date to cancel (Date object will be converted to YYYY-MM-DD string)
 * @param timezone - The timezone for the exception
 * @param createdBy - The user ID of who created the exception
 * @param reason - Optional reason for cancellation
 */
export const cancelClassOnDate = async (
  classId: string,
  originalDate: Date,
  originalStartTime: string,
  originalEndTime: string,
  timezone: string,
  createdBy: string,
  reason?: string
): Promise<ClassException> => {
  return createClassException(classId, {
    originalDate,
    type: 'cancelled',
    originalStartTime,
    originalEndTime,
    timezone,
    reason,
    createdAt: new Date(),
    createdBy,
  });
};

/**
 * Creates a reschedule exception to move a class from one date to another.
 * @param classId - The ID of the class
 * @param originalDate - The original class date (Date object will be converted to YYYY-MM-DD string)
 * @param newDate - The new date for the class (Date object will be converted to YYYY-MM-DD string)
 * @param newStartTime - The start time for the rescheduled class
 * @param newEndTime - The end time for the rescheduled class
 * @param timezone - The timezone for the exception
 * @param createdBy - The user ID of who created the exception
 * @param reason - Optional reason for rescheduling
 */
export const rescheduleClass = async (
  classId: string,
  originalDate: Date,
  originalStartTime: string,
  originalEndTime: string,
  newDate: Date,
  newStartTime: string,
  newEndTime: string,
  timezone: string,
  createdBy: string,
  reason?: string
): Promise<ClassException> => {
  return createClassException(classId, {
    originalDate,
    newDate,
    type: 'rescheduled',
    originalStartTime,
    originalEndTime,
    newStartTime,
    newEndTime,
    timezone,
    reason,
    createdAt: new Date(),
    createdBy,
  });
};


/**
 * Checks if a class has an exception on a specific date.
 * @param classId - The ID of the class
 * @param date - The date to check
 * @returns The exception if found, null otherwise
 */
export const getExceptionForDate = async (
  classId: string,
  date: Date
): Promise<ClassException | null> => {
  const exceptionsRef = collection(db, 'classes', classId, 'classExceptions');
  
  // Convert date to YYYY-MM-DD string for exact match
  const dateString = toDateString(date) || '';
  
  const q = query(
    exceptionsRef,
    where('originalDate', '==', dateString)
  );
  
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) return null;
  
  const docSnap = snapshot.docs[0];
  const data = docSnap.data();
  
  return {
    id: docSnap.id,
    classId: data.classId,
    originalDate: (data.originalDate as string) || null,
    type: data.type,
    originalStartTime: data.originalStartTime as string,
    originalEndTime: data.originalEndTime as string,
    newDate: (data.newDate as string) || undefined,
    newStartTime: data.newStartTime,
    newEndTime: data.newEndTime,
    reason: data.reason,
    timezone: (data.timezone as string) || 'UTC',
    createdAt: timestampToDate(data.createdAt) || new Date(),
    createdBy: data.createdBy,
  };
};

/**
 * Builds lookup maps from exceptions for efficient O(1) access during date iteration.
 * @param exceptions - Array of exceptions to index
 * @returns Maps keyed by original date and new date (YYYY-MM-DD strings)
 */
export const buildExceptionMaps = (exceptions: ClassException[]): {
  byOriginalDate: Map<string, ClassException>;
  byNewDate: Map<string, ClassException>;
} => {
  const byOriginalDate = new Map<string, ClassException>();
  const byNewDate = new Map<string, ClassException>();
  
  for (const ex of exceptions) {
    if (ex.originalDate) {
      // originalDate is already a YYYY-MM-DD string
      byOriginalDate.set(ex.originalDate, ex);
    }
    if (ex.newDate) {
      // newDate is already a YYYY-MM-DD string
      byNewDate.set(ex.newDate, ex);
    }
  }
  
  return { byOriginalDate, byNewDate };
};

/**
 * Moves class materials from one date to another when a class is rescheduled.
 * @param classId - The ID of the class
 * @param originalDate - The original class date
 * @param newDate - The new class date
 * @returns Number of materials moved
 */
export const moveMaterialsToNewDate = async (
  classId: string,
  originalDate: Date,
  newDate: Date
): Promise<number> => {
  const materialsRef = collection(db, 'classMaterials');
  
  // Create date range for the query (same day)
  const startOfDay = new Date(originalDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(originalDate);
  endOfDay.setHours(23, 59, 59, 999);
  
  const q = query(
    materialsRef,
    where('classId', '==', classId),
    where('classDate', '>=', Timestamp.fromDate(startOfDay)),
    where('classDate', '<=', Timestamp.fromDate(endOfDay))
  );
  
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return 0;
  }
  
  // Calculate new month string
  const newMonth = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`;
  
  // Update each material's classDate
  const updatePromises = snapshot.docs.map(async (docSnap) => {
    await updateDoc(docSnap.ref, {
      classDate: Timestamp.fromDate(newDate),
      month: newMonth,
      updatedAt: new Date(),
    });
  });
  
  await Promise.all(updatePromises);
  
  // Invalidate cache
  invalidateCache('classMaterials');
  
  return snapshot.docs.length;
};

/**
 * Moves homework assignments from one date to another when a class is rescheduled.
 * @param classId - The ID of the class
 * @param originalDate - The original class date
 * @param newDate - The new class date
 * @returns Number of homework assignments moved
 */
export const moveHomeworkToNewDate = async (
  classId: string,
  originalDate: Date,
  newDate: Date
): Promise<number> => {
  const homeworkRef = collection(db, 'homework');
  
  // Create date range for the query (same day)
  const startOfDay = new Date(originalDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(originalDate);
  endOfDay.setHours(23, 59, 59, 999);
  
  const q = query(
    homeworkRef,
    where('classId', '==', classId),
    where('classDate', '>=', Timestamp.fromDate(startOfDay)),
    where('classDate', '<=', Timestamp.fromDate(endOfDay))
  );
  
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return 0;
  }
  
  // Calculate new month string
  const newMonth = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`;
  
  // Update each homework's classDate
  const updatePromises = snapshot.docs.map(async (docSnap) => {
    await updateDoc(docSnap.ref, {
      classDate: Timestamp.fromDate(newDate),
      month: newMonth,
      updatedAt: new Date(),
    });
  });
  
  await Promise.all(updatePromises);
  
  // Invalidate cache
  invalidateCache('homework');
  
  return snapshot.docs.length;
};

/**
 * Moves both materials and homework from one date to another.
 * Convenience function that combines moveMaterialsToNewDate and moveHomeworkToNewDate.
 * @param classId - The ID of the class
 * @param originalDate - The original class date
 * @param newDate - The new class date
 * @returns Object with counts of materials and homework moved
 */
export const moveMaterialsAndHomework = async (
  classId: string,
  originalDate: Date,
  newDate: Date
): Promise<{ materialsMoved: number; homeworkMoved: number }> => {
  const [materialsMoved, homeworkMoved] = await Promise.all([
    moveMaterialsToNewDate(classId, originalDate, newDate),
    moveHomeworkToNewDate(classId, originalDate, newDate),
  ]);
  
  return { materialsMoved, homeworkMoved };
};

/**
 * Creates a reschedule exception and automatically moves associated materials and homework.
 * @param classId - The ID of the class
 * @param originalDate - The original class date
 * @param newDate - The new date for the class
 * @param newStartTime - The start time for the rescheduled class
 * @param newEndTime - The end time for the rescheduled class
 * @param timezone - The timezone for the exception
 * @param createdBy - The user ID of who created the exception
 * @param reason - Optional reason for rescheduling
 * @returns The created exception and counts of moved items
 */
export const rescheduleClassWithAutoMove = async (
  classId: string,
  originalDate: Date,
  originalStartTime: string,
  originalEndTime: string,
  newDate: Date,
  newStartTime: string,
  newEndTime: string,
  timezone: string,
  createdBy: string,
  reason?: string
): Promise<{
  exception: ClassException;
  materialsMoved: number;
  homeworkMoved: number;
}> => {
  // Create the reschedule exception
  const exception = await rescheduleClass(
    classId,
    originalDate,
    originalStartTime,
    originalEndTime,
    newDate,
    newStartTime,
    newEndTime,
    timezone,
    createdBy,
    reason
  );
  
  // Auto-move materials and homework in parallel
  const [materialsMoved, homeworkMoved] = await Promise.all([
    moveMaterialsToNewDate(classId, originalDate, newDate),
    moveHomeworkToNewDate(classId, originalDate, newDate),
  ]);
  
  return {
    exception,
    materialsMoved,
    homeworkMoved,
  };
};

