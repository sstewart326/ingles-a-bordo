/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { onRequest } from "firebase-functions/v2/https";
import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { corsHandler, REGION } from "./functionsUtil";

admin.initializeApp();

// Helper function to get payment app credentials
function getPaymentAppCredentials() {
  // Use environment variables (required for Firebase Functions v2)
  const payProjectId = process.env.PAY_PROJECT_ID;
  const payPrivateKey = process.env.PAY_PRIVATE_KEY;
  const payClientEmail = process.env.PAY_CLIENT_EMAIL;

  if (!payProjectId || !payPrivateKey || !payClientEmail) {
    logger.error('Missing payment app credentials in environment variables');
    throw new Error('Missing payment app credentials. Please set PAY_PROJECT_ID, PAY_PRIVATE_KEY, and PAY_CLIENT_EMAIL environment variables.');
  }

  return {
    projectId: payProjectId,
    privateKey: payPrivateKey.replace(/\\n/g, '\n'),
    clientEmail: payClientEmail
  };
}

// Lazy initialization of payment app
let paymentApp: admin.app.App | null = null;

function getPaymentApp(): admin.app.App {
  if (!paymentApp) {
    try {
      const credentials = getPaymentAppCredentials();
      paymentApp = admin.initializeApp({
        credential: admin.credential.cert(credentials),
      }, 'paymentApp');
    } catch (error) {
      logger.error('Failed to initialize payment app:', error);
      throw error;
    }
  }
  return paymentApp;
}

interface FirebaseAuthError extends Error {
  code: string;
}

function isFirebaseAuthError(error: unknown): error is FirebaseAuthError {
  return error instanceof Error && 'code' in error;
}

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// Create HTTP-based functions
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

export const exchangeTokenForPayment = onRequest({
  region: REGION,
  cors: true
}, async (request, response) => {
  // Handle CORS
  corsHandler(request, response, async () => {
    try {
      // Get the authorization header
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        response.status(401).json({ error: 'Unauthorized - No valid token provided' });
        return;
      }

      // Extract the token
      const idToken = authHeader.split('Bearer ')[1];
      
      // Verify the token
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;

      // Get payment app (lazy initialization)
      let paymentAppInstance: admin.app.App;
      try {
        paymentAppInstance = getPaymentApp();
      } catch (error) {
        logger.error('Payment app initialization failed:', error);
        response.status(500).json({ error: 'Payment service not available' });
        return;
      }

      // Create custom token for the Payment App
      const customToken = await paymentAppInstance.auth().createCustomToken(uid)

      response.status(200).json({ customToken });
    } catch (error) {
      logger.error('Token exchange error:', error);
      response.status(500).json({ error: 'Failed to create token' });
    }
  });
});

// Create HTTP-based function for checking user existence
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

// Add these interfaces at the top of the file, after the existing interfaces
interface Schedule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
}

/**
 * Represents a historical version of a class schedule.
 * Used for preserving schedule history when permanent changes are made.
 */
interface ScheduleVersion {
  version: number;            // Incrementing int (1, 2, 3, ...)
  effectiveFrom: Date;        // When this schedule version starts
  scheduleType: 'single' | 'multiple';
  schedules: Schedule[];      // The schedule(s) for this version
  timezone: string;
  frequency: {
    type: 'weekly' | 'biweekly' | 'custom';
    every: number;
  };
}

/**
 * Represents a one-off exception to a class schedule.
 * Used for cancellations and reschedules.
 */
interface ClassException {
  id: string;
  classId: string;
  originalDate: string | null;  // YYYY-MM-DD format, null for reschedules without an original date
  type: 'cancelled' | 'rescheduled';
  originalStartTime: string;  // Original start time of the class
  originalEndTime: string;  // Original end time of the class
  // For rescheduled:
  newDate?: string;  // YYYY-MM-DD format
  newStartTime?: string;
  newEndTime?: string;
  reason?: string;
  timezone: string;  // Timezone identifier (e.g., "America/New_York", "UTC")
  createdAt: Date;
  createdBy: string;
}

/**
 * Represents a calculated class date with optional exception metadata.
 */
interface CalculatedClassDate {
  date: Date;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  isCancelled?: boolean;
  isRescheduled?: boolean;
  originalDate?: string | null;  // For rescheduled classes, shows where it came from (YYYY-MM-DD format)
  originalStartTime?: string;  // Original start time of the rescheduled class
  originalEndTime?: string;  // Original end time of the rescheduled class
  reason?: string;
}

interface ClassInfo {
  id: string;
  dayOfWeek: number;
  daysOfWeek?: number[];
  courseType: string;
  notes?: string;
  studentEmails: string[];
  students: Array<{ name?: string; email: string }>;
  startDate: Date | null;
  endDate: Date | null;
  recurrencePattern: string;
  recurrenceInterval: number;
  paymentConfig: any;
  dates: Date[];
  timezone: string;
  scheduleType: 'single' | 'multiple';
  schedules?: Schedule[];
  startTime?: string;
  endTime?: string;
  frequency?: {
    type: string;
    every: number;
  };
  paymentDueDates?: Date[];
  scheduleHistory?: ScheduleVersion[];
}

/**
 * Get class schedule for a specific month and year
 * This function handles the complex class mapping date logic
 */
