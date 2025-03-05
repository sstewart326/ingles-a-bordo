/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as cors from 'cors';

admin.initializeApp();

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

// Initialize CORS middleware
const corsHandler = cors({
  origin: [
    "https://ingles-a-bordo.firebaseapp.com",
    "https://ingles-a-bordo.web.app",
    "http://localhost:5173",
    "http://localhost",
    "https://app.inglesabordo.com",
    "https://inglesabordo.com"
  ],
  methods: ['POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
});

// Keep the original functions but mark them as deprecated
export const deleteAuthUser = onCall({
  region: REGION,
  cors: [
    "https://ingles-a-bordo.firebaseapp.com",
    "https://ingles-a-bordo.web.app", 
    "http://localhost:5173",
    "http://localhost",
    "https://app.inglesabordo.com",
    "https://inglesabordo.com"
  ],
  maxInstances: 10
}, async (request: { data: any }) => {
  // Inform about deprecation
  logger.warn("This function is deprecated. Please use deleteAuthUserHttp instead.");
  throw new HttpsError('failed-precondition', 'This function is deprecated. Please use deleteAuthUserHttp instead.');
});

// Create new HTTP-based functions
export const deleteAuthUserHttp = onRequest({
  region: REGION,
  cors: true
}, async (request, response) => {
  // Handle CORS
  corsHandler(request, response, async () => {
    try {
      const { userId } = request.body;

      if (!userId) {
        response.status(400).json({ error: 'User ID is required' });
        return;
      }

      try {
        await admin.auth().deleteUser(userId);
        response.status(200).json({ success: true });
      } catch (error) {
        logger.error("Error deleting user:", error);
        response.status(500).json({ error: 'Failed to delete user from Authentication.' });
      }
    } catch (error) {
      logger.error("Error in deleteAuthUser:", error);
      response.status(500).json({ error: 'Internal server error' });
    }
  });
});

// Keep the original checkUserExists but mark it as deprecated
export const checkUserExists = onCall({
  region: REGION,
  cors: [
    "https://ingles-a-bordo.firebaseapp.com",
    "https://ingles-a-bordo.web.app", 
    "http://localhost:5173",
    "http://localhost",
    "https://app.inglesabordo.com",
    "https://inglesabordo.com"
  ],
  maxInstances: 10
}, async (request: { data: any }) => {
  // Inform about deprecation
  logger.warn("This function is deprecated. Please use checkUserExistsHttp instead.");
  throw new HttpsError('failed-precondition', 'This function is deprecated. Please use checkUserExistsHttp instead.');
});

// Create new HTTP-based function for checking user existence
export const checkUserExistsHttp = onRequest({
  region: REGION,
  cors: true
}, async (request, response) => {
  // Handle CORS
  corsHandler(request, response, async () => {
    try {
      const { userId } = request.body;

      if (!userId) {
        response.status(400).json({ error: 'User ID is required' });
        return;
      }

      try {
        await admin.auth().getUser(userId);
        response.status(200).json({ exists: true });
      } catch (error: unknown) {
        if (isFirebaseAuthError(error) && error.code === 'auth/user-not-found') {
          response.status(200).json({ exists: false });
        } else {
          logger.error("Error checking user existence:", error);
          response.status(500).json({ error: 'Error checking user existence.' });
        }
      }
    } catch (error) {
      logger.error("Error in checkUserExists:", error);
      response.status(500).json({ error: 'Internal server error' });
    }
  });
});
