/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { onRequest } from "firebase-functions/v2/https";
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

// Create a CORS handler
const corsHandler = cors({
  origin: [
    "http://localhost:5173",
    "http://localhost",
    "https://app.inglesabordo.com",
    "https://inglesabordo.com"
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
});

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
      if (email) {
        const usersSnapshot = await admin.firestore().collection('users')
          .where('email', '==', email)
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
      
      for (const doc of classesSnapshot.docs) {
        const classData = doc.data();
        
        // Skip classes that have ended before the requested month
        if (classData.endDate && classData.endDate.toDate() < startDate) {
          continue;
        }
        
        // Skip classes that start after the requested month
        if (classData.startDate && classData.startDate.toDate() > endDate) {
          continue;
        }

        // Get the actual start date to use (either class start date or month start)
        const effectiveStartDate = classData.startDate && classData.startDate.toDate() > startDate 
          ? classData.startDate.toDate() 
          : new Date(startDate);
        
        // Get the actual end date to use (either class end date or month end)
        const effectiveEndDate = classData.endDate && classData.endDate.toDate() < endDate 
          ? classData.endDate.toDate() 
          : new Date(endDate);

        // Calculate class dates based on recurrence pattern
        const classDates = calculateClassDates(
          classData,
          effectiveStartDate,
          effectiveEndDate
        );

        if (classDates.length > 0) {
          // Calculate payment due dates
          const paymentDates = calculatePaymentDueDates(
            classData,
            userData,
            startDate,
            endDate
          );

          classSchedule.push({
            classDetails: {
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
              dates: classDates
            },
            dates: classDates,
            paymentDueDates: paymentDates
          });

          // Add payment dates to the overall list
          paymentDueDates.push(...paymentDates.map(date => ({
            date,
            paymentLink: classData.paymentConfig?.paymentLink || null
          })));
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
    
    // Log for debugging
    logger.info(`Multiple schedule type detected with days: ${daysOfWeek.join(', ')}`);
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
  
  // Log frequency information for debugging
  logger.info(`Class frequency: ${JSON.stringify(frequency)}, calculated interval: ${interval}`);
  
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
  
  // Log the calculated dates for debugging
  logger.info(`Calculated ${dates.length} class dates`);
  
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
            ...userDoc.data()
          };
        }
      } else if (userId) {
        const userDoc = await admin.firestore().collection('users').doc(userId as string).get();
        if (userDoc.exists) {
          userData = {
            ...userDoc.data()
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
      
      for (const doc of classesSnapshot.docs) {
        const classData = doc.data();
        const classId = doc.id;
        classIds.push(classId);
        
        // Log class data for debugging
        logger.info(`Processing class: ${classId}`, classData);
        
        // Skip classes that have ended before the requested month
        if (classData.endDate && classData.endDate.toDate() < startDate) {
          continue;
        }
        
        // Skip classes that start after the requested month
        if (classData.startDate && classData.startDate.toDate() > endDate) {
          continue;
        }

        // Get the actual start date to use (either class start date or month start)
        const effectiveStartDate = classData.startDate && classData.startDate.toDate() > startDate 
          ? classData.startDate.toDate() 
          : new Date(startDate);
        
        // Get the actual end date to use (either class end date or month end)
        const effectiveEndDate = classData.endDate && classData.endDate.toDate() < endDate 
          ? classData.endDate.toDate() 
          : new Date(endDate);

        // Calculate class dates based on recurrence pattern
        const classDates = calculateClassDates(
          classData,
          effectiveStartDate,
          effectiveEndDate
        );

        if (classDates.length > 0) {
          // Calculate payment due dates
          const paymentDates = calculatePaymentDueDates(
            classData,
            userData,
            startDate,
            endDate
          );

          // Create a base class object
          const baseClassInfo = {
            classDetails: {
              dayOfWeek: classData.dayOfWeek,
              daysOfWeek: classData.daysOfWeek,
              scheduleType: classData.scheduleType,
              schedules: classData.schedules,
              frequency: classData.frequency,
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
              dates: classDates
            },
            dates: classDates,
            paymentDueDates: paymentDates
          };

          // Handle multiple schedule types
          if (classData.scheduleType === 'multiple' && Array.isArray(classData.schedules)) {
            // For multiple schedules, create a separate class object for each day
            classData.schedules.forEach((schedule: any) => {
              // Filter dates to only include those matching this day of week
              const dayDates = classDates.filter(date => date.getDay() === schedule.dayOfWeek);
              
              if (dayDates.length > 0) {
                const dayClassInfo = {
                  classDetails: {
                    ...baseClassInfo.classDetails,
                    id: `${classId}-${schedule.dayOfWeek}`, // Create a unique ID for each day
                    dayOfWeek: schedule.dayOfWeek,
                    startTime: schedule.startTime,
                    endTime: schedule.endTime,
                    dates: dayDates
                  },
                  dates: dayDates,
                  paymentDueDates: paymentDates
                };
                classSchedule.push(dayClassInfo);
              }
            });
          } else {
            // For single schedule classes, just add the original class info
            classSchedule.push(baseClassInfo);
          }

          // Add payment dates to the overall list
          paymentDueDates.push(...paymentDates.map(date => ({
            date,
            paymentLink: classData.paymentConfig?.paymentLink || null
          })));
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
      
      if (userData.id || userEmail) {
        try {
          // Check if we should query by ID or email
          if (userEmail) {
            // Try both userId field formats
            const paymentsSnapshotByEmail = await admin.firestore().collection('payments')
              .where('userId', '==', userEmail)
              .where('dueDate', '>=', startDate)
              .where('dueDate', '<=', endDate)
              .get();
              
            // Process payments by email
            for (const doc of paymentsSnapshotByEmail.docs) {
              const paymentData = doc.data();
              
              if (paymentData.dueDate) {
                try {
                  completedPayments.push({
                    ...paymentData,
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
          
          // Also try with user ID if available
          if (userData.id) {
            const paymentsSnapshotById = await admin.firestore().collection('payments')
              .where('userId', '==', userData.id)
              .where('dueDate', '>=', startDate)
              .where('dueDate', '<=', endDate)
              .get();
              
            // Process payments by ID
            for (const doc of paymentsSnapshotById.docs) {
              const paymentData = doc.data();
              
              if (paymentData.dueDate) {
                try {
                  completedPayments.push({
                    ...paymentData,
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

      response.status(200).json({ 
        classes: classSchedule,
        materials: materialsByClass,
        paymentDueDates: paymentDueDates.sort((a, b) => a.date.getTime() - b.date.getTime()),
        completedPayments,
        birthdays,
        userData,
        month: monthInt,
        year: yearInt
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
  // Log function start with request details
  console.info("getAllClassesForMonthHttp called:", {
    method: request.method,
    url: request.url,
    query: request.query
  });
  
  try {
    // Handle CORS
    corsHandler(request, response, async () => {
      try {
        const { month, year, adminId } = request.query;
        
        // Validate required parameters
        if (!month || !year) {
          console.error("Missing required parameters:", { month, year });
          response.status(400).json({ error: 'Month and year are required' });
          return;
        }

        // Verify admin status
        if (adminId) {
          const adminDoc = await admin.firestore().collection('users').doc(adminId as string).get();
          
          if (!adminDoc.exists) {
            console.error(`Admin document does not exist for user: ${adminId}`);
            response.status(403).json({ error: 'Unauthorized. Admin not found.' });
            return;
          }
          
          const userData = adminDoc.data();
          
          if (!userData?.isAdmin) {
            console.error(`User ${adminId} is not an admin`);
            response.status(403).json({ error: 'Unauthorized. Admin access required.' });
            return;
          }
        } else {
          console.error("No adminId provided");
          response.status(403).json({ error: 'Unauthorized. Admin ID required.' });
          return;
        }

        // Parse month and year to integers
        const monthInt = parseInt(month as string);
        const yearInt = parseInt(year as string);

        // Validate month and year
        if (isNaN(monthInt) || monthInt < 0 || monthInt > 11) {
          console.error("Invalid month:", month);
          response.status(400).json({ error: 'Invalid month. Must be between 0 and 11.' });
          return;
        }

        if (isNaN(yearInt) || yearInt < 2000 || yearInt > 2100) {
          console.error("Invalid year:", year);
          response.status(400).json({ error: 'Invalid year. Must be between 2000 and 2100.' });
          return;
        }

        // Create date range for the requested month
        const startDate = new Date(yearInt, monthInt, 1);
        const endDate = new Date(yearInt, monthInt + 1, 0); // Last day of the month

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
          console.info("No users found with this teacher ID");
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
        console.info("Querying classes for students:", userEmails);
        
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
          console.error("No classes found for these students");
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
        console.info("Processing classes");
        const classSchedule = [];
        const dailyClassMap: Record<string, any[]> = {}; // Map of date strings to classes
        
        for (const doc of classesSnapshot.docs) {
          const classData = doc.data();
          const classId = doc.id;
          
          // Skip classes that have ended before the requested month
          if (classData.endDate && classData.endDate.toDate() < startDate) {
            continue;
          }
          
          // Skip classes that start after the requested month
          if (classData.startDate && classData.startDate.toDate() > endDate) {
            continue;
          }

          // Get the actual start date to use (either class start date or month start)
          const effectiveStartDate = classData.startDate && classData.startDate.toDate() > startDate 
            ? classData.startDate.toDate() 
            : new Date(startDate);
          
          // Get the actual end date to use (either class end date or month end)
          const effectiveEndDate = classData.endDate && classData.endDate.toDate() < endDate 
            ? classData.endDate.toDate() 
            : new Date(endDate);

          // Calculate class dates based on recurrence pattern
          const classDates = calculateClassDates(
            classData,
            effectiveStartDate,
            effectiveEndDate
          );
          
          console.info("Class dates:", classDates);
          if (classDates.length > 0) {
            // Get student details - only include students taught by this admin
            const relevantStudentEmails = classData.studentEmails.filter((email: string) => userEmails.includes(email));
            const students = relevantStudentEmails.map((email: string) => {
              const user = usersMap.get(email);
              return user || { email };
            });

            // Create a class object that matches the ClassSession interface in the frontend
            const classInfo: any = {
              dayOfWeek: classData.dayOfWeek,
              daysOfWeek: classData.daysOfWeek,
              startTime: classData.startTime,
              endTime: classData.endTime,
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
              dates: classDates
            };

            // Add schedule type and schedules for multiple schedule classes
            if (classData.scheduleType === 'multiple' && Array.isArray(classData.schedules)) {
              // For multiple schedules, create a separate class object for each day
              classData.schedules.forEach((schedule: any) => {
                const dayClassInfo = {
                  ...classInfo,
                  id: `${classId}-${schedule.dayOfWeek}`, // Create a unique ID for each day
                  dayOfWeek: schedule.dayOfWeek,
                  startTime: schedule.startTime,
                  endTime: schedule.endTime,
                  scheduleType: 'multiple',
                  schedules: classData.schedules,
                  // Filter dates to only include those matching this day of week
                  dates: classDates.filter(date => date.getDay() === schedule.dayOfWeek)
                };
                classSchedule.push(dayClassInfo);
              });
            } else {
              // For single schedule classes, just add the original class info
              classSchedule.push(classInfo);
            }

            // Add to daily class map
            classDates.forEach(date => {
              const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD
              if (!dailyClassMap[dateString]) {
                dailyClassMap[dateString] = [];
              }
              
              // Get the day of week for this date
              const dayOfWeek = date.getDay();
              
              // Determine the correct start and end times based on schedule type
              let startTime = classData.startTime;
              let endTime = classData.endTime;
              
              // For multiple schedules, find the matching schedule for this day of week
              if (classData.scheduleType === 'multiple' && Array.isArray(classData.schedules)) {
                const matchingSchedule = classData.schedules.find((schedule: any) => 
                  schedule.dayOfWeek === dayOfWeek
                );
                
                if (matchingSchedule) {
                  startTime = matchingSchedule.startTime;
                  endTime = matchingSchedule.endTime;
                }
              }
              
              dailyClassMap[dateString].push({
                id: classId, // Add class ID for reference
                startTime: startTime,
                endTime: endTime,
                courseType: classData.courseType,
                students: relevantStudentEmails.map((email: string) => {
                  const user = usersMap.get(email);
                  return user ? user.name : email;
                })
              });
            });
          }
        }

        // Sort classes in each day by start time
        Object.keys(dailyClassMap).forEach(dateString => {
          dailyClassMap[dateString].sort((a, b) => {
            // Parse time strings to compare
            const timeA = a.startTime ? a.startTime.replace(/[^0-9:]/g, '') : '00:00';
            const timeB = b.startTime ? b.startTime.replace(/[^0-9:]/g, '') : '00:00';
            
            const [hoursA, minutesA] = timeA.split(':').map(Number);
            const [hoursB, minutesB] = timeB.split(':').map(Number);
            
            // Convert to minutes for comparison
            const totalMinutesA = hoursA * 60 + minutesA;
            const totalMinutesB = hoursB * 60 + minutesB;
            
            return totalMinutesA - totalMinutesB;
          });
        });

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
        // Error logging
        console.error("Error in getAllClassesForMonth:", error);
        
        if (error instanceof Error) {
          console.error("Error details:", {
            name: error.name,
            message: error.message,
            stack: error.stack
          });
        }
        
        response.status(500).json({ error: 'Internal server error' });
      }
    });
  } catch (corsError) {
    console.error("CORS handling error:", corsError);
    response.status(500).json({ error: 'CORS handling error' });
  }
});
