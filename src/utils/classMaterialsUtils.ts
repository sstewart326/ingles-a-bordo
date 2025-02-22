import { db, storage } from '../config/firebase';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  doc,
  updateDoc,
  Timestamp
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL
} from 'firebase/storage';
import { getCached, setCached, invalidateCache } from './cacheUtils';

interface ClassMaterial {
  classId: string;
  slides?: string; // URL to slides
  links?: string[];
  createdAt: Date;
  updatedAt: Date;
  classDate: Date; // The specific date this material is for
  studentEmails: string[]; // The specific students these materials are for
  studentIds?: string[]; // Keep for backward compatibility
}

const COLLECTION_PATH = 'classMaterials';
const MAX_FILE_SIZE_MB = 10; // Maximum file size in megabytes
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
];

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
  slideFile?: File,
  links?: string[]
): Promise<void> => {
  try {
    let slidesUrl = '';
    
    if (slideFile) {
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
        slidesUrl = await getDownloadURL(storageRef);
      } catch (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error('Failed to upload file to storage. Please try again.');
      }
    }

    const materialData: ClassMaterial = {
      classId,
      slides: slidesUrl || '',
      links: links || [],
      createdAt: new Date(),
      updatedAt: new Date(),
      classDate: classDate,
      studentEmails: studentEmails,
    };

    await addDoc(collection(db, COLLECTION_PATH), materialData);
    invalidateCache(COLLECTION_PATH);
  } catch (error) {
    console.error('Error adding class materials:', error);
    throw error;
  }
};

export const getClassMaterials = async (classId: string, classDate?: Date): Promise<ClassMaterial[]> => {
  try {
    if (!classId) {
      console.error('Invalid classId provided to getClassMaterials');
      return [];
    }

    // Check cache first
    const cacheKey = `${COLLECTION_PATH}_${classId}_${classDate?.toISOString() || 'all'}`;
    const cachedData = getCached<ClassMaterial[]>(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    let q = query(
      collection(db, COLLECTION_PATH),
      where('classId', '==', classId)
    );
    
    // If a specific date is provided, add date filter
    if (classDate && !isNaN(classDate.getTime())) {
      const startOfDay = new Date(classDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(classDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      q = query(
        collection(db, COLLECTION_PATH),
        where('classId', '==', classId),
        where('classDate', '>=', Timestamp.fromDate(startOfDay)),
        where('classDate', '<=', Timestamp.fromDate(endOfDay))
      );
    }
    
    const querySnapshot = await getDocs(q);
    const materials = querySnapshot.docs.map(doc => {
      const data = doc.data();
      // Handle potential missing date fields
      const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt);
      const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(data.updatedAt);
      const classDate = data.classDate instanceof Timestamp ? data.classDate.toDate() : new Date(data.classDate);
      
      return {
        ...data,
        createdAt,
        updatedAt,
        classDate,
      } as ClassMaterial;
    });

    // Sort by date descending
    materials.sort((a, b) => b.classDate.getTime() - a.classDate.getTime());

    // Cache the result
    setCached(cacheKey, materials, COLLECTION_PATH);
    return materials;
  } catch (error) {
    console.error('Error getting class materials:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to fetch class materials');
  }
};

export const updateClassMaterials = async (
  materialId: string,
  slideFile?: File,
  links?: string[]
): Promise<void> => {
  try {
    const docRef = doc(db, COLLECTION_PATH, materialId);
    const updates: Partial<ClassMaterial> = {
      updatedAt: new Date(),
    };

    if (slideFile) {
      const validationError = validateFile(slideFile);
      if (validationError) {
        throw new Error(validationError);
      }

      const storageRef = ref(storage, `slides/${materialId}/${slideFile.name}`);
      await uploadBytes(storageRef, slideFile);
      updates.slides = await getDownloadURL(storageRef);
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
    const classesSnapshot = await getDocs(classesQuery);
    const classIds = classesSnapshot.docs.map(doc => doc.id);

    if (classIds.length === 0) {
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
    console.error('Error getting student class materials:', error);
    throw error;
  }
}; 