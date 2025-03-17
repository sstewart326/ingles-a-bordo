import { Timestamp } from 'firebase/firestore';

export interface ClassSession {
  id: string;
  name: string;
  date?: string;
  title?: string;
  description?: string;
  students?: any[];  // Allow both string[] and object[] types
  studentEmails: string[];
  studentIds?: string[]; // Keep for backward compatibility
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  courseType?: string;
  notes?: string;
  privateNotes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  endDate?: Timestamp;
  startDate?: Timestamp;
  scheduleType?: 'single' | 'multiple';  // Type of schedule (single day or multiple days per week)
  schedules?: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>;  // For multiple days per week
  frequency?: {
    type: 'weekly' | 'biweekly' | 'custom';
    every: number; // 1 for weekly, 2 for biweekly, custom number for every X weeks
  };
  paymentConfig?: {
    type: 'weekly' | 'monthly';
    weeklyInterval?: number;  // for weekly payments, number of weeks
    monthlyOption?: 'first' | 'fifteen' | 'last';  // for monthly payments
    startDate: string;  // YYYY-MM-DD date string
    paymentLink?: string;  // URL for payment
    amount?: number;  // Payment amount
    currency?: string;  // Payment currency (e.g., USD, BRL)
  };
  materials?: any[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  birthdate?: string; // Format: "MM-DD"
  paymentConfig?: {
    type: 'weekly' | 'monthly';
    weeklyInterval?: number;  // for weekly payments, number of weeks
    monthlyOption?: 'first' | 'fifteen' | 'last';  // for monthly payments
    startDate: string;  // YYYY-MM-DD date string
    paymentLink?: string;  // URL for payment
  };
}

export interface ClassWithStudents extends ClassSession {
  students: {
    id: string;
    name?: string;
    email: string;
    paymentConfig?: {
      type: 'weekly' | 'monthly';
      weeklyInterval?: number;
      monthlyOption?: 'first' | 'fifteen' | 'last';
      startDate: string;
      paymentLink?: string;
      amount?: number;  // Payment amount
      currency?: string;  // Payment currency (e.g., USD, BRL)
    };
  }[];
  paymentConfig: {
    type: 'weekly' | 'monthly';
    weeklyInterval?: number;  // for weekly payments, number of weeks
    monthlyOption?: 'first' | 'fifteen' | 'last';  // for monthly payments
    startDate: string;  // YYYY-MM-DD date string
    paymentLink?: string;  // URL for payment
    amount?: number;  // Payment amount
    currency?: string;  // Payment currency (e.g., USD, BRL)
  };
}

export const formatClassTime = (classSession: ClassSession): string => {
  // For classes with multiple schedules, find the matching schedule for the day of week
  let startTime = classSession.startTime;
  let endTime = classSession.endTime;
  
  if (classSession.scheduleType === 'multiple' && Array.isArray(classSession.schedules) && classSession.dayOfWeek !== undefined) {
    const matchingSchedule = classSession.schedules.find(schedule => 
      schedule.dayOfWeek === classSession.dayOfWeek
    );
    
    if (matchingSchedule) {
      startTime = matchingSchedule.startTime;
      endTime = matchingSchedule.endTime;
    }
  }
  
  if (classSession.dayOfWeek !== undefined && startTime && endTime) {
    // Get timezone abbreviation
    const timezone = new Intl.DateTimeFormat('en', {
      timeZoneName: 'short',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }).formatToParts(new Date())
      .find(part => part.type === 'timeZoneName')?.value || '';

    // Format times to ensure they have AM/PM if not present
    const formatTimeString = (timeStr: string) => {
      if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
      const [hours, minutes] = timeStr.split(':').map(Number);
      const period = hours >= 12 ? 'PM' : 'AM';
      const hour12 = hours % 12 || 12;
      return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
    };

    const formattedStartTime = formatTimeString(startTime);
    const formattedEndTime = formatTimeString(endTime);

    return `${formattedStartTime} - ${formattedEndTime} ${timezone}`;
  }
  return '';
};

export const getClassesForDay = (
  classes: ClassWithStudents[],
  dayOfWeek: number,
  date: Date
): ClassWithStudents[] => {
  const today = startOfDay(new Date());
  const calendarDate = startOfDay(date);
  
  return classes.filter(classItem => {
    // Check if this date is on or after the class start date
    const classStartDate = startOfDay(classItem.startDate?.toDate() || new Date());
    const hasStarted = calendarDate >= classStartDate;      
    if (!hasStarted) {
      return false;
    }

    // If class has no end date, it's valid if it has started and matches the day of week
    if (!classItem.endDate) {
      return classItem.dayOfWeek === dayOfWeek;
    }
    
    // Otherwise check if it's not expired and within end date
    const isValid = classItem.dayOfWeek === dayOfWeek && 
      classItem.endDate.toDate() >= today && // Must not be expired
      calendarDate <= classItem.endDate.toDate(); // Must not be past the end date      
    return isValid;
  });
};

export const getNextPaymentDates = (
  paymentConfig: ClassSession['paymentConfig'],
  classItem: ClassSession | ClassWithStudents,
  selectedDate: Date
): Date[] => {
  if (!paymentConfig || !classItem.startDate) {
    return [];
  }
  
  const dates: Date[] = [];
  const startDate = classItem.startDate.toDate();
  startDate.setHours(0, 0, 0, 0);
  
  // Parse the payment start date in local timezone without time component
  const paymentStartDate = new Date(paymentConfig.startDate);
  paymentStartDate.setHours(0, 0, 0, 0);
  
  // Get the first and last day of the currently viewed month
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);
  
