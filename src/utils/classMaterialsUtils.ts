import { db, storage } from '../config/firebase';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  doc,
  updateDoc,
  Timestamp,
  deleteDoc
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { getCached, setCached, invalidateCache, clearCacheByPrefix } from './cacheUtils';
import { ClassMaterial } from '../types/interfaces';
import { logQuery } from './firebaseUtils';

const COLLECTION_PATH = 'classMaterials';
const MAX_FILE_SIZE_MB = 10; // Maximum file size in megabytes
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
];

// Add a map to track in-flight requests
const inFlightRequests: Record<string, Promise<ClassMaterial[]>> = {};

/**
 * Deletes a file from Firebase Storage using its URL
 * @param url The Firebase Storage URL of the file to delete
 * @returns A promise that resolves when the file is deleted, or rejects with an error
 */
const deleteFileFromStorage = async (url: string): Promise<void> => {
  try {
    const fileRef = ref(storage, url);
    await deleteObject(fileRef);
    logMaterialsUtil(`File deleted from storage: ${fileRef.fullPath}`);
  } catch (error) {
    console.error('Error during file deletion:', error);
    throw error;
  }
};

/**
 * Deletes multiple files from Firebase Storage
 * @param urls Array of Firebase Storage URLs to delete
 * @returns A promise that resolves when all files are processed
 */
const deleteMultipleFilesFromStorage = async (urls: string[]): Promise<void> => {
  if (!urls || urls.length === 0) {
    return;
  }
  
  // Process each URL and collect results
  const results = await Promise.allSettled(
    urls.map(url => deleteFileFromStorage(url))
  );
  
  const successCount = results.filter(r => r.status === 'fulfilled').length;
  logMaterialsUtil(`Deleted ${successCount}/${urls.length} files from storage`);
};

