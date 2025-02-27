/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

admin.initializeApp();

interface DeleteUserRequest {
  userId: string;
}

interface CheckUserRequest {
  userId: string;
}

interface FirebaseAuthError extends Error {
  code: string;
}

function isFirebaseAuthError(error: unknown): error is FirebaseAuthError {
  return error instanceof Error && 'code' in error;
}

// Remove the region parameter definition and use direct string
const REGION = 'us-central1';

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

export const deleteAuthUser = onCall({
  enforceAppCheck: false,
  region: REGION,
  cors: ["ingles-a-bordo.firebaseapp.com", "ingles-a-bordo.web.app", "localhost", "http://localhost:5173", "https://app.inglesabordo.com"],
  maxInstances: 10
}, async (request) => {
  logger.info("deleteAuthUser function called", { userId: request.data.userId });

  // Check if the request is made by an authenticated user
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }

  // Get the caller's UID and check if they are an admin
  const callerUid = request.auth.uid;
  const callerQuery = await admin.firestore().collection('users')
    .where('uid', '==', callerUid)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (callerQuery.empty || !callerQuery.docs[0].data()?.isAdmin) {
    throw new HttpsError(
      'permission-denied',
      'Only admin users can delete other users.'
    );
  }

  const { userId } = request.data as DeleteUserRequest;
  if (!userId) {
    throw new HttpsError(
      'invalid-argument',
      'The function must be called with userId.'
    );
  }

  // Don't allow admin to delete themselves
  if (userId === callerUid) {
    throw new HttpsError(
      'failed-precondition',
      'Admin cannot delete their own account.'
    );
  }

  try {
    await admin.auth().deleteUser(userId);
    logger.info("User deleted successfully", { userId });
    return { success: true };
  } catch (error) {
    logger.error("Error deleting user:", error);
    throw new HttpsError(
      'internal',
      'Failed to delete user from Authentication.'
    );
  }
});

// Function to check if a user exists in Authentication
export const checkUserExists = onCall({
  enforceAppCheck: false,
  region: REGION,
  cors: ["ingles-a-bordo.firebaseapp.com", "ingles-a-bordo.web.app", "localhost", "http://localhost:5173", "https://app.inglesabordo.com"],
  maxInstances: 10
}, async (request) => {
  logger.info("checkUserExists function called", { userId: request.data.userId });

  // Check if the request is made by an authenticated user
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }

  // Get the caller's UID and check if they are an admin
  const callerUid = request.auth.uid;
  const callerQuery = await admin.firestore().collection('users')
    .where('uid', '==', callerUid)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (callerQuery.empty || !callerQuery.docs[0].data()?.isAdmin) {
    throw new HttpsError(
      'permission-denied',
      'Only admin users can check user existence.'
    );
  }

  const { userId } = request.data as CheckUserRequest;
  if (!userId) {
    throw new HttpsError(
      'invalid-argument',
      'The function must be called with userId.'
    );
  }

  try {
    await admin.auth().getUser(userId);
    logger.info("User exists", { userId });
    return { exists: true };
  } catch (error: unknown) {
    if (isFirebaseAuthError(error) && error.code === 'auth/user-not-found') {
      logger.info("User does not exist", { userId });
      return { exists: false };
    }
    logger.error("Error checking user existence:", error);
    throw new HttpsError('internal', 'Error checking user existence.');
  }
});
