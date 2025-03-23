import { ClassSession } from './scheduleUtils';
import { User } from '../types/interfaces';
// Utility function to check if a date is within the relevant month range
export const isDateInRelevantMonthRange = (date: Date, selectedDate: Date): boolean => {
  const dateMonth = date.getMonth();
  const dateYear = date.getFullYear();
  const currentMonth = selectedDate.getMonth();
  const currentYear = selectedDate.getFullYear();
  
  return (
    (dateMonth === currentMonth && dateYear === currentYear) || // Current month
    (dateMonth === currentMonth - 1 && dateYear === currentYear) || // Previous month
    (dateMonth === currentMonth + 1 && dateYear === currentYear) || // Next month
    // Handle year boundary cases
    (dateMonth === 11 && currentMonth === 0 && dateYear === currentYear - 1) || // December of previous year
    (dateMonth === 0 && currentMonth === 11 && dateYear === currentYear + 1)    // January of next year
  );
};

// Utility function to generate month keys for tracking loaded data
export const getMonthKey = (date: Date, offset: number = 0): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + offset;
  
  // Handle year boundaries
  if (month < 0) {
    return `${year - 1}-${11}`; // December of previous year
  } else if (month > 11) {
    return `${year + 1}-${0}`; // January of next year
  }
  
  return `${year}-${month}`;
};

// Utility function to get the three relevant month keys (previous, current, next)
export const getRelevantMonthKeys = (date: Date): string[] => {
  return [
    getMonthKey(date, -1), // Previous month
    getMonthKey(date, 0),  // Current month
    getMonthKey(date, 1)   // Next month
  ];
};

// Function to parse time string to minutes for sorting
export const parseTimeToMinutes = (time: string): number => {
  if (!time) return 0;
  
  // Remove any AM/PM and spaces
  const cleanTime = time.toLowerCase().replace(/[ap]m\s*/g, '');
  const [hours, minutes] = cleanTime.split(':').map(Number);
  
  let totalMinutes = hours * 60 + minutes;
  
  // Handle AM/PM
  if (time.toLowerCase().includes('pm') && hours !== 12) {
    totalMinutes += 12 * 60;
  } else if (time.toLowerCase().includes('am') && hours === 12) {
    totalMinutes = minutes;
  }
  
  return totalMinutes;
};

// Function to sort classes by time
export const sortClassesByTime = (classes: ClassSession[]) => {
  return [...classes].sort((a, b) => {
    // First sort by day of week
    const dayDiff = (a.dayOfWeek || 0) - (b.dayOfWeek || 0);
    if (dayDiff !== 0) return dayDiff;
    
    // Then sort by time
    const timeA = a.startTime || '';
    const timeB = b.startTime || '';
    
    return parseTimeToMinutes(timeA) - parseTimeToMinutes(timeB);
  });
};

// Function to get the next occurrence date of a class
export const getNextClassDate = (classSession: ClassSession): Date | null => {
  if (!classSession.dayOfWeek && classSession.dayOfWeek !== 0) return null;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Calculate start of current week (Sunday)
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  
  // Calculate end of current week (Saturday)
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  
  const currentDayOfWeek = today.getDay();
  const targetDayOfWeek = classSession.dayOfWeek;
  
  // Calculate days until next occurrence
  let daysUntilNext = targetDayOfWeek - currentDayOfWeek;
  if (daysUntilNext <= 0) {
    // If today or earlier in the week, move to next week
    daysUntilNext += 7;
  }
  
  // If it's the same day, check if the class has already passed
  if (daysUntilNext === 0 && classSession.startTime) {
    const [hours, minutes] = classSession.startTime.split(':');
    let hour = parseInt(hours);
    if (classSession.startTime.toLowerCase().includes('pm') && hour !== 12) {
      hour += 12;
    } else if (classSession.startTime.toLowerCase().includes('am') && hour === 12) {
      hour = 0;
    }
    
    const classTime = new Date();
    classTime.setHours(hour, parseInt(minutes), 0, 0);
    
    // If the class time has passed, move to next week
    if (today > classTime) {
      daysUntilNext = 7;
    }
  }
  
  // Create the next class date
  const nextDate = new Date();
  nextDate.setDate(today.getDate() + daysUntilNext);
  nextDate.setHours(0, 0, 0, 0);
  
  // If the next date is after the end of the current week, return null
  if (nextDate > endOfWeek) {
    return null;
  }
  
  return nextDate;
};

// Function to get the previous occurrence date of a class
export const getPreviousClassDate = (classSession: ClassSession): Date | null => {
  if (!classSession.dayOfWeek && classSession.dayOfWeek !== 0) return null;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Calculate start of current week (Sunday)
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  
  // If class has a start date, make sure we don't go before it
  const classStartDate = classSession.startDate ? classSession.startDate.toDate() : null;
  if (classStartDate) {
    classStartDate.setHours(0, 0, 0, 0);
  }
  
  const currentDayOfWeek = today.getDay();
  const targetDayOfWeek = classSession.dayOfWeek;
  
  // Calculate days since last occurrence
  let daysSinceLast = currentDayOfWeek - targetDayOfWeek;
  if (daysSinceLast < 0) {
    // If later in the week, get from previous week
    daysSinceLast += 7;
  }
  
  // If it's the same day, check if the class has already passed
  if (daysSinceLast === 0 && classSession.startTime) {
    const [hours, minutes] = classSession.startTime.split(':');
    let hour = parseInt(hours);
    if (classSession.startTime.toLowerCase().includes('pm') && hour !== 12) {
      hour += 12;
    } else if (classSession.startTime.toLowerCase().includes('am') && hour === 12) {
      hour = 0;
    }
    
    const classTime = new Date();
    classTime.setHours(hour, parseInt(minutes), 0, 0);
    
    // If the class time hasn't passed yet, get from previous week
    if (today < classTime) {
      daysSinceLast = 7;
    }
  }
  
  // Create the previous class date
  const prevDate = new Date();
  prevDate.setDate(today.getDate() - daysSinceLast);
  prevDate.setHours(0, 0, 0, 0);
  
  // If this date is before the class start date or before the start of the current week, return null
  if ((classStartDate && prevDate < classStartDate) || prevDate < startOfWeek) {
    return null;
  }
  
  return prevDate;
};

// Function to get payment dates for a class
export const getNextPaymentDates = (paymentConfig: User['paymentConfig'], classSession: ClassSession, selectedDate: Date): Date[] => {
  if (!paymentConfig || !classSession.startDate) {
    return [];
  }
  
  const dates: Date[] = [];
  const startDate = classSession.startDate.toDate();
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
    const endDate = classSession.endDate.toDate();
    endDate.setHours(23, 59, 59, 999);
    if (endDate < monthStart) {
      return [];
    }
  }

  if (paymentConfig.type === 'weekly') {
    const interval = paymentConfig.weeklyInterval || 1;
    let currentPaymentDate = new Date(paymentStartDate);

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