export const getClassScheduleHttp = onRequest({
  region: REGION,
  cors: true
}, async (request, response) => {
  // Handle CORS
  corsHandler(request, response, async () => {
    try {
      const { month, year, userId, email } = request.query;

      // Validate required parameters
      if (!month || !year) {
        response.status(400).json({ error: 'Month and year are required' });
        return;
      }

      // Either userId or email must be provided
      if (!userId && !email) {
        response.status(400).json({ error: 'Either userId or email is required' });
        return;
      }

      // Parse month and year to integers
      const monthInt = parseInt(month as string);
      const yearInt = parseInt(year as string);

      // Validate month and year
      if (isNaN(monthInt) || monthInt < 0 || monthInt > 11) {
        response.status(400).json({ error: 'Invalid month. Must be between 0 and 11.' });
        return;
      }

      if (isNaN(yearInt) || yearInt < 2000 || yearInt > 2100) {
        response.status(400).json({ error: 'Invalid year. Must be between 2000 and 2100.' });
        return;
      }

      // Create date range for the requested month
      const startDate = new Date(yearInt, monthInt, 1);
      const endDate = new Date(yearInt, monthInt + 1, 0); // Last day of the month

      // Query classes based on user identifier
      let classesQuery: admin.firestore.Query;
      if (email) {
        classesQuery = admin.firestore().collection('classes')
          .where('studentEmails', 'array-contains', email);
      } else {
        classesQuery = admin.firestore().collection('classes')
          .where('studentIds', 'array-contains', userId);
      }

      const classesSnapshot = await classesQuery.get();

      if (classesSnapshot.empty) {
        response.status(200).json({ classes: [] });
        return;
      }

      // Get user data for payment configuration
      let userData = null;
      let userEmail = null;

      if (email) {
        userEmail = email as string;
        const usersSnapshot = await admin.firestore().collection('users')
          .where('email', '==', userEmail)
          .limit(1)
          .get();

        if (!usersSnapshot.empty) {
          userData = usersSnapshot.docs[0].data();
        }
      } else if (userId) {
        const userDoc = await admin.firestore().collection('users').doc(userId as string).get();
        if (userDoc.exists) {
          userData = userDoc.data();
        }
      }

      // Process classes and map them to dates
      const classSchedule = [];
      const paymentDueDates = [];

      // Process classes with exception support
      const classProcessingPromises = classesSnapshot.docs.map(async (doc) => {
        const classData = doc.data();
        const classId = doc.id;

        // Skip classes that have ended before the requested month
        if (classData.endDate && classData.endDate.toDate() < startDate) {
          return null;
        }

        // Skip classes that start after the requested month
        if (classData.startDate && classData.startDate.toDate() > endDate) {
          return null;
        }

        // Get the actual start date to use (either class start date or month start)
        const effectiveStartDate = classData.startDate && classData.startDate.toDate() > startDate
          ? classData.startDate.toDate()
          : new Date(startDate);

        // Get the actual end date to use (either class end date or month end)
        const effectiveEndDate = classData.endDate && classData.endDate.toDate() < endDate
          ? classData.endDate.toDate()
          : new Date(endDate);

        // Calculate class dates with exception support
        const calculatedDates = await calculateClassDatesWithExceptions(
          classData,
          effectiveStartDate,
          effectiveEndDate,
          classId
        );

        if (calculatedDates.length === 0) {
          return null;
        }

        // Extract just the Date objects for backward compatibility
        const classDates = calculatedDates.map(cd => cd.date);

        // Calculate payment due dates
        const paymentDates = calculatePaymentDueDates(
          classData,
          userData,
          startDate,
          endDate
        );

        return {
          classInfo: {
            id: classId,
            dayOfWeek: classData.dayOfWeek,
            daysOfWeek: classData.daysOfWeek,
            startTime: classData.startTime,
            endTime: classData.endTime,
            courseType: classData.courseType,
            notes: classData.notes,
            studentEmails: classData.studentEmails,
            startDate: classData.startDate ? classData.startDate.toDate() : null,
            endDate: classData.endDate ? classData.endDate.toDate() : null,
            recurrencePattern: classData.recurrencePattern || 'weekly',
            recurrenceInterval: classData.recurrenceInterval || 1,
            paymentConfig: classData.paymentConfig || {
              type: 'monthly',
              monthlyOption: 'first',
              startDate: classData.startDate ? classData.startDate.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
            },
            dates: classDates,
            calculatedDates, // Include full exception metadata
            paymentDueDates: paymentDates,
            timezone: classData.timezone || 'UTC',
            scheduleType: classData.scheduleType || 'single',
            schedules: classData.schedules || []
          },
          paymentEntries: paymentDates.map(date => ({
            date,
            paymentLink: classData.paymentConfig?.paymentLink || null,
            amount: classData.paymentConfig?.amount || null
          }))
        };
      });

      const processedResults = await Promise.all(classProcessingPromises);

      // Process results
      for (const result of processedResults) {
        if (result) {
          classSchedule.push(result.classInfo);
          paymentDueDates.push(...result.paymentEntries);
        }
      }

      response.status(200).json({
        classes: classSchedule,
        paymentDueDates: paymentDueDates.sort((a, b) => a.date.getTime() - b.date.getTime()),
        month: monthInt,
        year: yearInt
      });
    } catch (error) {
      logger.error("Error in getClassSchedule:", error);
      response.status(500).json({ error: 'Internal server error' });
    }
  });
});

/**
 * Fetches class exceptions for a date range from Firestore.
 * Uses two parallel queries to catch all relevant exceptions:
 * 1. Exceptions where originalDate is in range (cancellations, reschedules from this period)
 * 2. Exceptions where newDate is in range (reschedules landing in this period)
 */
async function fetchClassExceptions(
  classId: string,
  startDate: Date,
  endDate: Date
): Promise<ClassException[]> {
  try {
    const exceptionsRef = admin.firestore()
      .collection('classes')
      .doc(classId)
      .collection('classExceptions');

    // Convert dates to YYYY-MM-DD strings for querying
    const startDateString = startDate.toISOString().split('T')[0];
    const endDateString = endDate.toISOString().split('T')[0];

    // Query 1: Exceptions where originalDate is in range
    const byOriginalDateQuery = exceptionsRef
      .where('originalDate', '>=', startDateString)
      .where('originalDate', '<=', endDateString);

    // Query 2: Exceptions where newDate is in range
    const byNewDateQuery = exceptionsRef
      .where('newDate', '>=', startDateString)
      .where('newDate', '<=', endDateString);

    // Run in parallel
    const [byOriginalSnapshot, byNewSnapshot] = await Promise.all([
      byOriginalDateQuery.get(),
      byNewDateQuery.get(),
    ]);

    // Deduplicate by document ID (a reschedule within the same month appears in both)
    const exceptionsMap = new Map<string, ClassException>();

    const processDoc = (doc: admin.firestore.QueryDocumentSnapshot) => {
      const data = doc.data();
      const exception: ClassException = {
        id: doc.id,
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
        createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
        createdBy: data.createdBy,
      };
      exceptionsMap.set(doc.id, exception);
    };

    byOriginalSnapshot.docs.forEach(processDoc);
    byNewSnapshot.docs.forEach(processDoc);

    return Array.from(exceptionsMap.values());
  } catch (error) {
    logger.error('Error fetching class exceptions:', { classId, error });
    return []; // Return empty array on error to not break date calculation
  }
}

/**
 * Builds lookup maps from exceptions for efficient O(1) access during date iteration.
 * Dates are already stored as YYYY-MM-DD strings, so we can use them directly as map keys.
 */
function buildExceptionMaps(exceptions: ClassException[]): {
  byOriginalDate: Map<string, ClassException>;
  byNewDate: Map<string, ClassException>;
} {
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
}

/**
 * Gets the appropriate schedule version for a specific date.
 * If the class has schedule history, finds the version that was effective on the given date.
 * Otherwise, uses the current schedule fields.
 * 
 * Note: This function is prepared for future schedule versioning support.
 * Uncomment when historical schedule display is needed.
 *
 * function getScheduleForDate(classData: any, date: Date): {
 *   scheduleType: 'single' | 'multiple';
 *   schedules: Schedule[];
 *   dayOfWeek: number;
 *   startTime: string;
 *   endTime: string;
 *   timezone: string;
 *   frequency: { type: string; every: number };
 * } | null {
 *   // Check if class has schedule history
 *   if (classData.scheduleHistory && Array.isArray(classData.scheduleHistory) && classData.scheduleHistory.length > 0) {
 *     // Sort by effectiveFrom descending to find the most recent applicable version
 *     const sortedHistory = [...classData.scheduleHistory].sort((a: any, b: any) => {
 *       const dateA = a.effectiveFrom instanceof Date ? a.effectiveFrom : a.effectiveFrom.toDate();
 *       const dateB = b.effectiveFrom instanceof Date ? b.effectiveFrom : b.effectiveFrom.toDate();
 *       return dateB.getTime() - dateA.getTime();
 *     });
 *
 *     // Find the version that was effective on the given date
 *     for (const version of sortedHistory) {
 *       const effectiveFrom = version.effectiveFrom instanceof Date 
 *         ? version.effectiveFrom 
 *         : version.effectiveFrom.toDate();
 *       
 *       if (date >= effectiveFrom) {
 *         return {
 *           scheduleType: version.scheduleType,
 *           schedules: version.schedules,
 *           dayOfWeek: version.schedules[0]?.dayOfWeek ?? classData.dayOfWeek,
 *           startTime: version.schedules[0]?.startTime ?? classData.startTime,
 *           endTime: version.schedules[0]?.endTime ?? classData.endTime,
 *           timezone: version.timezone || classData.timezone,
 *           frequency: version.frequency || classData.frequency || { type: 'weekly', every: 1 },
 *         };
 *       }
 *     }
 *   }
 *
 *   return {
 *     scheduleType: classData.scheduleType || 'single',
 *     schedules: classData.schedules || [{
 *       dayOfWeek: classData.dayOfWeek,
 *       startTime: classData.startTime,
 *       endTime: classData.endTime,
 *       timezone: classData.timezone,
 *     }],
 *     dayOfWeek: classData.dayOfWeek,
 *     startTime: classData.startTime,
 *     endTime: classData.endTime,
 *     timezone: classData.timezone,
 *     frequency: classData.frequency || { type: 'weekly', every: 1 },
 *   };
 * }
 */