  // If class has ended, no payments
  if (classItem.endDate) {
    const endDate = classItem.endDate.toDate();
    endDate.setHours(23, 59, 59, 999);
    if (endDate < monthStart) {
      return [];
    }
  }

  // If we're viewing a month before the payment start date, return no dates
  if (monthEnd < paymentStartDate) {
    return [];
  }

  // Add the payment start date if it falls within the current month
  if (paymentStartDate >= monthStart && paymentStartDate <= monthEnd) {
    const newPaymentDate = new Date(paymentStartDate);
    const dateExists = dates.some(d => 
      d.getFullYear() === newPaymentDate.getFullYear() &&
      d.getMonth() === newPaymentDate.getMonth() &&
      d.getDate() === newPaymentDate.getDate()
    );
    if (!dateExists) {
      dates.push(newPaymentDate);
    }
  }
  
  if (paymentConfig.type === 'weekly') {
    const interval = paymentConfig.weeklyInterval || 1;
    let currentPaymentDate = new Date(paymentStartDate);
    
    // If we're viewing a month after the start date, find the first payment date in/before this month
    if (currentPaymentDate < monthStart) {
      const weeksToAdd = Math.ceil((monthStart.getTime() - currentPaymentDate.getTime()) / (7 * 24 * 60 * 60 * 1000) / interval) * interval;
      currentPaymentDate.setDate(currentPaymentDate.getDate() + (7 * weeksToAdd));
    }
    
    // Add all payment dates in this month
    while (currentPaymentDate <= monthEnd) {
      if (currentPaymentDate >= monthStart && currentPaymentDate >= paymentStartDate) {
        // Create new date object to avoid modifying the current one
        const paymentDate = new Date(currentPaymentDate);
        dates.push(paymentDate);
      }
      currentPaymentDate.setDate(currentPaymentDate.getDate() + (7 * interval));
    }
  } else if (paymentConfig.type === 'monthly') {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    
    // Create the payment date in the current timezone
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
    paymentDate.setHours(0, 0, 0, 0);
    
    // Only add the monthly payment date if it's after the payment start date
    if (paymentDate >= paymentStartDate && 
        (!classItem.endDate || paymentDate <= classItem.endDate.toDate())) {
      // Check if this date is not already in the dates array
      const dateExists = dates.some(d => d.getTime() === paymentDate.getTime());
      if (!dateExists) {
        dates.push(paymentDate);
      }
    }
  }
  
  return dates;
};

const startOfDay = (date: Date): Date => {
  const newDate = new Date(date);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
};

export const isClassPastToday = (dayOfWeek: number, startTime?: string): boolean => {
  const now = new Date();
  const currentDayOfWeek = now.getDay();
  
  // If it's not today, it's not past today
  if (dayOfWeek !== currentDayOfWeek) {
    return false;
  }

  // If it's today, check if the time has passed
  if (startTime) {
    const [hours, minutes] = startTime.split(':');
    let hour = parseInt(hours);
    if (startTime.toLowerCase().includes('pm') && hour !== 12) {
      hour += 12;
    } else if (startTime.toLowerCase().includes('am') && hour === 12) {
      hour = 0;
    }
    
    const classTime = new Date();
    classTime.setHours(hour, parseInt(minutes), 0, 0);
    
    return now > classTime;
  }
  
  return false;
};

export const isClassUpcoming = (dayOfWeek: number, startTime?: string): boolean => {
  const now = new Date();
  const currentDayOfWeek = now.getDay();
  
  // If the class is later this week
  if (dayOfWeek > currentDayOfWeek) {
    return true;
  } 
  // If it's today and hasn't started yet
  else if (dayOfWeek === currentDayOfWeek && startTime) {
    const [hours, minutes] = startTime.split(':');
    let hour = parseInt(hours);
    if (startTime.toLowerCase().includes('pm') && hour !== 12) {
      hour += 12;
    } else if (startTime.toLowerCase().includes('am') && hour === 12) {
      hour = 0;
    }
    
    const classTime = new Date();
    classTime.setHours(hour, parseInt(minutes), 0, 0);
    
    return now < classTime;
  }
  // If it's earlier in the week or today but already passed,
  // it's upcoming because it will happen next week
  return true;
};

export const formatTimeString = (timeStr: string): string => {
  if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
  const [hours, minutes] = timeStr.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
};

export const sortClassesByTime = (classes: ClassSession[]): ClassSession[] => {
  return [...classes].sort((a, b) => {
    const getTime = (timeStr: string | undefined) => {
      if (!timeStr) return 0;
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
      if (!match) return 0;
      let [_, hours, minutes, period] = match;
      let hour = parseInt(hours);
      if (period) {
        period = period.toUpperCase();
        if (period === 'PM' && hour !== 12) hour += 12;
        if (period === 'AM' && hour === 12) hour = 0;
      }
      return hour * 60 + parseInt(minutes);
    };
    return getTime(a.startTime) - getTime(b.startTime);
  });
}; 