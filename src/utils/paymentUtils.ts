import { ClassSession, User } from './scheduleUtils';
import { getBaseClassId } from './scheduleUtils';

// Define the PaymentDue interface locally
interface PaymentDue {
  user: User;
  classSession: ClassSession;
}

export const getNextPaymentDates = (paymentConfig: User['paymentConfig'], classSession: ClassSession, selectedDate: Date): Date[] => {
  if (!paymentConfig || !classSession.startDate) {
    return [];
  }
  
  const dates: Date[] = [];
  
  // Handle both Firestore Timestamp objects and regular Date objects
  let startDate: Date;
  try {
    // First try to use toDate() method (for Firestore Timestamp)
    if (typeof classSession.startDate.toDate === 'function') {
      startDate = classSession.startDate.toDate();
    } else if (classSession.startDate instanceof Date) {
      // If it's already a Date object
      startDate = classSession.startDate;
    } else {
      // If it's a string or number, convert to Date
      startDate = new Date(classSession.startDate as any);
    }
  } catch (error) {
    console.error('Error converting startDate:', error);
    startDate = new Date(); // Fallback to current date
  }
  
  startDate.setHours(0, 0, 0, 0);
  
  // Parse the payment start date in local timezone
  const paymentStartDate = paymentConfig.startDate ? 
    new Date(paymentConfig.startDate + 'T00:00:00') : 
    startDate;
  paymentStartDate.setHours(0, 0, 0, 0);
  
  // Get the first and last day of the currently viewed month
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);
  
  // If class has ended, no payments
  if (classSession.endDate) {
    // Handle both Firestore Timestamp objects and regular Date objects
    let endDate: Date;
    try {
      // First try to use toDate() method (for Firestore Timestamp)
      if (typeof classSession.endDate.toDate === 'function') {
        endDate = classSession.endDate.toDate();
      } else if (classSession.endDate instanceof Date) {
        // If it's already a Date object
        endDate = classSession.endDate;
      } else {
        // If it's a string or number, convert to Date
        endDate = new Date(classSession.endDate as any);
      }
    } catch (error) {
      console.error('Error converting endDate:', error);
      endDate = new Date(); // Fallback to current date
    }
    
    endDate.setHours(23, 59, 59, 999);
    if (endDate < monthStart) {
      return [];
    }
  }

  if (paymentConfig.type === 'weekly') {
    const interval = paymentConfig.weeklyInterval || 1;
    let currentPaymentDate = new Date(paymentStartDate);

    // Calculate the next payment date after the start date
    while (currentPaymentDate < monthStart) {
      currentPaymentDate.setDate(currentPaymentDate.getDate() + (7 * interval));
    }

    // Add all payment dates within the month
    while (currentPaymentDate <= monthEnd) {
      if (currentPaymentDate >= monthStart) {
        dates.push(new Date(currentPaymentDate));
      }
      currentPaymentDate.setDate(currentPaymentDate.getDate() + (7 * interval));
    }
  } else if (paymentConfig.type === 'monthly') {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();

    let paymentDate: Date;
    switch (paymentConfig.monthlyOption) {
      case 'first':
        paymentDate = new Date(year, month, 1);
        break;
      case 'fifteen':
        paymentDate = new Date(year, month, 15);
        break;
      case 'last':
        paymentDate = new Date(year, month + 1, 0);
        break;
      default:
        return dates;
    }
    
    if (paymentDate >= paymentStartDate && 
        (!classSession.endDate || paymentDate <= classSession.endDate.toDate())) {
      dates.push(paymentDate);
    }
  }
  
  return dates;
};

export const getPaymentsDueForDay = (
  date: Date,
  upcomingClasses: ClassSession[],
  users: User[],
  isDateInRelevantMonthRange: (date: Date, selectedDate?: Date) => boolean
): PaymentDue[] => {
  // Check if the date is within the current month or adjacent months
  if (!isDateInRelevantMonthRange(date, date)) {
    return [];
  }
  
  // Debug log for May 11, 2025
  if (date.getFullYear() === 2025 && date.getMonth() === 4 && date.getDate() === 11) {
    console.log(`getPaymentsDueForDay called for May 11, 2025 with ${upcomingClasses.length} classes`);
    if (upcomingClasses.length > 0) {
      console.log('First class ID:', upcomingClasses[0].id);
      console.log('First class payment config:', upcomingClasses[0].paymentConfig);
    }
  }
  
  const paymentsDue: PaymentDue[] = [];
  const processedClassIds = new Set<string>();
  
  upcomingClasses.forEach(classSession => {
    // Extract the base class ID (for multiple schedule classes, we need to remove the day suffix)
    const baseClassId = getBaseClassId(classSession.id);
    
    // Skip if we've already processed this class or its base class
    if (processedClassIds.has(baseClassId) || processedClassIds.has(classSession.id)) {
      return;
    }
    
    if (classSession.paymentConfig) {
      const paymentDates = getNextPaymentDates(classSession.paymentConfig, classSession, date);
      
      const isPaymentDue = paymentDates.some(paymentDate => 
        paymentDate.getFullYear() === date.getFullYear() &&
        paymentDate.getMonth() === date.getMonth() &&
        paymentDate.getDate() === date.getDate()
      );
      
      if (isPaymentDue) {
        // Mark both the actual class ID and the base class ID as processed
        processedClassIds.add(classSession.id);
        processedClassIds.add(baseClassId);
        
        // Add one entry per student
        classSession.studentEmails.forEach(email => {
          const user = users.find(u => u.email === email);
          if (user) {
            paymentsDue.push({ user, classSession });
          }
        });
      }
    }
  });
  
  // Debug log for May 11, 2025
  if (date.getFullYear() === 2025 && date.getMonth() === 4 && date.getDate() === 11) {
    console.log(`Found ${paymentsDue.length} payments due for May 11, 2025`);
  }
  
  return paymentsDue;
}; 