/**
 * Helper function to get the next day
 */
function nextDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}

/**
 * Calculate class dates with schedule versioning and exception support.
 * This is the enhanced version that handles:
 * 1. Historical schedule versions
 * 2. Class exceptions (cancellations, reschedules)
 */
async function calculateClassDatesWithExceptions(
  classData: any,
  startDate: Date,
  endDate: Date,
  classId: string
): Promise<CalculatedClassDate[]> {
  // Fetch exceptions for this class in the date range
  const exceptions = await fetchClassExceptions(classId, startDate, endDate);
  const { byOriginalDate, byNewDate } = buildExceptionMaps(exceptions);

  const dates: CalculatedClassDate[] = [];
  const processedDates = new Set<string>(); // Track to avoid duplicates

  // First pass: Add rescheduled classes landing in this period
  for (let date = new Date(startDate); date <= endDate; date = nextDay(date)) {
    const dateKey = date.toISOString().split('T')[0];
    const landingException = byNewDate.get(dateKey);

      if (landingException && !processedDates.has(dateKey)) {
        // Check if this rescheduled class has been subsequently cancelled
        const cancellationException = byOriginalDate.get(dateKey);
        
        if (cancellationException?.type === 'cancelled') {
          // The rescheduled class was cancelled - mark as cancelled
          processedDates.add(dateKey);
          dates.push({
            date: new Date(date),
            isCancelled: true,
            reason: cancellationException.reason,
          });
        } else {
          // Check if this rescheduled date has been rescheduled again
          // If the newDate is the originalDate of another reschedule, skip this one
          // BUT: if newDate === originalDate (same date reschedule), the same exception
          // will appear in both maps, so we need to check if it's a different exception
          const subsequentReschedule = byOriginalDate.get(dateKey);
          if (subsequentReschedule?.type === 'rescheduled' && subsequentReschedule.id !== landingException.id) {
            // This rescheduled class was rescheduled again by a DIFFERENT exception - skip it
            // The subsequent reschedule will be handled in its own iteration
            processedDates.add(dateKey);
            continue;
          }
          
          // Normal rescheduled class - add it
          // This handles both: reschedules to different dates AND reschedules to same date (time-only changes)
          processedDates.add(dateKey);
          // Keep originalDate as string (YYYY-MM-DD) to avoid timezone conversion issues
          dates.push({
            date: new Date(date),
            startTime: landingException.newStartTime,
            endTime: landingException.newEndTime,
            timezone: landingException.timezone,
            isRescheduled: landingException.type === 'rescheduled',
            originalDate: landingException.originalDate || null,
            originalStartTime: landingException.originalStartTime,
            originalEndTime: landingException.originalEndTime,
            reason: landingException.reason,
          });
        }
      }
  }

  // Second pass: Generate regular schedule dates, applying cancellations
  const baseDates = calculateClassDates(classData, startDate, endDate);

  for (const date of baseDates) {
    const dateKey = date.toISOString().split('T')[0];

    // Check for exceptions on this original date first
    const exception = byOriginalDate.get(dateKey);
    
    // If this date was already processed as a landing date (rescheduled class landed here),
    // but it's also a regular scheduled date for this class, we should include it as a regular class
    // This handles the case where a class is rescheduled TO a date where the same class already has a regular occurrence
    const wasProcessedAsLanding = processedDates.has(dateKey);
    if (wasProcessedAsLanding) {
      // Check if this date is also a regular scheduled date (no exception on this date)
      if (!exception) {
        // This date has a rescheduled class landing on it, but it's also a regular date for this class
        // Add it as a regular class (both the rescheduled and regular will appear)
        dates.push({ date });
      }
      continue;
    }

    if (exception?.type === 'cancelled') {
      // Show cancelled class with cancelled flag
      dates.push({
        date,
        isCancelled: true,
        reason: exception.reason,
      });
      processedDates.add(dateKey);
      continue;
    }

    if (exception?.type === 'rescheduled') {
      // If newDate === originalDate, this is a time-only reschedule on the same date
      // The first pass should have already added it with the new time, so we just skip here
      // If newDate !== originalDate, skip the original date - only the newDate will appear on calendar
      if (exception.newDate === dateKey) {
        // Same date reschedule - first pass should have already added it with new time
        // Just mark as processed and continue (don't add the regular schedule time)
        processedDates.add(dateKey);
      } else {
        // Different date reschedule - skip the original date
        processedDates.add(dateKey);
      }
      continue;
    }

    // Normal class - add if not already added
    if (!processedDates.has(dateKey)) {
      dates.push({ date });
      processedDates.add(dateKey);
    }
  }

  // Sort dates chronologically
  return dates.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Build a dailyClassMap from a class schedule array
 * Filters out cancelled dates and organizes classes by date
 * @param classSchedule Array of class information with calculatedDates
 * @returns Record mapping date strings (YYYY-MM-DD) to array of class entries
 */
function buildDailyClassMap(classSchedule: any[]): Record<string, any[]> {

  const dailyClassMap: Record<string, any[]> = {};

  // First, identify dates where rescheduled classes are landing, and which class they're from
  const datesWithRescheduledClasses = new Map<string, string>(); // date -> classId
  for (const classItem of classSchedule) {
    const calculatedDates = (classItem as any).calculatedDates || 
      (classItem.dates ? classItem.dates.map((d: Date) => ({ date: d })) : []);
    for (const calcDate of calculatedDates) {
      if (calcDate.isRescheduled) {
        const dateString = calcDate.date.toISOString().split('T')[0];
        datesWithRescheduledClasses.set(dateString, classItem.id);
      }
    }
  }

  // Process all classes and add them to the daily class map with exception support
  for (const classItem of classSchedule) {
    // Use calculatedDates if available for exception metadata, otherwise fall back to dates
    const calculatedDates = (classItem as any).calculatedDates || 
      (classItem.dates ? classItem.dates.map((d: Date) => ({ date: d })) : []);

    // Add each class date to the daily map
    for (const calcDate of calculatedDates) {
      const date = calcDate.date;
      const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Skip cancelled dates - UNLESS there's a rescheduled class from THIS SAME CLASS landing on this date
      // In that case, we want to show both the regular class and the rescheduled class from the same class
      // We only include cancelled classes if the rescheduled class landing on that date is from the same class
      if (calcDate.isCancelled) {
        const rescheduledClassId = datesWithRescheduledClasses.get(dateString);
        if (rescheduledClassId === classItem.id) {
          // There's a rescheduled class from THIS SAME CLASS on this date, so include this class as a regular class
          // (don't treat it as cancelled for display purposes)
          // Continue processing as a regular class (don't skip, don't mark as cancelled)
        } else {
          // No rescheduled class from this class on this date, skip the cancelled class
          continue;
        }
      }

      if (!dailyClassMap[dateString]) {
        dailyClassMap[dateString] = [];
      }

      let classEntry: any;

      // Handle different schedule types
      if (classItem.scheduleType === 'multiple' && Array.isArray(classItem.schedules)) {
        // For rescheduled classes, use their specified times even if no matching schedule
        if (calcDate.isRescheduled) {
          classEntry = {
            id: classItem.id,
            startTime: calcDate.startTime || classItem.startTime,
            endTime: calcDate.endTime || classItem.endTime,
            timezone: classItem.timezone,
            courseType: classItem.courseType,
            students: classItem.students || []
          };
        } else {
          // For regular classes, find the matching schedule for this day
          const matchingSchedule = classItem.schedules.find((schedule: any) => schedule.dayOfWeek === date.getDay());
          if (matchingSchedule) {
            classEntry = {
              id: classItem.id,
              startTime: calcDate.startTime || matchingSchedule.startTime,
              endTime: calcDate.endTime || matchingSchedule.endTime,
              timezone: matchingSchedule.timezone || classItem.timezone,
              courseType: classItem.courseType,
              students: classItem.students || []
            };
          }
        }
      } else {
        // For single schedule
        classEntry = {
          id: classItem.id,
          startTime: calcDate.startTime || classItem.startTime,
          endTime: calcDate.endTime || classItem.endTime,
          timezone: classItem.timezone,
          courseType: classItem.courseType,
          students: classItem.students || []
        };
      }

      if (classEntry) {
        // Add exception metadata if present (for rescheduled classes)
        if (calcDate.isRescheduled) {
          classEntry.isRescheduled = true;
          classEntry.originalDate = calcDate.originalDate;
          classEntry.originalStartTime = calcDate.originalStartTime;
          classEntry.originalEndTime = calcDate.originalEndTime;
          classEntry.reason = calcDate.reason;
        }

        dailyClassMap[dateString].push(classEntry);
      }
    }
  }

  // Sort classes in each day by start time
  Object.keys(dailyClassMap).forEach(dateStr => {
    dailyClassMap[dateStr].sort((a, b) => {
      // Parse time strings to compare
      const timeA = a.startTime || '00:00';
      const timeB = b.startTime || '00:00';

      // Convert to 24-hour format for comparison
      const parseTime = (timeStr: string) => {
        const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
        if (!match) return 0;
        
        let hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const period = match[3]?.toUpperCase();

        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;

        return hours * 60 + minutes;
      };

      return parseTime(timeA) - parseTime(timeB);
    });
  });

  return dailyClassMap;
}

/**
 * Calculate class dates based on recurrence pattern
 * Supports weekly, bi-weekly, and monthly patterns
 */
function calculateClassDates(classData: any, startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];

  // Get recurrence pattern from class data or default to weekly
  const recurrencePattern = classData.recurrencePattern || 'weekly';
  const recurrenceInterval = classData.recurrenceInterval || 1; // Default to every week

  // Handle multiple days of the week
  const daysOfWeek: number[] = [];

  if (classData.scheduleType === 'multiple' && Array.isArray(classData.schedules)) {
    // Use the schedules array for multiple schedule type
    daysOfWeek.push(...classData.schedules.map((schedule: any) => schedule.dayOfWeek));

  } else if (Array.isArray(classData.daysOfWeek) && classData.daysOfWeek.length > 0) {
    // Use the daysOfWeek array if it exists
    daysOfWeek.push(...classData.daysOfWeek);
  } else if (classData.dayOfWeek !== undefined || classData.dayOfWeek === 0) {
    // Backward compatibility: use single dayOfWeek if daysOfWeek doesn't exist
    daysOfWeek.push(classData.dayOfWeek);
  } else {
    // No valid day of week information
    logger.warn(`No valid day of week information found for class: ${JSON.stringify(classData)}`);
    return dates;
  }

  // Handle frequency for recurring classes
  const frequency = classData.frequency || { type: 'weekly', every: 1 };
  const isBiweekly = frequency.type === 'biweekly';
  const isCustom = frequency.type === 'custom';
  const interval = isBiweekly ? 2 : (isCustom ? frequency.every : recurrenceInterval);

  // Get the class start date for reference
  const classStartDate = classData.startDate ? classData.startDate.toDate() : new Date(startDate);

  // Process each day of the week
  for (const dayOfWeek of daysOfWeek) {
    // For custom and biweekly frequencies, we need to calculate dates based on the original start date
    if ((isBiweekly || isCustom) && classData.startDate) {
      // Find the first occurrence of this day of week from the class start date
      const firstOccurrence = new Date(classStartDate);
      const startDayOfWeek = firstOccurrence.getDay();

      // Adjust to the first occurrence of this day of week
      if (startDayOfWeek !== dayOfWeek) {
        // Calculate days to add to reach the target day of week
        const daysToAdd = (dayOfWeek - startDayOfWeek + 7) % 7;
        firstOccurrence.setDate(firstOccurrence.getDate() + daysToAdd);
      }

      // Now generate all occurrences based on the interval
      let currentDate = new Date(firstOccurrence);

      // If the first occurrence is before our start date, move forward by intervals until we reach or pass the start date
      while (currentDate < startDate) {
        currentDate.setDate(currentDate.getDate() + (7 * interval));
      }

      // Generate dates based on the interval
      while (currentDate <= endDate) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + (7 * interval));
      }
    } else {
      // For weekly or monthly classes, use the original approach
      // Start from the effective start date
      const currentDate = new Date(startDate);

      // Adjust to the first occurrence of this day of week
      const currentDayOfWeek = currentDate.getDay();

      if (currentDayOfWeek !== dayOfWeek) {
        // Calculate days to add to reach the target day of week
        const daysToAdd = (dayOfWeek - currentDayOfWeek + 7) % 7;
        currentDate.setDate(currentDate.getDate() + daysToAdd);
      }

      // If the adjusted date is before the start date, move to the next occurrence
      if (currentDate < startDate) {
        if (recurrencePattern === 'weekly') {
          currentDate.setDate(currentDate.getDate() + 7);
        } else if (recurrencePattern === 'monthly') {
          currentDate.setMonth(currentDate.getMonth() + 1);
        }
      }

      // Generate dates based on recurrence pattern
      while (currentDate <= endDate) {
        // Add this date to our results
        dates.push(new Date(currentDate));

        // Move to next occurrence based on pattern
        if (recurrencePattern === 'weekly') {
          currentDate.setDate(currentDate.getDate() + 7);
        } else if (recurrencePattern === 'monthly') {
          currentDate.setMonth(currentDate.getMonth() + 1);
        }
      }
    }
  }

  // Sort dates chronologically
  return dates.sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Calculate payment due dates based on class and user payment configuration
 */
