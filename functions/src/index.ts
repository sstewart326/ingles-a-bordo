/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { resolve } from 'path';
import { config as loadEnv } from 'dotenv';

// Firebase emulator only auto-loads functions/.env — also load project-root .env.development (shared with Vite)
if (process.env.FUNCTIONS_EMULATOR === 'true') {
  loadEnv({ path: resolve(__dirname, '../../.env.development'), override: true });
}

import { onRequest } from "firebase-functions/v2/https";
import { onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { corsHandler, REGION } from "./functionsUtil";
import { registerPaymentFromStripeData } from "./paymentRegistration";

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
 * Config snapshot used for a contiguous effective window.
 * Stored on the class parent (current) or in classes/{id}/versions/{id} (prior).
 */
interface ClassConfigVersion {
  id: string;
  createdAt: Date;
  scheduleType: 'single' | 'multiple';
  schedules?: Schedule[];
  dayOfWeek: number;
  startTime?: string;
  endTime?: string;
  timezone: string;
  frequency?: {
    type: string;
    every: number;
  };
  paymentConfig?: any;
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
  /** Schedule that applied on this date (for versioned schedules). */
  scheduleType?: 'single' | 'multiple';
  schedules?: Schedule[];
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

        // Calculate payment due dates per config version window
        const versionedPaymentDues = await calculateVersionedPaymentDueDates(
          classData,
          userData,
          startDate,
          endDate,
          classId
        );
        const paymentDates = versionedPaymentDues.map((entry) => entry.date);

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
          paymentEntries: versionedPaymentDues.map(({ date, paymentConfig }) => ({
            date,
            paymentLink: paymentConfig?.paymentLink || null,
            amount: paymentConfig?.amount || null
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
 * Helper function to get the next day
 */
function nextDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}

function toDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

function timestampToDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

function currentConfigFromClassData(classData: any): ClassConfigVersion {
  const effectiveFrom =
    timestampToDate(classData.configEffectiveFrom) ||
    timestampToDate(classData.startDate) ||
    timestampToDate(classData.createdAt) ||
    new Date(0);

  return {
    id: 'current',
    createdAt: effectiveFrom,
    scheduleType: classData.scheduleType || 'single',
    schedules: classData.schedules,
    dayOfWeek: classData.dayOfWeek,
    startTime: classData.startTime,
    endTime: classData.endTime,
    timezone: classData.timezone,
    frequency: classData.frequency || { type: 'weekly', every: 1 },
    paymentConfig: classData.paymentConfig,
  };
}

function resolveVersionScheduleType(data: any): 'single' | 'multiple' {
  if (data.scheduleType === 'multiple' || data.scheduleType === 'single') {
    return data.scheduleType;
  }
  if (Array.isArray(data.schedules) && data.schedules.length > 0) {
    return data.schedules.length > 1 ? 'multiple' : 'single';
  }
  return 'single';
}

function mapConfigVersionDoc(
  docSnap: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot
): ClassConfigVersion {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    createdAt: timestampToDate(data.createdAt) || new Date(0),
    scheduleType: resolveVersionScheduleType(data),
    schedules: data.schedules,
    dayOfWeek: data.dayOfWeek,
    startTime: data.startTime,
    endTime: data.endTime,
    timezone: data.timezone,
    frequency: data.frequency || { type: 'weekly', every: 1 },
    paymentConfig: data.paymentConfig,
  };
}

/**
 * Load all archived config versions for a class (oldest first).
 * Uses a plain collection read so missing indexes / inequality queries cannot drop history.
 */
async function fetchArchivedConfigVersions(classId: string): Promise<ClassConfigVersion[]> {
  try {
    const snap = await admin
      .firestore()
      .collection('classes')
      .doc(classId)
      .collection('versions')
      .get();

    const versions = snap.docs.map((docSnap) => mapConfigVersionDoc(docSnap));
    versions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return versions;
  } catch (error) {
    logger.error(`Error fetching config versions for class ${classId}:`, error);
    return [];
  }
}

interface ConfigVersionsForRange {
  versions: ClassConfigVersion[];
  /** True when nothing older exists — oldest version applies from the range start (class history begins there). */
  oldestExtendsToStart: boolean;
}

/**
 * Load config versions needed to cover [monthStart, ...].
 * Current parent config is always last; archived versions with createdAt before
 * the current config effective date are included when the month needs them.
 */
async function fetchConfigVersionsNeeded(
  classId: string,
  monthStart: Date,
  classData: any
): Promise<ConfigVersionsForRange> {
  const current = currentConfigFromClassData(classData);

  // Month is entirely on/after the current config — no history needed
  if (toDateKey(monthStart) >= toDateKey(current.createdAt)) {
    return { versions: [current], oldestExtendsToStart: false };
  }

  const archived = await fetchArchivedConfigVersions(classId);
  // Only versions that were effective before the current config
  const prior = archived.filter(
    (version) => version.createdAt.getTime() < current.createdAt.getTime()
  );

  const versions = [...prior, current];
  const oldest = versions[0];
  // Extend the earliest known config back to the range start when history begins there
  // (never invent the *current* schedule for pre-edit dates if an archive exists).
  const oldestExtendsToStart = toDateKey(monthStart) < toDateKey(oldest.createdAt);

  if (prior.length === 0) {
    logger.warn(
      `Class ${classId}: month ${toDateKey(monthStart)} is before configEffectiveFrom ` +
        `${toDateKey(current.createdAt)} but no archived versions were found; ` +
        `extending current config backward.`
    );
  }

  return { versions, oldestExtendsToStart };
}

function applyVersionToClassData(
  classData: any,
  version: ClassConfigVersion,
  paymentConfigOverride?: any
): any {
  // If the version has a schedules array, drive generation from it (even when length === 1)
  const hasSchedules = Array.isArray(version.schedules) && version.schedules.length > 0;
  const scheduleType = hasSchedules
    ? 'multiple'
    : version.scheduleType || classData.scheduleType || 'single';

  const paymentConfig =
    paymentConfigOverride !== undefined
      ? paymentConfigOverride
      : version.paymentConfig !== undefined
        ? version.paymentConfig
        : classData.paymentConfig;

  return {
    ...classData,
    scheduleType,
    schedules: hasSchedules ? version.schedules : classData.schedules,
    dayOfWeek: version.dayOfWeek !== undefined ? version.dayOfWeek : classData.dayOfWeek,
    startTime: version.startTime ?? classData.startTime,
    endTime: version.endTime ?? classData.endTime,
    timezone: version.timezone || classData.timezone,
    frequency: version.frequency || classData.frequency,
    paymentConfig,
  };
}

/**
 * Resolve paymentConfig for a version window.
 * Older schedule-only archives often omit paymentConfig; inheriting from the nearest
 * *later archived* version captures the payment that was live then (snapshotted on a
 * later edit). Never inherit from the live parent/`current` — that rewrites past dues
 * when payment is edited.
 */
function resolvePaymentConfigForVersion(
  version: ClassConfigVersion,
  versionIndex: number,
  versions: ClassConfigVersion[],
  parentPaymentConfig: any
): any {
  if (version.paymentConfig != null) {
    return version.paymentConfig;
  }

  if (version.id === 'current') {
    return parentPaymentConfig;
  }

  for (let j = versionIndex + 1; j < versions.length; j++) {
    const later = versions[j];
    // Skip live parent — only inherit from another archived snapshot
    if (later.id === 'current') {
      break;
    }
    if (later.paymentConfig != null) {
      return later.paymentConfig;
    }
  }

  logger.warn(
    `Config version ${version.id} has no paymentConfig and no later archive with one`
  );
  return null;
}

function enrichDateWithVersion(date: Date, version: ClassConfigVersion): CalculatedClassDate {
  let startTime = version.startTime;
  let endTime = version.endTime;
  let timezone = version.timezone;
  const scheduleType = resolveVersionScheduleType(version);

  if (Array.isArray(version.schedules) && version.schedules.length > 0) {
    const matchingSchedule = version.schedules.find(
      (schedule) => schedule.dayOfWeek === date.getDay()
    );
    if (matchingSchedule) {
      startTime = matchingSchedule.startTime;
      endTime = matchingSchedule.endTime;
      timezone = matchingSchedule.timezone || version.timezone;
    }
  }

  return {
    date,
    startTime,
    endTime,
    timezone,
    scheduleType,
    schedules: version.schedules,
  };
}

/**
 * Build contiguous [windowStart, windowEnd] ranges for each config version.
 * Uses full timestamps so same-day edits (e.g. 18:52 then 19:10) don't drop a day.
 * When oldestExtendsToStart is set, the earliest version covers from range start.
 */
function getVersionWindows(
  versions: ClassConfigVersion[],
  startDate: Date,
  endDate: Date,
  oldestExtendsToStart: boolean
): Array<{ version: ClassConfigVersion; windowStart: Date; windowEnd: Date }> {
  const windows: Array<{ version: ClassConfigVersion; windowStart: Date; windowEnd: Date }> = [];

  for (let i = 0; i < versions.length; i++) {
    const version = versions[i];
    const nextVersion = versions[i + 1];

    const windowStart =
      i === 0 && oldestExtendsToStart
        ? startDate
        : maxDate(startDate, version.createdAt);

    let windowEnd = endDate;
    if (nextVersion) {
      // Exclusive end at the next version's effective timestamp
      const endJustBeforeNext = new Date(nextVersion.createdAt.getTime() - 1);
      windowEnd = minDate(endDate, endJustBeforeNext);
    }

    if (windowStart > windowEnd) {
      continue;
    }

    windows.push({ version, windowStart, windowEnd });
  }

  return windows;
}

/**
 * Generate regular (non-exception) class dates across config version windows.
 */
async function calculateVersionedBaseDates(
  classData: any,
  startDate: Date,
  endDate: Date,
  classId: string
): Promise<CalculatedClassDate[]> {
  const { versions, oldestExtendsToStart } = await fetchConfigVersionsNeeded(
    classId,
    startDate,
    classData
  );
  const dates: CalculatedClassDate[] = [];

  for (const { version, windowStart, windowEnd } of getVersionWindows(
    versions,
    startDate,
    endDate,
    oldestExtendsToStart
  )) {
    const versionedClassData = applyVersionToClassData(classData, version);
    const baseDates = calculateClassDates(versionedClassData, windowStart, windowEnd);
    for (const date of baseDates) {
      dates.push(enrichDateWithVersion(date, version));
    }
  }

  return dates.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Calculate class dates with schedule versioning and exception support.
 * This is the enhanced version that handles:
 * 1. Historical schedule versions (subcollection, lazy-fetched)
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

  // Second pass: Generate regular schedule dates from version windows, applying cancellations
  const baseDates = await calculateVersionedBaseDates(classData, startDate, endDate, classId);

  for (const baseDate of baseDates) {
    const date = baseDate.date;
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
        dates.push({ ...baseDate });
      }
      continue;
    }

    if (exception?.type === 'cancelled') {
      // Show cancelled class with cancelled flag
      dates.push({
        ...baseDate,
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
      dates.push({ ...baseDate });
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

      // Prefer the schedule that applied on this date (version window), else parent current schedule
      const effectiveScheduleType = calcDate.scheduleType || classItem.scheduleType;
      const effectiveSchedules = calcDate.schedules || classItem.schedules;

      // Handle different schedule types
      if (effectiveScheduleType === 'multiple' && Array.isArray(effectiveSchedules)) {
        // For rescheduled classes, use their specified times even if no matching schedule
        if (calcDate.isRescheduled) {
          classEntry = {
            id: classItem.id,
            startTime: calcDate.startTime || classItem.startTime,
            endTime: calcDate.endTime || classItem.endTime,
            timezone: calcDate.timezone || classItem.timezone,
            courseType: classItem.courseType,
            students: classItem.students || []
          };
        } else {
          // For regular classes, find the matching schedule for this day
          const matchingSchedule = effectiveSchedules.find((schedule: any) => schedule.dayOfWeek === date.getDay());
          if (matchingSchedule) {
            classEntry = {
              id: classItem.id,
              startTime: calcDate.startTime || matchingSchedule.startTime,
              endTime: calcDate.endTime || matchingSchedule.endTime,
              timezone: matchingSchedule.timezone || calcDate.timezone || classItem.timezone,
              courseType: classItem.courseType,
              students: classItem.students || []
            };
          } else if (calcDate.startTime || calcDate.endTime) {
            // Version may have stamped times even if DOW lookup fails
            classEntry = {
              id: classItem.id,
              startTime: calcDate.startTime || classItem.startTime,
              endTime: calcDate.endTime || classItem.endTime,
              timezone: calcDate.timezone || classItem.timezone,
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
          timezone: calcDate.timezone || classItem.timezone,
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
 * Calendar due dates are date-only. Use noon UTC so the civil day stays stable in
 * Cloud Functions (TZ=UTC) and in US/Brazil local display (midnight UTC shifts back a day).
 */
function calendarDateToUtcNoon(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0, 0));
}

function toUtcNoon(date: Date): Date {
  return calendarDateToUtcNoon(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
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

  // Get payment start date (noon UTC for date-only stability)
  let paymentStartDate: Date;
  if (paymentConfig.startDate) {
    const [year, month, day] = paymentConfig.startDate.split('-').map(Number);
    paymentStartDate = calendarDateToUtcNoon(year, month - 1, day);
  } else if (classData.startDate) {
    paymentStartDate = toUtcNoon(classData.startDate.toDate());
  } else {
    paymentStartDate = toUtcNoon(startDate);
  }

  const rangeStart = toUtcNoon(startDate);
  const rangeEnd = toUtcNoon(endDate);

  // If payment start date is after the end of the requested month, no payments are due
  if (paymentStartDate > rangeEnd) {
    return dates;
  }

  // Calculate payment dates based on payment type
  if (paymentConfig.type === 'weekly') {
    const interval = paymentConfig.weeklyInterval || 1;
    let currentPaymentDate = new Date(paymentStartDate);

    // Adjust to be within the month range
    if (currentPaymentDate < rangeStart) {
      const diffTime = rangeStart.getTime() - currentPaymentDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const intervalsToAdd = Math.ceil(diffDays / (7 * interval));

      currentPaymentDate = new Date(
        currentPaymentDate.getTime() + intervalsToAdd * 7 * interval * 24 * 60 * 60 * 1000
      );
      currentPaymentDate = toUtcNoon(currentPaymentDate);
    }

    // Generate payment dates
    while (currentPaymentDate <= rangeEnd) {
      if (currentPaymentDate >= paymentStartDate) {
        dates.push(toUtcNoon(currentPaymentDate));
      }
      currentPaymentDate = new Date(
        currentPaymentDate.getTime() + 7 * interval * 24 * 60 * 60 * 1000
      );
      currentPaymentDate = toUtcNoon(currentPaymentDate);
    }
  } else if (paymentConfig.type === 'monthly') {
    const monthlyOption = paymentConfig.monthlyOption || 'first';

    // Use UTC parts of the range so CF timezone does not shift the civil month
    const year = rangeStart.getUTCFullYear();
    const month = rangeStart.getUTCMonth();

    let paymentDate: Date;
    switch (monthlyOption) {
      case 'first':
        paymentDate = calendarDateToUtcNoon(year, month, 1);
        break;
      case 'fifteen':
        paymentDate = calendarDateToUtcNoon(year, month, 15);
        break;
      case 'last':
        paymentDate = calendarDateToUtcNoon(year, month + 1, 0); // Last day of the month
        break;
      default:
        paymentDate = calendarDateToUtcNoon(year, month, 1);
    }

    // Add the payment date if it's within the range and after the payment start date
    if (paymentDate >= paymentStartDate && paymentDate <= rangeEnd) {
      dates.push(paymentDate);
    }

    // Check if we need to include the next month's payment date
    // This happens when the month spans into the next month
    if (rangeEnd.getUTCMonth() !== rangeStart.getUTCMonth() ||
        rangeEnd.getUTCFullYear() !== rangeStart.getUTCFullYear()) {
      const nextMonth = month + 1;
      const nextYear = year + (nextMonth > 11 ? 1 : 0);
      const normalizedNextMonth = nextMonth % 12;

      let nextPaymentDate: Date;
      switch (monthlyOption) {
        case 'first':
          nextPaymentDate = calendarDateToUtcNoon(nextYear, normalizedNextMonth, 1);
          break;
        case 'fifteen':
          nextPaymentDate = calendarDateToUtcNoon(nextYear, normalizedNextMonth, 15);
          break;
        case 'last':
          nextPaymentDate = calendarDateToUtcNoon(nextYear, normalizedNextMonth + 1, 0);
          break;
        default:
          nextPaymentDate = calendarDateToUtcNoon(nextYear, normalizedNextMonth, 1);
      }

      if (nextPaymentDate >= paymentStartDate && nextPaymentDate <= rangeEnd) {
        dates.push(nextPaymentDate);
      }
    }
  }

  return dates.sort((a, b) => a.getTime() - b.getTime());
}

interface VersionedPaymentDue {
  date: Date;
  paymentConfig: any;
}

/**
 * Generate payment due dates across config version windows.
 * Uses each version's paymentConfig; schedule-only archives inherit payment from the
 * nearest later version that stored one (not from the live parent).
 */
async function calculateVersionedPaymentDueDates(
  classData: any,
  userData: any,
  startDate: Date,
  endDate: Date,
  classId: string
): Promise<VersionedPaymentDue[]> {
  const { versions, oldestExtendsToStart } = await fetchConfigVersionsNeeded(
    classId,
    startDate,
    classData
  );
  const byDateKey = new Map<string, VersionedPaymentDue>();
  const windows = getVersionWindows(
    versions,
    startDate,
    endDate,
    oldestExtendsToStart
  );

  for (const { version, windowStart, windowEnd } of windows) {
    const versionIndex = versions.findIndex((v) => v.id === version.id);
    const paymentConfig = resolvePaymentConfigForVersion(
      version,
      versionIndex >= 0 ? versionIndex : versions.length - 1,
      versions,
      classData.paymentConfig
    );

    // Do not fall back to user-level paymentConfig for archived windows — that also
    // ignores class payment history. Current window may still use user fallback below.
    const versionedClassData = applyVersionToClassData(
      classData,
      version,
      paymentConfig
    );

    let windowDates: Date[];
    if (paymentConfig) {
      windowDates = calculatePaymentDueDates(
        versionedClassData,
        null,
        windowStart,
        windowEnd
      );
    } else if (version.id === 'current') {
      windowDates = calculatePaymentDueDates(
        versionedClassData,
        userData,
        windowStart,
        windowEnd
      );
    } else {
      windowDates = [];
    }

    const resolvedPaymentConfig =
      paymentConfig ||
      (version.id === 'current' && userData && userData.paymentConfig) ||
      null;

    for (const date of windowDates) {
      const key = toDateKey(date);
      if (!byDateKey.has(key)) {
        byDateKey.set(key, { date, paymentConfig: resolvedPaymentConfig });
      }
    }
  }

  return Array.from(byDateKey.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
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

        // Calculate payment due dates per config version window
        const versionedPaymentDues = await calculateVersionedPaymentDueDates(
          classData,
          userData,
          startDate,
          endDate,
          classId
        );
        const paymentDates = versionedPaymentDues.map((entry) => entry.date);

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
          paymentDueDates: paymentDates,
          scheduleType: classData.scheduleType || 'single',
          schedules: classData.schedules || []
        };

        // Build payment entries (link/amount from the version effective on that due date)
        const paymentEntries = versionedPaymentDues.map(({ date, paymentConfig }) => ({
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
            paymentConfig: paymentConfig || classData.paymentConfig
          },
          paymentLink: paymentConfig?.paymentLink || null,
          amount: paymentConfig?.amount || null
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

      // Birthdays for the month: never scan the whole `users` collection.
      // — Students: only their own birthday.
      // — Teachers: their students (where `teacher` == this user's auth uid) and their own.
      const birthdays: Array<{
        userId: string;
        name: string;
        email: string;
        birthdate: string;
        day: number;
      }> = [];

      const addBirthdayIfInMonth = (
        firestoreUserId: string,
        u: { name?: string; email?: string; birthdate?: string }
      ) => {
        if (!u.birthdate) return;
        // Birthdate format is MM-DD
        const [birthMonth, birthDay] = u.birthdate.split('-').map(Number);
        if (Number.isNaN(birthMonth) || Number.isNaN(birthDay)) return;
        if (birthMonth === monthInt + 1) {
          birthdays.push({
            userId: firestoreUserId,
            name: u.name ?? '',
            email: u.email ?? '',
            birthdate: u.birthdate,
            day: birthDay
          });
        }
      };

      if (userData.isAdmin === true) {
        if (userData.uid) {
          const studentsSnapshot = await admin.firestore().collection('users')
            .where('teacher', '==', userData.uid)
            .get();
          for (const doc of studentsSnapshot.docs) {
            addBirthdayIfInMonth(doc.id, doc.data());
          }
        }
        addBirthdayIfInMonth(userData.id, userData);
      } else {
        addBirthdayIfInMonth(userData.id, userData);
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

        const versionedPaymentDues = await calculateVersionedPaymentDueDates(
          classData,
          students[0] || null,
          startDate,
          endDate,
          classId
        );

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
          paymentDueDates: versionedPaymentDues.map((entry) => entry.date),
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

      // Set custom claims immediately so the client's forced token refresh
      // picks them up without any race window against the onDocumentWritten trigger.
      await admin.auth().setCustomUserClaims(uid, {
        teacher: currentData.teacher ?? null,
        isAdmin: currentData.isAdmin === true,
        id: currentData.id ?? null
      });

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

export const syncUserClaims = onDocumentWritten(
  { document: "users/{userId}", region: REGION },
  async (event) => {
    const data = event.data?.after?.data();
    if (!data?.uid) return; // doc deleted or no auth uid

    await admin.auth().setCustomUserClaims(data.uid, {
      teacher: data.teacher ?? null,
      isAdmin: data.isAdmin === true,
      id: data.id
    });

    logger.info('Synced custom claims', { uid: data.uid, isAdmin: data.isAdmin === true, hasTeacher: !!data.teacher });
  }
);

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

// One-time backfill: sets custom claims on all existing active users.
// Call once as an admin, then this export can be removed.
export const backfillUserClaims = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new Error('Unauthorized');
  }

  // Verify the caller is an admin.
  const callerDoc = await admin.firestore()
    .collection('users')
    .where('uid', '==', request.auth.uid)
    .limit(1)
    .get();

  if (callerDoc.empty || callerDoc.docs[0].data().isAdmin !== true) {
    throw new Error('Forbidden: admin only');
  }

  const usersSnapshot = await admin.firestore().collection('users').get();
  const results: { uid: string; status: string }[] = [];

  for (const doc of usersSnapshot.docs) {
    const data = doc.data();
    if (!data.uid) {
      results.push({ uid: doc.id, status: 'skipped (no uid field)' });
      continue;
    }

    try {
      await admin.auth().setCustomUserClaims(data.uid, {
        teacher: data.teacher ?? null,
        isAdmin: data.isAdmin === true,
        id: data.id ?? null
      });
      results.push({ uid: data.uid, status: 'ok' });
    } catch (err) {
      logger.error('backfillUserClaims failed', err);
      const message = err instanceof Error ? err.message : String(err);
      results.push({ uid: data.uid, status: `error: ${message}` });
    }
  }

  logger.info('backfillUserClaims complete', { count: results.length, results });
  return { results };
});

export const registerPaymentFromStripe = onRequest({
  region: REGION,
  cors: true
}, async (request, response) => {
  corsHandler(request, response, async () => {
    if (request.method !== 'POST') {
      response.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const registerSecret = process.env.REGISTER_PAYMENT_SECRET;
    if (!registerSecret) {
      logger.error('REGISTER_PAYMENT_SECRET is not configured');
      response.status(500).json({ error: 'Payment registration not configured' });
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${registerSecret}`) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const result = await registerPaymentFromStripeData(request.body);
      response.status(200).json(result);
    } catch (error) {
      logger.error('registerPaymentFromStripe error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      const status = message.includes('not found') || message.includes('required') ? 400 : 500;
      response.status(status).json({ error: message });
    }
  });
});

export * from './emailFunctions';