const logMaterialsUtil = (message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[MATERIALS-UTIL] ${message}`, data ? data : '');
  }
};

export const validateFile = (file: File): string | null => {
  // Check file size
  const fileSizeInMB = file.size / (1024 * 1024);
  if (fileSizeInMB > MAX_FILE_SIZE_MB) {
    return `File size must be less than ${MAX_FILE_SIZE_MB}MB`;
  }

  // Check file type
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return `File type "${file.type}" is not allowed. Allowed types are: PDF and PowerPoint files`;
  }

  return null;
};

export const addClassMaterials = async (
  classId: string,
  dateObj: Date,
  slideFiles?: File[],
  links?: string[],
  studentEmails?: string[],
  teacherId?: string
): Promise<void> => {
  try {
    if (!classId || !dateObj) {
      throw new Error('Class ID and date are required');
    }

    if (!teacherId) {
      throw new Error('Teacher ID is required');
    }

    const slidesUrls: string[] = [];
    
    if (slideFiles && slideFiles.length > 0) {
      for (const slideFile of slideFiles) {
        const validationError = validateFile(slideFile);
        if (validationError) {
          throw new Error(validationError);
        }

        // Create a clean filename with date
        const cleanFileName = slideFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const timestamp = Date.now();
        const finalFileName = `${dateObj.toISOString().split('T')[0]}_${timestamp}_${cleanFileName}`;

        // Create storage reference with cleaned filename
        const storageRef = ref(storage, `slides/${classId}/${finalFileName}`);
        
        try {
          // Upload with metadata
          const metadata = {
            contentType: slideFile.type,
            customMetadata: {
              originalName: slideFile.name,
              uploadedAt: new Date().toISOString()
            }
          };
          
          await uploadBytes(storageRef, slideFile, metadata);
          const downloadUrl = await getDownloadURL(storageRef);
          slidesUrls.push(downloadUrl);
        } catch (uploadError) {
          console.error('Storage upload error:', uploadError);
          throw new Error('Failed to upload file to storage. Please try again.');
        }
      }
    }

    const materialData: ClassMaterial = {
      classId,
      slides: slidesUrls,
      links: links || [],
      createdAt: new Date(),
      updatedAt: new Date(),
      classDate: dateObj,
      studentEmails: studentEmails || [],
      teacherId,
      month: `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`
    };

    await addDoc(collection(db, COLLECTION_PATH), materialData);
    
    // Invalidate all caches related to this class
    invalidateCache(COLLECTION_PATH);
    
    // Also invalidate the specific class cache
    const cacheKey = `${COLLECTION_PATH}_${classId}_${dateObj.toISOString()}`;
    invalidateCache(cacheKey);
    
    // And invalidate the "all" cache for this class
    const allCacheKey = `${COLLECTION_PATH}_${classId}_all`;
    invalidateCache(allCacheKey);
    
    logMaterialsUtil('Materials added successfully', { classId, dateObj });
  } catch (error) {
    console.error('Error adding class materials:', error);
    throw error;
  }
};

export const getClassMaterials = async (
  classId: string,
  specificDate?: Date,
  teacherId?: string
): Promise<ClassMaterial[]> => {
  try {
    // If we have a teacherId and specificDate, construct the month key
    let monthKey = '';
    if (teacherId && specificDate) {
      monthKey = `${specificDate.getFullYear()}-${String(specificDate.getMonth() + 1).padStart(2, '0')}`;
    }
    
    // Construct cache key based on the query parameters
    let cacheKey: string;
    if (teacherId && monthKey) {
      cacheKey = `${COLLECTION_PATH}_teacher_${teacherId}_month_${monthKey}`;
    } else if (classId) {
      cacheKey = `${COLLECTION_PATH}_class_${classId}`;
    } else {
      cacheKey = `${COLLECTION_PATH}_all`;
    }
    
    // Check cache first
    const cachedData = getCached<ClassMaterial[]>(cacheKey);
    if (cachedData) {
      logQuery('Using cached class materials', { 
        teacherId: teacherId, 
        month: monthKey,
        classId: classId,
        cacheHit: true
      });
      return cachedData;
    }
    
    // Check if there's already an in-flight request for this cache key
    if (cacheKey in inFlightRequests) {
      logQuery('Reusing in-flight request for class materials', { 
        teacherId: teacherId, 
        month: monthKey,
        classId: classId,
        deduped: true
      });
      return inFlightRequests[cacheKey];
    }
    
    // Create a new promise for this request
    const fetchPromise = (async () => {
      // Define the query based on the parameters
      let q;
      if (teacherId && specificDate) {
        // If we have a teacherId and specificDate, query by month
        logQuery('Querying class materials', { teacherId: teacherId, month: monthKey });
        q = query(
          collection(db, COLLECTION_PATH),
          where('teacherId', '==', teacherId),
          where('month', '==', monthKey)
        );
      } else if (classId) {
        // Fallback to querying by classId
        logQuery('Querying class materials', { classId: classId });
        q = query(
          collection(db, COLLECTION_PATH),
          where('classId', '==', classId)
        );
      } else {
        // No valid query parameters
        return [];
      }

      const querySnapshot = await getDocs(q);
      const materials = querySnapshot.docs.map(doc => {
        const data = doc.data();
        // Only log the query result if we're using classId
        if (classId) {
          logQuery('Class Materials Query result', { classId: data.classId, size: querySnapshot.docs.length });
        }

        // Handle potential missing date fields
        const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt);
        const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(data.updatedAt);
        const classDate = data.classDate instanceof Timestamp ? data.classDate.toDate() : new Date(data.classDate);
        
        return {
          ...data,
          id: doc.id,
          createdAt,
          updatedAt,
          classDate,
        } as unknown as ClassMaterial;
      });

      // Filter by specific date if provided and we're not using month-based query
      let filteredMaterials = materials;
      if (specificDate && !teacherId) {
        const targetDate = new Date(specificDate);
        targetDate.setHours(0, 0, 0, 0);
        
        filteredMaterials = materials.filter(material => {
          const materialDate = new Date(material.classDate);
          materialDate.setHours(0, 0, 0, 0);
          
          return materialDate.getFullYear() === targetDate.getFullYear() &&
                materialDate.getMonth() === targetDate.getMonth() &&
                materialDate.getDate() === targetDate.getDate();
        });
      }

      // Sort by date descending
      filteredMaterials.sort((a, b) => b.classDate.getTime() - a.classDate.getTime());

      // Cache the result
      setCached(cacheKey, filteredMaterials, COLLECTION_PATH);
      
      return filteredMaterials;
    })();
    
    // Store the promise in the in-flight requests map
    inFlightRequests[cacheKey] = fetchPromise;
    
    // Clean up the in-flight request map after the request completes
    fetchPromise.finally(() => {
      // Remove this request from the in-flight map after a short delay
      // This delay ensures that very close concurrent requests still get deduped
      setTimeout(() => {
        delete inFlightRequests[cacheKey];
      }, 500);
    });
    
    return fetchPromise;
  } catch (error) {
    console.error('Error getting class materials:', error);
    return [];
  }
};

export const updateClassMaterials = async (
  materialId: string,
  slideFiles?: File[],
  links?: string[]
): Promise<void> => {
  try {
    const docRef = doc(db, COLLECTION_PATH, materialId);
    const updates: Partial<ClassMaterial> = {
      updatedAt: new Date(),
    };

    if (slideFiles && slideFiles.length > 0) {
      const slidesUrls: string[] = [];
      
      for (const slideFile of slideFiles) {
        const validationError = validateFile(slideFile);
        if (validationError) {
          throw new Error(validationError);
        }

        const storageRef = ref(storage, `slides/${materialId}/${slideFile.name}`);
        await uploadBytes(storageRef, slideFile);
        const downloadUrl = await getDownloadURL(storageRef);
        slidesUrls.push(downloadUrl);
      }
      
      updates.slides = slidesUrls;
    }

    if (links) {
      updates.links = links;
    }

    await updateDoc(docRef, updates);
    // Invalidate cache after updating materials
    invalidateCache(COLLECTION_PATH);
  } catch (error) {
    console.error('Error updating class materials:', error);
    throw error;
  }
};

export const deleteClassMaterial = async (
  classId: string,
  classDate: Date
): Promise<void> => {
  try {
    if (!classId || !classDate) {
      throw new Error('Invalid parameters: classId and classDate are required');
    }

    // Create date range for the query
    const startOfDay = new Date(classDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(classDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Query to find the exact document
    const materialsQuery = query(
      collection(db, COLLECTION_PATH),
      where('classId', '==', classId),
      where('classDate', '>=', Timestamp.fromDate(startOfDay)),
      where('classDate', '<=', Timestamp.fromDate(endOfDay))
    );
    
    const querySnapshot = await getDocs(materialsQuery);
    
    if (querySnapshot.empty) {
      throw new Error('Material not found');
    }
    
    // Delete the document
    const docId = querySnapshot.docs[0].id;
    await deleteDoc(doc(db, COLLECTION_PATH, docId));
    
    // Invalidate cache after deleting material
    invalidateCache(COLLECTION_PATH);
    
    logMaterialsUtil('Material deleted successfully', { classId, classDate });
  } catch (error) {
    console.error('Error deleting class material:', error);
    throw error;
  }
};

export const getStudentClassMaterials = async (studentEmail: string): Promise<ClassMaterial[]> => {
  try {
    // Check if we're masquerading
    let masqueradingEmail = null;
    const masqueradeUserStr = sessionStorage.getItem('masqueradeUser');
    if (masqueradeUserStr) {
      try {
        const masqueradeUser = JSON.parse(masqueradeUserStr);
        if (masqueradeUser && masqueradeUser.email) {
          // If masquerading, use the masqueraded user's email
          masqueradingEmail = masqueradeUser.email;
          logMaterialsUtil('Using masqueraded user email for materials:', masqueradingEmail);
        }
      } catch (error) {
        console.error('Error parsing masquerade user from session storage:', error);
      }
    }

    // Use masqueraded email if available, otherwise use provided email
    const emailToUse = masqueradingEmail || studentEmail;
    
    // Check cache first
    const cacheKey = `student_${COLLECTION_PATH}_${emailToUse}`;
    const cachedData = getCached<ClassMaterial[]>(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    // First get the student's classes
    const classesQuery = query(
      collection(db, 'classes'),
      where('studentEmails', 'array-contains', emailToUse)
    );
    
    try {
      const classesSnapshot = await getDocs(classesQuery);
      const classIds = classesSnapshot.docs.map(doc => doc.id);

      if (classIds.length === 0) {
        // Return empty array if student has no classes
        return [];
      }

      // Then get materials for all their classes where they are specifically included
      const materialsQuery = query(
        collection(db, COLLECTION_PATH),
        where('classId', 'in', classIds),
        where('studentEmails', 'array-contains', emailToUse)
      );

      const materialsSnapshot = await getDocs(materialsQuery);

      const materials = materialsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          createdAt: data.createdAt.toDate(),
          updatedAt: data.updatedAt.toDate(),
          classDate: data.classDate.toDate(),
        } as ClassMaterial;
      });

      // Sort by date descending
      materials.sort((a, b) => b.classDate.getTime() - a.classDate.getTime());

      // Cache the result
      setCached(cacheKey, materials, COLLECTION_PATH);
      return materials;
    } catch (error) {
      // If there's a permissions error, it likely means the student has no access
      // Just return empty array instead of throwing
      logMaterialsUtil('No classes or materials found:', error);
      return [];
    }
  } catch (error) {
    // Only log as error if it's not a permission issue
    if (error instanceof Error && !error.message.includes('permission')) {
      logMaterialsUtil('Error getting student class materials:', error);
    }
    // Return empty array instead of throwing
    return [];
  }
};

export const updateClassMaterialItem = async (
  classId: string,
  classDate: Date,
  updateType: 'removeSlides' | 'removeLink',
  linkIndex?: number,
  slideIndex?: number
): Promise<void> => {
  try {
    if (!classId || !classDate) {
      throw new Error('Invalid parameters: classId and classDate are required');
    }

    // Create date range for the query
    const startOfDay = new Date(classDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(classDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Query to find the exact document
    const materialsQuery = query(
      collection(db, COLLECTION_PATH),
      where('classId', '==', classId),
      where('classDate', '>=', Timestamp.fromDate(startOfDay)),
      where('classDate', '<=', Timestamp.fromDate(endOfDay))
    );
    
    const querySnapshot = await getDocs(materialsQuery);
    
    if (querySnapshot.empty) {
      throw new Error('Material not found');
    }
    
    const docId = querySnapshot.docs[0].id;
    const docRef = doc(db, COLLECTION_PATH, docId);
    const materialData = querySnapshot.docs[0].data() as ClassMaterial;
    
    const updates: Partial<ClassMaterial> = {
      updatedAt: new Date()
    };
    
    if (updateType === 'removeSlides' && typeof slideIndex === 'number' && materialData.slides) {
      // Get the storage URL before removing it from the array
      const slideUrl = materialData.slides[slideIndex];
      
      // Try to delete from storage if it's a valid URL
      if (slideUrl) {
        try {
          console.log('Attempting to delete file with URL:', slideUrl);
          await deleteFileFromStorage(slideUrl);
        } catch (storageError) {
          console.error('Error deleting file from storage:', storageError);
          console.error('Problematic URL:', slideUrl);
        }
      }
      
      // Remove the specific slide at the given index
      const updatedSlides = [...materialData.slides];
      updatedSlides.splice(slideIndex, 1);
      updates.slides = updatedSlides;
    } else if (updateType === 'removeLink' && typeof linkIndex === 'number' && materialData.links) {
      // Remove the specific link at the given index
      const updatedLinks = [...materialData.links];
      updatedLinks.splice(linkIndex, 1);
      updates.links = updatedLinks;
    }
    
    // Check if this would leave the document empty (no slides and no links)
    const wouldBeEmpty = 
      (updateType === 'removeSlides' && materialData.slides && materialData.slides.length === 1 && (!materialData.links || materialData.links.length === 0)) ||
      (updateType === 'removeLink' && (!materialData.slides || materialData.slides.length === 0) && materialData.links && materialData.links.length === 1);
    
    if (wouldBeEmpty) {
      // If removing this item would leave the document empty, delete the entire document
      // But first, try to delete any remaining storage files
      if (materialData.slides && materialData.slides.length > 0) {
        try {
          // Delete all slides associated with this document
          await deleteMultipleFilesFromStorage(materialData.slides);
        } catch (storageError) {
          console.error('Error deleting files from storage:', storageError);
        }
      }
      
      await deleteDoc(docRef);
      logMaterialsUtil('Deleted empty material document');
    } else {
      // Otherwise, update the document with the changes
      await updateDoc(docRef, updates);
      logMaterialsUtil('Updated material document');
    }
    
    // Invalidate cache after updating material
    invalidateCache(COLLECTION_PATH);
  } catch (error) {
    console.error('Error updating class material item:', error);
    throw error;
  }
};

/**
 * Deletes all materials for a class, including all storage files
 * @param classId The ID of the class
 * @returns A promise that resolves when all materials are deleted
 */
export const deleteAllClassMaterials = async (classId: string): Promise<void> => {
  if (!classId) {
    throw new Error('Class ID is required');
  }
  
  try {
    logMaterialsUtil(`Attempting to delete all materials for class: ${classId}`);
    
    // Query for all materials for this class
    const materialsQuery = query(
      collection(db, COLLECTION_PATH),
      where('classId', '==', classId)
    );
    
    const querySnapshot = await getDocs(materialsQuery);
    
    if (querySnapshot.empty) {
      logMaterialsUtil(`No materials found for class: ${classId}`);
      return;
    }
    
    // Process each document
    for (const docSnapshot of querySnapshot.docs) {
      const materialData = docSnapshot.data() as ClassMaterial;
      
      // Delete all slides from storage
      if (materialData.slides && materialData.slides.length > 0) {
        try {
          await deleteMultipleFilesFromStorage(materialData.slides);
        } catch (storageError) {
          console.error(`Error deleting files for document ${docSnapshot.id}:`, storageError);
        }
      }
      
      // Delete the document from Firestore
      await deleteDoc(docSnapshot.ref);
    }
    
    // Invalidate cache
    invalidateCache(COLLECTION_PATH);
    
    // Dispatch event to notify the UI
    window.dispatchEvent(new CustomEvent('materials-updated', { 
      detail: { 
        classId,
        timestamp: new Date().getTime(),
        action: 'delete-all'
      } 
    }));
  } catch (error) {
    console.error(`Error deleting all materials for class ${classId}:`, error);
    throw error;
  }
};

/**
 * Clears the class materials cache
 */
export const clearMaterialsCache = () => {
  clearCacheByPrefix(COLLECTION_PATH);
}; 