function calculatePaymentDueDates(classData: any, userData: any, startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];

  // Determine which payment config to use (class-level or user-level)
  const paymentConfig = classData.paymentConfig || (userData && userData.paymentConfig) || null;

  if (!paymentConfig) {
    return dates;
  }

  // Get payment start date
  let paymentStartDate: Date;
  if (paymentConfig.startDate) {
    // Parse the YYYY-MM-DD date string
    const [year, month, day] = paymentConfig.startDate.split('-').map(Number);
    paymentStartDate = new Date(year, month - 1, day);
  } else if (classData.startDate) {
    // Use class start date if payment start date is not specified
    paymentStartDate = classData.startDate.toDate();
  } else {
    // Default to the start of the requested month
    paymentStartDate = new Date(startDate);
  }

  // If payment start date is after the end of the requested month, no payments are due
  if (paymentStartDate > endDate) {
    return dates;
  }

  // Calculate payment dates based on payment type
  if (paymentConfig.type === 'weekly') {
    const interval = paymentConfig.weeklyInterval || 1;
    let currentPaymentDate = new Date(paymentStartDate);

    // Adjust to be within the month range
    if (currentPaymentDate < startDate) {
      // Calculate how many intervals to add to reach or exceed the start date
      const diffTime = startDate.getTime() - currentPaymentDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const intervalsToAdd = Math.ceil(diffDays / (7 * interval));

      currentPaymentDate.setDate(currentPaymentDate.getDate() + (intervalsToAdd * 7 * interval));
    }

    // Generate payment dates
    while (currentPaymentDate <= endDate) {
      dates.push(new Date(currentPaymentDate));
      currentPaymentDate.setDate(currentPaymentDate.getDate() + (7 * interval));
    }
  } else if (paymentConfig.type === 'monthly') {
    const monthlyOption = paymentConfig.monthlyOption || 'first';

    // Calculate the payment day for the requested month
    const year = startDate.getFullYear();
    const month = startDate.getMonth();

    let paymentDate: Date;
    switch (monthlyOption) {
      case 'first':
        paymentDate = new Date(year, month, 1);
        break;
      case 'fifteen':
        paymentDate = new Date(year, month, 15);
        break;
      case 'last':
        paymentDate = new Date(year, month + 1, 0); // Last day of the month
        break;
      default:
        paymentDate = new Date(year, month, 1);
    }

    // Add the payment date if it's within the range and after the payment start date
    if (paymentDate >= paymentStartDate && paymentDate <= endDate) {
      dates.push(paymentDate);
    }

    // Check if we need to include the next month's payment date
    // This happens when the month spans into the next month
    if (endDate.getMonth() !== startDate.getMonth()) {
      const nextMonth = startDate.getMonth() + 1;
      const nextYear = startDate.getFullYear() + (nextMonth > 11 ? 1 : 0);
      const normalizedNextMonth = nextMonth % 12;

      let nextPaymentDate: Date;
      switch (monthlyOption) {
        case 'first':
          nextPaymentDate = new Date(nextYear, normalizedNextMonth, 1);
          break;
        case 'fifteen':
          nextPaymentDate = new Date(nextYear, normalizedNextMonth, 15);
          break;
        case 'last':
          nextPaymentDate = new Date(nextYear, normalizedNextMonth + 1, 0);
          break;
        default:
          nextPaymentDate = new Date(nextYear, normalizedNextMonth, 1);
      }

      if (nextPaymentDate >= paymentStartDate && nextPaymentDate <= endDate) {
        dates.push(nextPaymentDate);
      }
    }
  }

  return dates.sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Get class materials for a specific month and year
 * This function retrieves all materials for classes in a given month
 */
