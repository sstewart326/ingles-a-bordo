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
  getDownloadURL
} from 'firebase/storage';
import { getCached, setCached, invalidateCache } from './cacheUtils';
import { ClassMaterial } from '../types/interfaces';

const COLLECTION_PATH = 'classMaterials';
const MAX_FILE_SIZE_MB = 10; // Maximum file size in megabytes
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
];

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
  classDate: Date,
  studentEmails: string[],
  slideFiles?: File[],
  links?: string[]
): Promise<void> => {
  try {
    let slidesUrls: string[] = [];
    
    if (slideFiles && slideFiles.length > 0) {
      for (const slideFile of slideFiles) {
        const validationError = validateFile(slideFile);
        if (validationError) {
          throw new Error(validationError);
        }

        // Create a clean filename with date
        const dateStr = classDate.toISOString().split('T')[0];
        const cleanFileName = slideFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const timestamp = Date.now();
        const finalFileName = `${dateStr}_${timestamp}_${cleanFileName}`;

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
      classDate: classDate,
      studentEmails: studentEmails,
    };

    await addDoc(collection(db, COLLECTION_PATH), materialData);
    
    // Invalidate all caches related to this class
    invalidateCache(COLLECTION_PATH);
    
    // Also invalidate the specific class cache
    const cacheKey = `${COLLECTION_PATH}_${classId}_${classDate.toISOString()}`;
    invalidateCache(cacheKey);
    
    // And invalidate the "all" cache for this class
    const allCacheKey = `${COLLECTION_PATH}_${classId}_all`;
    invalidateCache(allCacheKey);
    
    logMaterialsUtil('Materials added successfully', { classId, classDate });
  } catch (error) {
    console.error('Error adding class materials:', error);
    throw error;
  }
};

export const getClassMaterials = async (
  classId: string,
  classDate?: Date
): Promise<ClassMaterial[]> => {
  try {
    if (!classId) {
      console.error('No class ID provided to getClassMaterials');
      return [];
    }

    // Check cache first
    const cacheKey = `${COLLECTION_PATH}_${classId}_all`;
    const cachedData = getCached<ClassMaterial[]>(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    // Always query by classId only, without date filtering
    const q = query(
      collection(db, COLLECTION_PATH),
      where('classId', '==', classId)
    );
    
    const querySnapshot = await getDocs(q);
    const materials = querySnapshot.docs.map(doc => {
      const data = doc.data();
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

    // Sort by date descending
    materials.sort((a, b) => b.classDate.getTime() - a.classDate.getTime());

    // Cache the result
    setCached(cacheKey, materials, COLLECTION_PATH);
    
    return materials;
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
    // Check cache first
    const cacheKey = `student_${COLLECTION_PATH}_${studentEmail}`;
    const cachedData = getCached<ClassMaterial[]>(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    // First get the student's classes
    const classesQuery = query(
      collection(db, 'classes'),
      where('studentEmails', 'array-contains', studentEmail)
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
        where('studentEmails', 'array-contains', studentEmail)
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
      await deleteDoc(docRef);
    } else {
      // Otherwise, update the document with the changes
      await updateDoc(docRef, updates);
    }
    
    // Invalidate cache after updating material
    invalidateCache(COLLECTION_PATH);
    
    logMaterialsUtil('Material item updated successfully', { classId, classDate, updateType });
  } catch (error) {
    console.error('Error updating class material item:', error);
    throw error;
  }
}; 