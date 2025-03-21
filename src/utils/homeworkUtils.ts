import { db, storage } from '../config/firebase';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  orderBy,
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL,
  deleteObject
} from 'firebase/storage';
import { getCached, setCached, invalidateCache, clearCacheByPrefix } from './cacheUtils';
import { Homework, HomeworkSubmission } from '../types/interfaces';

// Collection paths
const HOMEWORK_COLLECTION = 'homework';
const SUBMISSION_COLLECTION = 'homeworkSubmissions';

// File size limits in MB
const MAX_FILE_SIZES = {
  document: 5, // 5MB for documents
  audio: 15,   // 15MB for audio
  video: 50    // 50MB for video
};

// Allowed file types by category
const ALLOWED_FILE_TYPES = {
  document: [
    'application/pdf',
    'application/vnd.ms-word',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
    'text/plain'
  ],
  audio: [
    'audio/mpeg', // mp3
    'audio/wav',
    'audio/ogg',
    'audio/x-m4a' // m4a
  ],
  video: [
    'video/mp4',
    'video/quicktime', // mov
    'video/webm',
    'video/x-ms-wmv'
  ]
};

// Helper function to determine file type category
const getFileCategory = (mimeType: string): 'document' | 'audio' | 'video' | 'unknown' => {
  if (ALLOWED_FILE_TYPES.document.includes(mimeType)) return 'document';
  if (ALLOWED_FILE_TYPES.audio.includes(mimeType)) return 'audio';
  if (ALLOWED_FILE_TYPES.video.includes(mimeType)) return 'video';
  return 'unknown';
};

// Validate file size and type
export const validateHomeworkFile = (file: File): string | null => {
  const fileCategory = getFileCategory(file.type);
  
  if (fileCategory === 'unknown') {
    return `File type "${file.type}" is not allowed. Allowed types include PDF, Word, PowerPoint, audio, and video files.`;
  }
  
  const fileSizeInMB = file.size / (1024 * 1024);
  const maxSize = MAX_FILE_SIZES[fileCategory];
  
  if (fileSizeInMB > maxSize) {
    return `${fileCategory.charAt(0).toUpperCase() + fileCategory.slice(1)} files must be less than ${maxSize}MB`;
  }
  
  return null;
};

// Utility function to extract the base class ID
// This handles both regular class IDs and those with date-suffixes like "classId-timestamp"
const extractBaseClassId = (classId: string): string => {
  // If the class ID contains a hyphen, it's from the Past/Upcoming Classes view
  // Extract just the base ID (everything before the first hyphen)
  const match = classId.match(/^([^-]+)/);
  return match ? match[1] : classId;
};

// Simple pub/sub for homework changes
type HomeworkChangeListener = (classId: string) => void;
const homeworkChangeListeners: HomeworkChangeListener[] = [];

// Subscribe to homework changes
export const subscribeToHomeworkChanges = (listener: HomeworkChangeListener): () => void => {
  homeworkChangeListeners.push(listener);
  
  // Return unsubscribe function
  return () => {
    const index = homeworkChangeListeners.indexOf(listener);
    if (index !== -1) {
      homeworkChangeListeners.splice(index, 1);
    }
  };
};

// Notify all listeners about a homework change
export const notifyHomeworkChange = (classId: string): void => {
  // Extract base class ID to ensure consistency
  const baseClassId = extractBaseClassId(classId);
  console.log(`Notifying all components about homework change for class: ${baseClassId}`);
  
  // Notify all listeners
  homeworkChangeListeners.forEach(listener => {
    try {
      listener(baseClassId);
    } catch (error) {
      console.error('Error in homework change listener:', error);
    }
  });
};