export const getClassMaterialsHttp = onRequest({
  region: REGION,
  cors: true
}, async (request, response) => {
  // Handle CORS
  corsHandler(request, response, async () => {
    try {
      const { month, year, userId, email, classId } = request.query;

      // Validate required parameters
      if (!month || !year) {
        response.status(400).json({ error: 'Month and year are required' });
        return;
      }

      // Either userId, email, or classId must be provided
      if (!userId && !email && !classId) {
        response.status(400).json({ error: 'Either userId, email, or classId is required' });
        return;
      }

      // Parse month and year to integers
      const monthInt = parseInt(month as string);
      const yearInt = parseInt(year as string);

      // Validate month and year
      if (isNaN(monthInt) || monthInt < 0 || monthInt > 11) {
        response.status(400).json({ error: 'Invalid month. Must be between 0 and 11.' });
        return;
      }

      if (isNaN(yearInt) || yearInt < 2000 || yearInt > 2100) {
        response.status(400).json({ error: 'Invalid year. Must be between 2000 and 2100.' });
        return;
      }

      // Create date range for the requested month
      const startDate = new Date(yearInt, monthInt, 1);
      const endDate = new Date(yearInt, monthInt + 1, 0); // Last day of the month

      // Query materials based on the provided parameters
      let materialsQuery: admin.firestore.Query = admin.firestore().collection('classMaterials');

      if (classId) {
        // Filter by class ID
        materialsQuery = materialsQuery.where('classId', '==', classId);
      } else if (email) {
        // Filter by student email
        materialsQuery = materialsQuery.where('studentEmails', 'array-contains', email);
      } else if (userId) {
        // Get user email first
        const userDoc = await admin.firestore().collection('users').doc(userId as string).get();
        if (!userDoc.exists) {
          response.status(404).json({ error: 'User not found' });
          return;
        }
        const userEmail = userDoc.data()?.email;
        if (!userEmail) {
          response.status(404).json({ error: 'User email not found' });
          return;
        }
        materialsQuery = materialsQuery.where('studentEmails', 'array-contains', userEmail);
      }

      // Get materials within the date range
      const materialsSnapshot = await materialsQuery.get();

      if (materialsSnapshot.empty) {
        response.status(200).json({ materials: [] });
        return;
      }

      // Filter materials by date and organize by class
      const materialsByClass: Record<string, any[]> = {};

      for (const doc of materialsSnapshot.docs) {
        const materialData = doc.data();

        // Check if the material date is within the requested month
        if (materialData.classDate) {
          const materialDate = materialData.classDate.toDate();
          if (materialDate >= startDate && materialDate <= endDate) {
            // Add material to the appropriate class
            if (!materialsByClass[materialData.classId]) {
              materialsByClass[materialData.classId] = [];
            }

            materialsByClass[materialData.classId].push({
              ...materialData,
              classDate: materialData.classDate.toDate(),
              createdAt: materialData.createdAt.toDate(),
              updatedAt: materialData.updatedAt.toDate()
            });
          }
        }
      }

      response.status(200).json({
        materials: materialsByClass,
        month: monthInt,
        year: yearInt
      });
    } catch (error) {
      logger.error("Error in getClassMaterials:", error);
      response.status(500).json({ error: 'Internal server error' });
    }
  });
});

/**
 * Get all calendar data for a specific month and year
 * This function combines class schedule, materials, and payment data in a single request
 */
