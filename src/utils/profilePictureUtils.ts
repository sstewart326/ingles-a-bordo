import { storage } from '../config/firebase';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { logQuery } from './firebaseUtils';

const MAX_FILE_SIZE_MB = 2; // Maximum file size in megabytes
const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png'
];

/**
 * Validates a profile picture file
 * @param file The file to validate
 * @returns Error message if invalid, null if valid
 */
export const validateProfilePicture = (file: File): string | null => {
  // Check file size
  const fileSizeInMB = file.size / (1024 * 1024);
  if (fileSizeInMB > MAX_FILE_SIZE_MB) {
    return `File size must be less than ${MAX_FILE_SIZE_MB}MB`;
  }

  // Check file type
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return `File type "${file.type}" is not allowed. Allowed types are: JPG and PNG`;
  }

  return null;
};

/**
 * Uploads a profile picture to Firebase Storage
 * @param userId The user's ID (Firebase Auth UID)
 * @param file The image file to upload
 * @returns Promise that resolves to the download URL
 */
export const uploadProfilePicture = async (userId: string, file: File): Promise<string> => {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    if (!file) {
      throw new Error('File is required');
    }

    // Validate file
    const validationError = validateProfilePicture(file);
    if (validationError) {
      throw new Error(validationError);
    }

    // Determine file extension based on type
    const extension = file.type === 'image/png' ? 'png' : 'jpg';
    const fileName = `profile.${extension}`;

    // Create storage reference
    const storageRef = ref(storage, `profilePictures/${userId}/${fileName}`);
    
    logQuery('Uploading profile picture', { userId, fileName });

    // Upload with metadata
    const metadata = {
      contentType: file.type,
      customMetadata: {
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
        userId
      }
    };
    
    await uploadBytes(storageRef, file, metadata);
    logQuery('Getting download URL for profile picture', { userId, fileName });
    const downloadUrl = await getDownloadURL(storageRef);
    
    logQuery('Profile picture uploaded successfully', { userId, downloadUrl });
    return downloadUrl;
  } catch (error) {
    logQuery('Error uploading profile picture', { userId, error });
    console.error('Error uploading profile picture:', error);
    throw error;
  }
};

/**
 * Deletes a profile picture from Firebase Storage
 * @param userId The user's ID (Firebase Auth UID)
 * @param profilePictureUrl Optional URL of the profile picture to extract extension from
 * @returns Promise that resolves when deletion is complete
 */
export const deleteProfilePicture = async (userId: string, profilePictureUrl: string): Promise<void> => {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    let extension: string | null = null;
    const urlMatch = profilePictureUrl.match(/profile\.(jpg|jpeg|png)/i);
    if (urlMatch) {
      extension = urlMatch[1].toLowerCase();
      // Normalize jpeg to jpg
      if (extension === 'jpeg') {
        extension = 'jpg';
      }
    }

    // If we have a specific extension, delete only that file
    if (extension) {
      try {
        const storageRef = ref(storage, `profilePictures/${userId}/profile.${extension}`);
        await deleteObject(storageRef);
        logQuery(`Deleted profile picture: profile.${extension}`, { userId });
        return;
      } catch (error: any) {
        // If file doesn't exist, that's okay
        if (error?.code === 'storage/object-not-found') {
          logQuery(`Profile picture not found: profile.${extension}`, { userId });
          return;
        }
        throw error;
      }
    } else {
      logQuery('Extension could be resolved');
    }
  } catch (error) {
    logQuery('Error deleting profile picture', { userId, error });
    console.error('Error deleting profile picture:', error);
    throw error;
  }
};