// Add new homework assignment
export const addHomework = async (
  classId: string,
  title: string,
  description: string,
  classDate: Date,
  allowTextSubmission: boolean = true,
  allowFileSubmission: boolean = true,
  files?: File[]
): Promise<string> => {
  try {
    // Extract the base class ID to ensure consistency between views
    const baseClassId = extractBaseClassId(classId);
    
    // Normalize date to UTC to avoid timezone issues
    const year = classDate.getFullYear();
    const month = classDate.getMonth();
    const day = classDate.getDate();
    const utcDate = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
    
    // Create homework document first
    const homeworkData: Omit<Homework, 'id'> = {
      classId: baseClassId,
      title,
      description,
      classDate: utcDate,
      allowTextSubmission,
      allowFileSubmission,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Add homework document to get the ID
    const docRef = await addDoc(collection(db, HOMEWORK_COLLECTION), homeworkData);
    const homeworkId = docRef.id;
    
    // If there are files to upload
    if (files && files.length > 0) {
      const documents: { url: string; name: string; type: string; size: number }[] = [];
      
      for (const file of files) {
        // Validate file
        const validationError = validateHomeworkFile(file);
        if (validationError) {
          throw new Error(validationError);
        }
        
        // Create a clean filename
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const timestamp = Date.now();
        const finalFileName = `${utcDate.toISOString().split('T')[0]}_${timestamp}_${cleanFileName}`;
        
        // Create storage reference with path based on file type
        const fileCategory = getFileCategory(file.type);
        const storageRef = ref(storage, `homework/${homeworkId}/${fileCategory}/${finalFileName}`);
        
        // Upload with metadata
        const metadata = {
          contentType: file.type,
          customMetadata: {
            originalName: file.name,
            uploadedAt: new Date().toISOString(),
            fileCategory
          }
        };
        
        await uploadBytes(storageRef, file, metadata);
        const downloadUrl = await getDownloadURL(storageRef);
        
        documents.push({
          url: downloadUrl,
          name: file.name,
          type: file.type,
          size: file.size
        });
      }
      
      // Update homework document with document URLs
      await updateDoc(doc(db, HOMEWORK_COLLECTION, homeworkId), {
        documents,
        updatedAt: new Date()
      });
    }
    
    // Invalidate cache
    invalidateCache(HOMEWORK_COLLECTION);
    
    // Clear all homework cache
    clearHomeworkCache();
    
    // Notify all listeners about the change
    notifyHomeworkChange(baseClassId);
    
    return homeworkId;
  } catch (error) {
    console.error('Error adding homework:', error);
    throw error;
  }
};

// Add new function to invalidate homework cache
export const invalidateHomeworkCache = () => {
  // Clear all homework-related caches
  invalidateCache(HOMEWORK_COLLECTION);
  invalidateCache(SUBMISSION_COLLECTION);
  
  // Also clear any student-specific caches
  const cacheKeys = Object.keys(localStorage);
  cacheKeys.forEach(key => {
    if (key.startsWith(`${HOMEWORK_COLLECTION}_student_`) || 
        key.startsWith(`${SUBMISSION_COLLECTION}_`)) {
      localStorage.removeItem(key);
    }
  });
};

// Get homework assignments for a specific class
export const getHomeworkForClass = async (classId: string): Promise<Homework[]> => {
  try {
    // Check if we're masquerading
    const masqueradeUserStr = sessionStorage.getItem('masqueradeUser');
    if (masqueradeUserStr) {
      // If masquerading, don't use cache
      invalidateHomeworkCache();
    }
    
    // Extract the base class ID to ensure consistency
    const baseClassId = extractBaseClassId(classId);
    
    const cacheKey = `${HOMEWORK_COLLECTION}_${baseClassId}`;
    const cached = getCached<Homework[]>(cacheKey);
    
    if (cached && !masqueradeUserStr) {
      return cached;
    }
    
    const q = query(
      collection(db, HOMEWORK_COLLECTION),
      where('classId', '==', baseClassId),
      orderBy('classDate', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const homework: Homework[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      homework.push({
        ...data,
        id: doc.id,
        classDate: data.classDate.toDate(),
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate()
      } as Homework);
    });
    
    setCached(cacheKey, homework);
    return homework;
  } catch (error) {
    console.error('Error getting homework for class:', error);
    throw error;
  }
};

// Get homework assignments for a specific student
export const getHomeworkForStudent = async (studentEmail: string): Promise<Homework[]> => {
  try {
    // Check if we're masquerading
    const masqueradeUserStr = sessionStorage.getItem('masqueradeUser');
    if (masqueradeUserStr) {
      // If masquerading, don't use cache
      invalidateHomeworkCache();
    }
    
    const cacheKey = `${HOMEWORK_COLLECTION}_student_${studentEmail}`;
    const cached = getCached<Homework[]>(cacheKey);
    
    if (cached && !masqueradeUserStr) {
      return cached;
    }
    
    const homework: Homework[] = [];
    
    // Get the classes the student is enrolled in
    const classesQuery = query(
      collection(db, 'classes'),
      where('studentEmails', 'array-contains', studentEmail)
    );
    
    const classesSnapshot = await getDocs(classesQuery);
    const classIds = classesSnapshot.docs.map(doc => doc.id);
    
    // If the student is enrolled in any classes, get homework for those classes
    if (classIds.length > 0) {
      // We need to run multiple queries since Firestore doesn't support array-contains-any with other filters
      const homeworkByClassPromises = classIds.map(async (classId) => {
        const classHomeworkQuery = query(
          collection(db, HOMEWORK_COLLECTION),
          where('classId', '==', classId),
          orderBy('classDate', 'desc')
        );
        
        return getDocs(classHomeworkQuery);
      });
      
      const homeworkSnapshots = await Promise.all(homeworkByClassPromises);
      
      // Process all the results
      homeworkSnapshots.forEach(snapshot => {
        snapshot.forEach(doc => {
          const data = doc.data();
          homework.push({
            ...data,
            id: doc.id,
            classDate: data.classDate.toDate(),
            createdAt: data.createdAt.toDate(),
            updatedAt: data.updatedAt.toDate()
          } as Homework);
        });
      });
    }
    
    // Sort all homework by date (most recent first)
    homework.sort((a, b) => b.classDate.getTime() - a.classDate.getTime());
    
    setCached(cacheKey, homework);
    return homework;
  } catch (error) {
    console.error('Error getting homework for student:', error);
    throw error;
  }
};

// Get homework assignments for a specific date
export const getHomeworkForDate = async (classId: string, date: Date): Promise<Homework[]> => {
  try {
    // Check if we're masquerading
    const masqueradeUserStr = sessionStorage.getItem('masqueradeUser');
    if (masqueradeUserStr) {
      // If masquerading, don't use cache
      invalidateHomeworkCache();
    }
    
    // Extract the base class ID to ensure consistency between views
    const baseClassId = extractBaseClassId(classId);
    
    // Normalize both incoming date and database dates to YYYY-MM-DD format
    // to avoid timezone issues
    const dateString = date.toISOString().split('T')[0]; // Get YYYY-MM-DD
    
    // Get all homework for this class and filter by date
    const q = query(
      collection(db, HOMEWORK_COLLECTION),
      where('classId', '==', baseClassId)
    );
    
    const querySnapshot = await getDocs(q);
    const homework: Homework[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const homeworkDate = data.classDate.toDate();
      const homeworkDateString = homeworkDate.toISOString().split('T')[0];
      
      // Compare date strings (YYYY-MM-DD) rather than exact timestamps
      if (homeworkDateString === dateString) {
        homework.push({
          ...data,
          id: doc.id,
          classDate: homeworkDate,
          createdAt: data.createdAt.toDate(),
          updatedAt: data.updatedAt.toDate()
        } as Homework);
      }
    });
    
    return homework;
  } catch (error) {
    console.error('Error getting homework for date:', error);
    throw error;
  }
};

// Delete a homework assignment
export const deleteHomework = async (homeworkId: string): Promise<void> => {
  try {
    // Get the homework document to access file references
    const homeworkDoc = await getDoc(doc(db, HOMEWORK_COLLECTION, homeworkId));
    
    if (!homeworkDoc.exists()) {
      throw new Error('Homework not found');
    }
    
    const homeworkData = homeworkDoc.data() as Homework;
    const classId = homeworkData.classId;
    
    // Delete associated files from storage
    if (homeworkData.documents && homeworkData.documents.length > 0) {
      for (const document of homeworkData.documents) {
        // Extract storage path from URL
        const url = new URL(document.url);
        const storagePath = decodeURIComponent(url.pathname.split('/o/')[1].split('?')[0]);
        const storageRef = ref(storage, storagePath);
        
        try {
          await deleteObject(storageRef);
        } catch (error) {
          console.error('Error deleting file from storage:', error);
          // Continue with deletion even if file deletion fails
        }
      }
    }
    
    // Delete all submissions for this homework
    const submissionsQuery = query(
      collection(db, SUBMISSION_COLLECTION),
      where('homeworkId', '==', homeworkId)
    );
    
    const submissionsSnapshot = await getDocs(submissionsQuery);
    
    // Delete each submission and its files
    const submissionDeletePromises = submissionsSnapshot.docs.map(async (submissionDoc) => {
      const submissionData = submissionDoc.data() as HomeworkSubmission;
      
      // Delete submission files if any
      if (submissionData.files && submissionData.files.length > 0) {
        for (const file of submissionData.files) {
          const url = new URL(file.url);
          const storagePath = decodeURIComponent(url.pathname.split('/o/')[1].split('?')[0]);
          const storageRef = ref(storage, storagePath);
          
          try {
            await deleteObject(storageRef);
          } catch (error) {
            console.error('Error deleting submission file from storage:', error);
          }
        }
      }
      
      // Delete submission document
      return deleteDoc(doc(db, SUBMISSION_COLLECTION, submissionDoc.id));
    });
    
    await Promise.all(submissionDeletePromises);
    
    // Finally, delete the homework document
    await deleteDoc(doc(db, HOMEWORK_COLLECTION, homeworkId));
    
    // Invalidate caches
    invalidateCache(HOMEWORK_COLLECTION);
    invalidateCache(SUBMISSION_COLLECTION);
    
    // Notify all listeners about the change
    notifyHomeworkChange(classId);
  } catch (error) {
    console.error('Error deleting homework:', error);
    throw error;
  }
};

// Submit homework
export const submitHomework = async (
  homeworkId: string,
  studentEmail: string,
  textResponse?: string,
  files?: File[]
): Promise<string> => {
  try {
    // Get the homework to retrieve class ID for cache invalidation
    const homeworkSnap = await getDoc(doc(db, HOMEWORK_COLLECTION, homeworkId));
    if (!homeworkSnap.exists()) {
      throw new Error('Homework not found');
    }
    
    const homeworkData = homeworkSnap.data() as Homework;
    const classId = homeworkData.classId;
    
    // Verify the homework exists and check if student is in the class
    const classDoc = await getDoc(doc(db, 'classes', homeworkData.classId));
      
    if (!classDoc.exists()) {
      throw new Error('Class not found');
    }
    
    // Check if a submission already exists
    const existingSubmissionQuery = query(
      collection(db, SUBMISSION_COLLECTION),
      where('homeworkId', '==', homeworkId),
      where('studentEmail', '==', studentEmail)
    );
    
    const existingSubmissionSnapshot = await getDocs(existingSubmissionQuery);
    let submissionId: string = '';
    let isUpdate = false;
    
    if (!existingSubmissionSnapshot.empty) {
      // Update existing submission
      submissionId = existingSubmissionSnapshot.docs[0].id;
      isUpdate = true;
    }
    
    const submissionData: Partial<HomeworkSubmission> = {
      homeworkId,
      studentEmail,
      submittedAt: new Date(),
      updatedAt: new Date(),
      status: 'submitted'
    };
    
    // Add text response if provided
    if (textResponse !== undefined) {
      submissionData.textResponse = textResponse;
    }
    
    // Handle file uploads
    if (files && files.length > 0) {
      const uploadedFiles: { url: string; name: string; type: string; size: number }[] = [];
      
      for (const file of files) {
        // Validate file
        const validationError = validateHomeworkFile(file);
        if (validationError) {
          throw new Error(validationError);
        }
        
        // Create a clean filename
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const timestamp = Date.now();
        const finalFileName = `${timestamp}_${cleanFileName}`;
        
        // Create storage reference with path based on file type
        const fileCategory = getFileCategory(file.type);
        const storageRef = ref(storage, `submissions/${homeworkId}/${studentEmail}/${fileCategory}/${finalFileName}`);
        
        // Upload with metadata
        const metadata = {
          contentType: file.type,
          customMetadata: {
            originalName: file.name,
            uploadedAt: new Date().toISOString(),
            fileCategory,
            submittedBy: studentEmail
          }
        };
        
        await uploadBytes(storageRef, file, metadata);
        const downloadUrl = await getDownloadURL(storageRef);
        
        uploadedFiles.push({
          url: downloadUrl,
          name: file.name,
          type: file.type,
          size: file.size
        });
      }
      
      // Add files to submission data
      if (isUpdate) {
        // Get existing files if any
        const existingSubmission = existingSubmissionSnapshot.docs[0].data() as HomeworkSubmission;
        const existingFiles = existingSubmission.files || [];
        submissionData.files = [...existingFiles, ...uploadedFiles];
      } else {
        submissionData.files = uploadedFiles;
      }
    }
    
    // Save submission
    if (isUpdate) {
      await updateDoc(doc(db, SUBMISSION_COLLECTION, submissionId), submissionData);
    } else {
      const docRef = await addDoc(collection(db, SUBMISSION_COLLECTION), submissionData as HomeworkSubmission);
      submissionId = docRef.id;
    }
    
    // Invalidate the submissions cache
    invalidateCache(SUBMISSION_COLLECTION);
    
    // Notify about the change
    notifyHomeworkChange(classId);
    
    return submissionId;
  } catch (error) {
    console.error('Error submitting homework:', error);
    throw error;
  }
};

// Get student's submission for a homework assignment
export const getHomeworkSubmission = async (
  homeworkId: string,
  studentEmail: string
): Promise<HomeworkSubmission | null> => {
  try {
    const cacheKey = `${SUBMISSION_COLLECTION}_${homeworkId}_${studentEmail}`;
    const cached = getCached<HomeworkSubmission>(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    const q = query(
      collection(db, SUBMISSION_COLLECTION),
      where('homeworkId', '==', homeworkId),
      where('studentEmail', '==', studentEmail)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const doc = querySnapshot.docs[0];
    const data = doc.data();
    
    const submission: HomeworkSubmission = {
      ...data,
      id: doc.id,
      submittedAt: data.submittedAt.toDate(),
      updatedAt: data.updatedAt.toDate()
    } as HomeworkSubmission;
    
    setCached(cacheKey, submission);
    return submission;
  } catch (error) {
    console.error('Error getting homework submission:', error);
    throw error;
  }
};

// Get all submissions for a homework assignment (admin)
export const getHomeworkSubmissions = async (homeworkId: string): Promise<HomeworkSubmission[]> => {
  try {
    const cacheKey = `${SUBMISSION_COLLECTION}_${homeworkId}`;
    const cached = getCached<HomeworkSubmission[]>(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    const q = query(
      collection(db, SUBMISSION_COLLECTION),
      where('homeworkId', '==', homeworkId),
      orderBy('submittedAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const submissions: HomeworkSubmission[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      submissions.push({
        ...data,
        id: doc.id,
        submittedAt: data.submittedAt.toDate(),
        updatedAt: data.updatedAt.toDate()
      } as HomeworkSubmission);
    });
    
    setCached(cacheKey, submissions);
    return submissions;
  } catch (error) {
    console.error('Error getting homework submissions:', error);
    throw error;
  }
};

// Add feedback to a homework submission
export const addHomeworkFeedback = async (
  submissionId: string,
  feedback: string,
  grade?: string | null
): Promise<void> => {
  try {
    // Get the submission to find the homework and class
    const submissionSnap = await getDoc(doc(db, SUBMISSION_COLLECTION, submissionId));
    
    if (!submissionSnap.exists()) {
      throw new Error('Submission not found');
    }
    
    const submissionData = submissionSnap.data() as HomeworkSubmission;
    
    // Get the homework to retrieve the class ID
    const homeworkSnap = await getDoc(doc(db, HOMEWORK_COLLECTION, submissionData.homeworkId));
    
    if (!homeworkSnap.exists()) {
      throw new Error('Homework not found');
    }
    
    const homeworkData = homeworkSnap.data() as Homework;
    const classId = homeworkData.classId;
    
    // Update the submission with feedback
    await updateDoc(doc(db, SUBMISSION_COLLECTION, submissionId), {
      feedback,
      grade: grade || null,
      status: 'graded'
    });
    
    // Invalidate cache
    invalidateCache(SUBMISSION_COLLECTION);
    
    // Notify about the change
    notifyHomeworkChange(classId);
    
    console.log(`Feedback added to submission ${submissionId}`);
  } catch (error) {
    console.error('Error adding feedback:', error);
    throw error;
  }
};

// Clear homework cache
export const clearHomeworkCache = (): void => {
  clearCacheByPrefix(HOMEWORK_COLLECTION);
  clearCacheByPrefix(SUBMISSION_COLLECTION);
};

// Update a homework assignment
export const updateHomework = async (
  homeworkId: string,
  updateData: Partial<Homework>
): Promise<void> => {
  try {
    // Get the current homework data to retrieve class ID
    const homeworkSnap = await getDoc(doc(db, HOMEWORK_COLLECTION, homeworkId));
    
    if (!homeworkSnap.exists()) {
      throw new Error('Homework not found');
    }
    
    const homeworkData = homeworkSnap.data() as Homework;
    const classId = homeworkData.classId;
    
    // Update the homework document
    await updateDoc(doc(db, HOMEWORK_COLLECTION, homeworkId), {
      ...updateData,
      updatedAt: new Date()
    });
    
    // Invalidate cache
    invalidateCache(HOMEWORK_COLLECTION);
    
    // Notify about the change
    notifyHomeworkChange(classId);
  } catch (error) {
    console.error('Error updating homework:', error);
    throw error;
  }
}; 