export const getCalendarDataHttp = onRequest({
  region: REGION,
  cors: true
}, async (request, response) => {
  // Handle CORS
  corsHandler(request, response, async () => {
    try {
      const { month, year, userId, email } = request.query;

      // Validate required parameters
      if (!month || !year) {
        response.status(400).json({ error: 'Month and year are required' });
        return;
      }

      // Either userId or email must be provided
      if (!userId && !email) {
        response.status(400).json({ error: 'Either userId or email is required' });
        return;
      }

      // Parse month and year to integers
      const monthInt = parseInt(month as string);
      const yearInt = parseInt(year as string);

      // Validate month and year
      if (isNaN(monthInt) || monthInt < 0 || monthInt > 11) {
        response.status(400).json({ error: 'Invalid month. Must be between 0 and 11.' });
        return;
      }

      if (isNaN(yearInt) || yearInt < 2000 || yearInt > 2100) {
        response.status(400).json({ error: 'Invalid year. Must be between 2000 and 2100.' });
        return;
      }

      // Create date range for the requested month
      const startDate = new Date(yearInt, monthInt, 1);
      const endDate = new Date(yearInt, monthInt + 1, 0); // Last day of the month

      // Get user data for payment configuration
      let userData: any = null;
      let userEmail = null;

      if (email) {
        userEmail = email as string;
        const usersSnapshot = await admin.firestore().collection('users')
          .where('email', '==', userEmail)
          .limit(1)
          .get();

        if (!usersSnapshot.empty) {
          const userDoc = usersSnapshot.docs[0];
          userData = {
            ...userDoc.data(),
            id: userDoc.id
          };
        }
      } else if (userId) {
        const userDoc = await admin.firestore().collection('users').doc(userId as string).get();
        if (userDoc.exists) {
          userData = {
            ...userDoc.data(),
            id: userDoc.id
          };
          userEmail = userData.email;
        }
      }

      if (!userData) {
        response.status(404).json({ error: 'User not found' });
        return;
      }

      // Query classes based on user identifier - try both studentIds and studentEmails
      let classesQuery: admin.firestore.Query;

      if (userEmail) {
        classesQuery = admin.firestore().collection('classes')
          .where('studentEmails', 'array-contains', userEmail);
      } else {
        classesQuery = admin.firestore().collection('classes')
          .where('studentIds', 'array-contains', userId);
      }

      const classesSnapshot = await classesQuery.get();

      // Process classes and map them to dates
      const classSchedule = [];
      const paymentDueDates = [];
      const classIds = [];

      // Process classes with exception support
      const classProcessingPromises = classesSnapshot.docs.map(async (doc) => {
        const classData = doc.data();
        const classId = doc.id;

        // Skip classes that have ended before the requested month
        if (classData.endDate && classData.endDate.toDate() < startDate) {
          return { classId, classInfo: null, paymentEntries: [] };
        }

        // Skip classes that start after the requested month
        if (classData.startDate && classData.startDate.toDate() > endDate) {
          return { classId, classInfo: null, paymentEntries: [] };
        }

        // Get the actual start date to use (either class start date or month start)
        const effectiveStartDate = classData.startDate && classData.startDate.toDate() > startDate
          ? classData.startDate.toDate()
          : new Date(startDate);

        // Get the actual end date to use (either class end date or month end)
        const effectiveEndDate = classData.endDate && classData.endDate.toDate() < endDate
          ? classData.endDate.toDate()
          : new Date(endDate);

        // Calculate class dates with exception support
        const calculatedDates = await calculateClassDatesWithExceptions(
          classData,
          effectiveStartDate,
          effectiveEndDate,
          classId
        );

        if (calculatedDates.length === 0) {
          return { classId, classInfo: null, paymentEntries: [] };
        }

        // Extract just the Date objects for backward compatibility
        const classDates = calculatedDates.map(cd => cd.date);

        // Calculate payment due dates
        const paymentDates = calculatePaymentDueDates(
          classData,
          userData,
          startDate,
          endDate
        );

        // Create a base class object
        const baseClassInfo: Partial<ClassInfo> = {
          id: classId, // Add ID for tracking
          dayOfWeek: classData.dayOfWeek,
          daysOfWeek: classData.daysOfWeek,
          courseType: classData.courseType,
          notes: classData.notes,
          studentEmails: classData.studentEmails,
          students: classData.students || classData.studentEmails.map((email: string) => ({ email })),
          startDate: classData.startDate ? classData.startDate.toDate() : null,
          endDate: classData.endDate ? classData.endDate.toDate() : null,
          recurrencePattern: classData.recurrencePattern || 'weekly',
          recurrenceInterval: classData.recurrenceInterval || 1,
          paymentConfig: classData.paymentConfig || {
            type: 'monthly',
            monthlyOption: 'first',
            startDate: classData.startDate ? classData.startDate.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
          },
          dates: classDates,
          timezone: classData.timezone,
          scheduleType: classData.scheduleType || 'single'
        };

        // Create a class object that matches the ClassSession interface in the frontend
        const classInfo: ClassInfo = {
          ...baseClassInfo,
          timezone: classData.timezone,
          scheduleType: classData.scheduleType || 'single'
        } as ClassInfo;

        const singleClassInfo: ClassInfo & { calculatedDates?: CalculatedClassDate[] } = {
          ...classInfo,
          timezone: classData.timezone,
          dates: classDates,
          calculatedDates, // Include full exception metadata
          paymentDueDates: calculatePaymentDueDates(
            classData.paymentConfig,
            classDates,
            effectiveStartDate,
            effectiveEndDate
          ),
          scheduleType: classData.scheduleType || 'single',
          schedules: classData.schedules || []
        };

        // Build payment entries
        const paymentEntries = paymentDates.map(date => ({
          date,
          user: {
            name: userData.name,
            email: userEmail
          },
          classSession: {
            id: classId,
            dayOfWeek: classData.dayOfWeek,
            startTime: classData.startTime,
            endTime: classData.endTime,
            courseType: classData.courseType,
            paymentConfig: classData.paymentConfig
          },
          paymentLink: classData.paymentConfig?.paymentLink || null,
          amount: classData.paymentConfig?.amount || null
        }));

        return { classId, classInfo: singleClassInfo, paymentEntries };
      });

      const processedResults = await Promise.all(classProcessingPromises);

      // Process results
      for (const result of processedResults) {
        if (result.classInfo) {
          classIds.push(result.classId);
          classSchedule.push(result.classInfo);
          paymentDueDates.push(...result.paymentEntries);
        }
      }

      // Query materials for these classes
      const materialsByClass: Record<string, any[]> = {};

      if (classIds.length > 0) {
        // Split into chunks of 10 for Firestore "in" query limitation
        const classIdChunks = [];
        for (let i = 0; i < classIds.length; i += 10) {
          classIdChunks.push(classIds.slice(i, i + 10));
        }

        for (const chunk of classIdChunks) {
          const materialsQuery: admin.firestore.Query = admin.firestore().collection('classMaterials')
            .where('classId', 'in', chunk);

          const materialsSnapshot = await materialsQuery.get();

          for (const doc of materialsSnapshot.docs) {
            const materialData = doc.data();

            // Check if the material date is within the requested month
            if (materialData.classDate) {
              const materialDate = materialData.classDate.toDate();
              if (materialDate >= startDate && materialDate <= endDate) {
                // Add material to the appropriate class
                if (!materialsByClass[materialData.classId]) {
                  materialsByClass[materialData.classId] = [];
                }

                materialsByClass[materialData.classId].push({
                  ...materialData,
                  id: doc.id,
                  classDate: materialData.classDate.toDate(),
                  createdAt: materialData.createdAt.toDate(),
                  updatedAt: materialData.updatedAt.toDate()
                });
              }
            }
          }
        }
      }

      // Get completed payments for the month - check both userId as ID and email
      const completedPayments = [];

      if (userEmail) {
        try {
          if (userEmail) {

            // due to oddities with the persisted time, range from the last day of the previous month to the first day of the next month
            const paymentStartDate = new Date(startDate);
            paymentStartDate.setDate(0);
            paymentStartDate.setHours(0, 0, 0, 0);
            const paymentEndDate = new Date(endDate);
            paymentEndDate.setDate(paymentEndDate.getDate() + 1);
            paymentEndDate.setHours(0, 0, 0, 0);
            // Try both userId field formats
            const paymentsSnapshotByEmail = await admin.firestore().collection('payments')
              .where('userId', '==', userEmail)
              .where('dueDate', '>=', paymentStartDate)
              .where('dueDate', '<', paymentEndDate)
              .get();

            // Process payments by email
            for (const doc of paymentsSnapshotByEmail.docs) {
              const paymentData = doc.data();

              if (paymentData.dueDate) {
                try {
                  completedPayments.push({
                    ...paymentData,
                    id: doc.id,
                    dueDate: paymentData.dueDate.toDate(),
                    completedAt: paymentData.completedAt ? paymentData.completedAt.toDate() : null,
                    createdAt: paymentData.createdAt.toDate(),
                    updatedAt: paymentData.updatedAt.toDate()
                  });
                } catch (dateError) {
                  logger.error("Error processing payment date:", dateError);
                  // Skip this payment if there's an issue with the date
                }
              }
            }
          }
        } catch (queryError) {
          logger.error("Error querying payments:", queryError);
          // Continue with empty payments rather than failing the whole request
        }
      }

      // Get birthdays for the month
      const birthdays: Array<{
        name: string;
        email: string;
        birthdate: string;
        day: number;
      }> = [];

      // Query all users to get birthdays
      const usersSnapshot = await admin.firestore().collection('users').get();

      for (const doc of usersSnapshot.docs) {
        const userData = doc.data();

        if (userData.birthdate) {
          // Birthdate format is MM-DD
          const [birthMonth, birthDay] = userData.birthdate.split('-').map(Number);

          // Check if the birthday is in the requested month
          if (birthMonth === monthInt + 1) {
            birthdays.push({
              name: userData.name,
              email: userData.email,
              birthdate: userData.birthdate,
              day: birthDay
            });
          }
        }
      }

      // Create dailyClassMap - a map of date strings to classes for easy lookup
      const dailyClassMap = buildDailyClassMap(classSchedule);

      response.status(200).json({
        classes: classSchedule,
        materials: materialsByClass,
        paymentDueDates: paymentDueDates.sort((a, b) => a.date.getTime() - b.date.getTime()),
        completedPayments,
        birthdays,
        userData,
        month: monthInt,
        year: yearInt,
        dailyClassMap // Add dailyClassMap to the response
      });
    } catch (error) {
      logger.error("Error in getCalendarData:", error);
      response.status(500).json({ error: 'Internal server error' });
    }
  });
});

/**
 * Get all classes for all users in a specific month and year
 * This function is intended for admin use to view all scheduled classes
 */
export const getAllClassesForMonthHttp = onRequest({
  region: REGION,
  cors: true
}, async (request, response) => {
  // Handle CORS
  corsHandler(request, response, async () => {
    try {
      const { month, year, adminId } = request.query;

      // Validate required parameters
      if (!month || !year) {
        response.status(400).json({ error: 'Month and year are required' });
        return;
      }

      // Verify admin status
      if (adminId) {
        const adminDoc = await admin.firestore().collection('users').doc(adminId as string).get();

        if (!adminDoc.exists) {
          logger.error('admin not found for the given parameters');
          response.status(403).json({ error: 'Unauthorized. Admin not found.' });
          return;
        }

        const userData = adminDoc.data();

        if (!userData?.isAdmin) {
          logger.error('admin access required');
          response.status(403).json({ error: 'Unauthorized. Admin access required.' });
          return;
        }
      } else {
        logger.error('admin ID required');
        response.status(403).json({ error: 'Unauthorized. Admin ID required.' });
        return;
      }

      // Parse month and year to integers
      const monthInt = parseInt(month as string);
      const yearInt = parseInt(year as string);

      // Validate month and year
      if (isNaN(monthInt) || monthInt < 0 || monthInt > 11) {
        logger.error('invalid month for the given parameters');
        response.status(400).json({ error: 'Invalid month. Must be between 0 and 11.' });
        return;
      }

      if (isNaN(yearInt) || yearInt < 2000 || yearInt > 2100) {
        logger.error('invalid year for the given parameters');
        response.status(400).json({ error: 'Invalid year. Must be between 2000 and 2100.' });
        return;
      }

      // Create date range for the requested month
      // Start at the beginning of the month in UTC-12 (earliest timezone)
      const startDate = new Date(Date.UTC(yearInt, monthInt, 1, -12, 0, 0));
      // End at the end of the month in UTC+14 (latest timezone)
      const endDate = new Date(Date.UTC(yearInt, monthInt + 1, 1, 14, 0, 0));
      endDate.setUTCDate(endDate.getUTCDate() - 1);

      // Get birthdays for the month - only for users taught by this admin
      const birthdays: Array<{
        name: string;
        email: string;
        birthdate: string;
        day: number;
      }> = [];

      // Get users who have this admin as their teacher
      const usersSnapshot = await admin.firestore().collection('users')
        .where('teacher', '==', adminId as string)
        .get();

      if (usersSnapshot.empty) {
        response.status(200).json({
          classes: [],
          dailyClassMap: {},
          birthdays,
          month: monthInt,
          year: yearInt
        });
        return;
      }

      const usersMap = new Map();
      const userEmails: string[] = [];

      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        usersMap.set(userData.email, {
          name: userData.name,
          email: userData.email,
          birthdate: userData.birthdate,
          paymentConfig: userData.paymentConfig
        });
        userEmails.push(userData.email);

        // Process birthdays
        if (userData.birthdate) {
          // Birthdate format is MM-DD
          const [birthMonth, birthDay] = userData.birthdate.split('-').map(Number);

          // Check if the birthday is in the requested month
          if (birthMonth === monthInt + 1) {
            birthdays.push({
              name: userData.name,
              email: userData.email,
              birthdate: userData.birthdate,
              day: birthDay
            });
          }
        }
      });

      // Query only classes that have students taught by this admin
      // Firestore doesn't support direct array containsAny with more than 10 items
      // So we need to handle this in batches if there are more than 10 emails
      let classesSnapshot;
      const batchSize = 10;

      if (userEmails.length <= batchSize) {
        // If we have 10 or fewer emails, we can use a single query
        classesSnapshot = await admin.firestore().collection('classes')
          .where('studentEmails', 'array-contains-any', userEmails)
          .get();
      } else {
        // If we have more than 10 emails, we need to use multiple queries
        const batches: string[][] = [];
        for (let i = 0; i < userEmails.length; i += batchSize) {
          const batch = userEmails.slice(i, i + batchSize);
          batches.push(batch);
        }

        // Execute all batch queries
        const batchQueries = batches.map(batch =>
          admin.firestore().collection('classes')
            .where('studentEmails', 'array-contains-any', batch)
            .get()
        );

        const batchResults = await Promise.all(batchQueries);

        // Combine results, avoiding duplicates
        const classesMap = new Map();
        batchResults.forEach(querySnapshot => {
          querySnapshot.forEach(doc => {
            classesMap.set(doc.id, doc);
          });
        });

        // Convert map back to array format similar to QuerySnapshot
        classesSnapshot = {
          docs: Array.from(classesMap.values()),
          empty: classesMap.size === 0
        };
      }
      if (classesSnapshot.empty) {
        response.status(200).json({
          classes: [],
          dailyClassMap: {},
          birthdays,
          month: monthInt,
          year: yearInt
        });
        return;
      }

      // Process classes and map them to dates
      const classSchedule = [];
      const dailyClassMap: Record<string, any[]> = {}; // Map of date strings to classes

      // Process classes in parallel with exception support
      const classProcessingPromises = classesSnapshot.docs.map(async (doc) => {
        const classData = doc.data();
        const classId = doc.id;

        // Skip classes that have ended before the requested month
        if (classData.endDate && classData.endDate.toDate() < startDate) {
          return null;
        }

        // Skip classes that start after the requested month
        if (classData.startDate && classData.startDate.toDate() > endDate) {
          return null;
        }

        // Get the actual start date to use (either class start date or month start)
        const effectiveStartDate = classData.startDate && classData.startDate.toDate() > startDate
          ? classData.startDate.toDate()
          : new Date(startDate);

        // Get the actual end date to use (either class end date or month end)
        const effectiveEndDate = classData.endDate && classData.endDate.toDate() < endDate
          ? classData.endDate.toDate()
          : new Date(endDate);

        // Calculate class dates with exception support
        const calculatedDates = await calculateClassDatesWithExceptions(
          classData,
          effectiveStartDate,
          effectiveEndDate,
          classId
        );

        if (calculatedDates.length === 0) {
          return null;
        }

        // Extract just the Date objects for backward compatibility
        const classDates = calculatedDates.map(cd => cd.date);

        // Get student details - only include students taught by this admin
        const relevantStudentEmails = classData.studentEmails.filter((email: string) => userEmails.includes(email));
        const students = relevantStudentEmails.map((email: string) => {
          const user = usersMap.get(email);
          return user || { email };
        });

        // Create a class object that matches the ClassSession interface in the frontend
        const classInfo: ClassInfo = {
          id: classId, // Add ID for single schedule classes
          dayOfWeek: classData.dayOfWeek,
          daysOfWeek: classData.daysOfWeek,
          courseType: classData.courseType,
          notes: classData.notes,
          studentEmails: relevantStudentEmails,
          students,
          startDate: classData.startDate ? classData.startDate.toDate() : null,
          endDate: classData.endDate ? classData.endDate.toDate() : null,
          recurrencePattern: classData.recurrencePattern || 'weekly',
          recurrenceInterval: classData.recurrenceInterval || 1,
          paymentConfig: classData.paymentConfig || {
            type: 'monthly',
            monthlyOption: 'first',
            startDate: classData.startDate ? classData.startDate.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
          },
          dates: classDates,
          timezone: classData.timezone,
          scheduleType: classData.scheduleType || 'single'
        };

        const singleClassInfo: ClassInfo & { calculatedDates?: CalculatedClassDate[] } = {
          ...classInfo,
          timezone: classData.timezone,
          dates: classDates,
          calculatedDates, // Include full exception metadata
          paymentDueDates: calculatePaymentDueDates(
            classData.paymentConfig,
            classDates,
            effectiveStartDate,
            effectiveEndDate
          ),
          scheduleType: classData.scheduleType || 'single',
          schedules: classData.schedules || []
        };
        
        return singleClassInfo;
      });

      const processedClasses = await Promise.all(classProcessingPromises);
      
      // Filter out null results and add to classSchedule
      for (const classInfo of processedClasses) {
        if (classInfo) {
          classSchedule.push(classInfo);
        }
      }

      // Build dailyClassMap with exception support (cancelled dates filtered out)
      Object.assign(dailyClassMap, buildDailyClassMap(classSchedule));

      // Extract user data for the frontend
      const usersArray = Array.from(usersMap.values());

      response.status(200).json({
        classes: classSchedule,
        dailyClassMap,
        birthdays,
        users: usersArray,
        month: monthInt,
        year: yearInt
      });
    } catch (error) {
      // Error logging to Firebase only (not to browser)
      logger.error("Error in getAllClassesForMonth:", error);

      if (error instanceof Error) {
        logger.error("Error details:", {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      }

      response.status(500).json({ error: 'Internal server error' });
    }
  });
});

// Create callable function for completing signup process
export const completeSignupHttp = onCall({
  region: REGION
}, async (request) => {
  try {
    // Auth context is automatically verified
    if (!request.auth) {
      throw new Error('Unauthorized - No valid token provided');
    }

    const { email, uid, token } = request.data;

    if (!email || !uid || !token) {
      throw new Error('Email, UID, and token are required');
    }

    // Verify that the token UID matches the request UID
    if (request.auth.uid !== uid) {
      logger.error('Token UID does not match request UID', { tokenUid: request.auth.uid, requestUid: uid });
      throw new Error('Unauthorized - Token mismatch');
    }

    // Verify the signup token
    const tokenDoc = await admin.firestore().collection('signupTokens').doc(token).get();
    if (!tokenDoc.exists || tokenDoc.data()?.used) {
      logger.error('Invalid or used token', { token });
      throw new Error('Invalid or used token');
    }

    // Find the pending user document
    const pendingUserQuery = await admin.firestore()
      .collection('users')
      .where('email', '==', email)
      .where('status', '==', 'pending')
      .get();

    if (pendingUserQuery.empty) {
      logger.error('No pending user found', { email });
      throw new Error('No pending user found');
    }

    const pendingUserDoc = pendingUserQuery.docs[0];
    const currentData = pendingUserDoc.data();

    try {
      // Start a batch write to ensure atomicity
      const batch = admin.firestore().batch();

      if (currentData.isAdmin) {
        // For admin users, create new document with auth UID
        const newUserRef = admin.firestore().collection('users').doc(uid);
        batch.set(newUserRef, {
          uid,
          email: currentData.email,
          name: currentData.name,
          isAdmin: currentData.isAdmin,
          status: 'active',
          createdAt: currentData.createdAt,
          updatedAt: new Date().toISOString()
        });

        // Delete the pending document
        batch.delete(pendingUserDoc.ref);
      } else {
        // For non-admin users, update the pending document
        batch.update(pendingUserDoc.ref, {
          uid,
          status: 'active',
          updatedAt: new Date().toISOString()
        });
      }

      // Mark token as used
      batch.update(tokenDoc.ref, {
        used: true,
        updatedAt: new Date().toISOString()
      });

      // Commit the batch
      await batch.commit();
      logger.info('Successfully completed signup', { email, uid });
      return { success: true };
    } catch (error) {
      logger.error('Error during batch operations:', error);
      throw error;
    }
  } catch (error) {
    logger.error('Error in completeSignup:', error);
    throw error;
  }
});

export const signoutHttpRequest = onRequest({
  region: REGION,
  cors: true
}, async (request, response) => {
  // Handle CORS
  corsHandler(request, response, async () => {
    try {
      // Get the authorization header
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        response.status(401).json({ error: 'Unauthorized - No valid token provided' });
        return;
      }

      // Extract the token
      const idToken = authHeader.split('Bearer ')[1];
      
      // Verify the token
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;

      try {
        // Get payment app instance
        const paymentAppInstance = getPaymentApp();
        
        // Revoke all refresh tokens for the user in the payment app
        await paymentAppInstance.auth().revokeRefreshTokens(uid);
      } catch (paymentAppError) {
        logger.error('Error revoking payment app tokens:', paymentAppError);
        // Don't throw here - we still want to complete the signout even if payment app fails
      }
      
      response.status(200).json({ 
        success: true, 
        message: 'Successfully signed out and invalidated all tokens' 
      });
    } catch (error) {
      logger.error('Error in signout:', error);
      response.status(500).json({ error: 'Failed to sign out' });
    }
  });
});

export const whatsappRedirect = onRequest({
  region: REGION,
  cors: true
}, async (request, response) => {
  try {
    const text = request.query.text as string || request.body?.text as string || '';
    const whatsappUrl = `https://wa.me/14707534900?text=${text}`;
    response.redirect(302, whatsappUrl);
  } catch (error) {
    logger.error('Error in whatsappRedirect:', error);
    response.status(500).json({ error: 'Internal server error' });
  }
});

export * from './emailFunctions';