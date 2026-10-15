import { ClassSession } from './scheduleUtils';
import { getBaseClassId } from './scheduleUtils';
import { User } from '../types/interfaces';
import { toDate } from './scheduleUtils';

export type PaymentUrgency = 'overdue' | 'dueToday' | 'dueSoon';

export interface UrgentPayment {
  dueDate: Date;
  urgency: PaymentUrgency;
  daysUntil: number;
  paymentLink: string | null;
  classSessionId: string;
  userEmail: string;
  amount?: number;
  currency?: string;
}

interface CalendarPaymentDueDate {
  date: string;
  paymentLink: string | null;
  amount?: number | null;
  currency?: string | null;
  classSession: {
    id: string;
    paymentConfig?: {
      amount?: number;
      currency?: string;
    };
  };
  user?: { email: string };
}

export type VersionedPaymentDueEntry = {
  date: string | Date;
  amount?: number | null;
  currency?: string | null;
  paymentLink?: string | null;
  paymentConfig?: ClassSession['paymentConfig'] | null;
};

export type PaymentDueDateValue = string | Date | VersionedPaymentDueEntry;

/** Stable key for deduping versioned payment due entries across month loads. */
export const paymentDueDedupKey = (value: PaymentDueDateValue): string => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'date' in value) {
    const date = value.date;
    return date instanceof Date ? date.toISOString() : String(date);
  }
  return String(value);
};

interface CalendarCompletedPayment {
  dueDate: string;
  amount?: number;
  currency?: string;
}

interface CalendarClassWithPayment {
  id: string;
  paymentConfig?: {
    amount?: number;
    currency?: string;
  };
}

const urgencyRank: Record<PaymentUrgency, number> = {
  overdue: 0,
  dueToday: 1,
  dueSoon: 2,
};

export const getPaymentUrgency = (dueDate: Date): PaymentUrgency => {
  const daysUntil = getDaysUntilPayment(dueDate);
  if (daysUntil < 0) return 'overdue';
  if (daysUntil === 0) return 'dueToday';
  return 'dueSoon';
};

export const getUrgentUnpaidPayments = (
  paymentDueDates: CalendarPaymentDueDate[],
  completedPayments: CalendarCompletedPayment[],
  classes: CalendarClassWithPayment[],
  fallbackUserEmail?: string
): UrgentPayment[] => {
  const urgent: UrgentPayment[] = [];

  for (const paymentDue of paymentDueDates) {
    const dueDateStr = paymentDue.date?.split('T')[0] || '';
    if (!dueDateStr) continue;

    const isCompleted = completedPayments.some(payment => {
      const paymentDueDateStr = payment.dueDate?.split('T')[0] || '';
      return paymentDueDateStr === dueDateStr;
    });
    if (isCompleted) continue;

    const dueDate = new Date(dueDateStr + 'T00:00:00');
    if (!isPaymentUrgent(dueDate)) continue;

    const associatedClass = classes.find(cls => cls.id === paymentDue.classSession.id);

    const userEmail = paymentDue.user?.email || fallbackUserEmail;
    if (!userEmail) continue;

    urgent.push({
      dueDate,
      urgency: getPaymentUrgency(dueDate),
      daysUntil: getDaysUntilPayment(dueDate),
      paymentLink: paymentDue.paymentLink,
      classSessionId: paymentDue.classSession.id,
      userEmail,
      amount:
        paymentDue.amount ??
        paymentDue.classSession.paymentConfig?.amount ??
        associatedClass?.paymentConfig?.amount,
      currency:
        paymentDue.currency ??
        paymentDue.classSession.paymentConfig?.currency ??
        associatedClass?.paymentConfig?.currency,
    });
  }

  return urgent.sort((a, b) => {
    const rankDiff = urgencyRank[a.urgency] - urgencyRank[b.urgency];
    if (rankDiff !== 0) return rankDiff;
    return a.dueDate.getTime() - b.dueDate.getTime();
  });
};

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
        (!classSession.endDate || (toDate(classSession.endDate) && paymentDate <= toDate(classSession.endDate)!))) {
      dates.push(paymentDate);
    }
  }
  
  return dates;
};

export const getDaysUntilPayment = (dueDate: Date): number => {
  return Math.ceil((dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
};

export const isPaymentOverdue = (dueDate: Date): boolean => {
  return getDaysUntilPayment(dueDate) < 0;
};

export const isPaymentDueToday = (dueDate: Date): boolean => {
  return getDaysUntilPayment(dueDate) === 0;
};

/** Unpaid payment due in 1–3 days (not overdue, not today). */
export const isPaymentDueSoon = (dueDate: Date): boolean => {
  const days = getDaysUntilPayment(dueDate);
  return days > 0 && days <= 3;
};

/** Overdue, due today, or due within 3 days — used for urgent styling and banner visibility. */
export const isPaymentUrgent = (dueDate: Date): boolean => {
  return getDaysUntilPayment(dueDate) <= 3;
};

type PaymentStatusLabels = {
  paymentDue: string;
  paymentStatusOverdue: string;
  paymentStatusDueToday: string;
  paymentStatusDueSoon: string;
};

export const getPaymentStatusHint = (dueDate: Date, labels: PaymentStatusLabels): string => {
  if (!isPaymentUrgent(dueDate)) return labels.paymentDue;
  switch (getPaymentUrgency(dueDate)) {
    case 'overdue':
      return labels.paymentStatusOverdue;
    case 'dueToday':
      return labels.paymentStatusDueToday;
    case 'dueSoon':
      return labels.paymentStatusDueSoon;
    default:
      return labels.paymentDue;
  }
};

const normalizePaymentDueDate = (value: PaymentDueDateValue): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value && typeof value === 'object' && 'date' in value) {
    return normalizePaymentDueDate(value.date as string | Date);
  }
  return null;
};

const isSameCalendarDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * Resolve the paymentConfig that applied on a specific due date.
 * Prefers server-versioned entry fields over the live class paymentConfig.
 */
export const getPaymentConfigForDueDate = (
  classSession: ClassSession,
  dueDate: Date
): ClassSession['paymentConfig'] | undefined => {
  const live = classSession.paymentConfig;
  const dues = classSession.paymentDueDates;
  if (!Array.isArray(dues) || dues.length === 0) {
    return live;
  }

  for (const entry of dues) {
    const entryDate = normalizePaymentDueDate(entry);
    if (!entryDate || !isSameCalendarDay(entryDate, dueDate)) continue;

    if (entry && typeof entry === 'object' && !(entry instanceof Date) && 'date' in entry) {
      const versioned = entry.paymentConfig;
      if (versioned) {
        return live ? { ...live, ...versioned } : versioned;
      }
      if (entry.amount != null || entry.currency != null || entry.paymentLink != null) {
        if (!live) {
          return {
            type: 'monthly',
            monthlyOption: 'first',
            startDate: dueDate.toISOString().split('T')[0],
            amount: entry.amount ?? 0,
            currency: entry.currency ?? 'USD',
            paymentLink: entry.paymentLink ?? '',
          };
        }
        return {
          ...live,
          amount: entry.amount ?? live.amount,
          currency: entry.currency ?? live.currency,
          paymentLink: entry.paymentLink ?? live.paymentLink,
        };
      }
    }
  }

  return live;
};

/**
 * Prefer server-computed paymentDueDates (version-aware) when present.
 * Falls back to live paymentConfig only for classes that have no server dues.
 */
const getPaymentDatesForClassOnMonth = (
  classSession: ClassSession,
  selectedDate: Date
): Date[] => {
  if (Array.isArray(classSession.paymentDueDates) && classSession.paymentDueDates.length > 0) {
    return classSession.paymentDueDates
      .map(normalizePaymentDueDate)
      .filter((d): d is Date => {
        if (!d) return false;
        return (
          d.getFullYear() === selectedDate.getFullYear() &&
          d.getMonth() === selectedDate.getMonth()
        );
      });
  }

  if (!classSession.paymentConfig) {
    return [];
  }

  return getNextPaymentDates(classSession.paymentConfig, classSession, selectedDate);
};

export const getPaymentsDueForDay = (
  date: Date,
  upcomingClasses: ClassSession[],
  users: User[],
  isDateInRelevantMonthRange: (date: Date, selectedDate?: Date) => boolean
): PaymentDue[] => {

  // Check if the date is within the current month or adjacent months
  if (!isDateInRelevantMonthRange(date, date)) {
    console.log('Date not in relevant month range:', date.toISOString());
    return [];
  }
  
  const paymentsDue: PaymentDue[] = [];
  const processedStudentClassPairs = new Set<string>();
  
  upcomingClasses.forEach(classSession => {
    const paymentDates = getPaymentDatesForClassOnMonth(classSession, date);

    const isPaymentDue = paymentDates.some(paymentDate =>
      isSameCalendarDay(paymentDate, date)
    );
    
    if (isPaymentDue) {
      // Amount/link for this due date come from the version window, not live parent config
      const paymentConfig = getPaymentConfigForDueDate(classSession, date);

      // Add one entry per student, but only if we haven't processed this student-class pair yet
      classSession.studentEmails.forEach(email => {
        const baseClassId = getBaseClassId(classSession.id);
        const studentClassKey = `${email}-${baseClassId}`;
        
        if (!processedStudentClassPairs.has(studentClassKey)) {
          const user = users.find(u => u.email === email);
          if (user) {
            const classSessionWithConfig: ClassSession = {
              ...classSession,
              paymentConfig
            };
            
            let classSessionWithSchedules = classSessionWithConfig;
            
            if (classSession.scheduleType === 'multiple' && Array.isArray(classSession.schedules)) {
              const sortedSchedules = [...classSession.schedules].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
              classSessionWithSchedules = {
                ...classSessionWithSchedules,
                schedules: sortedSchedules
              };
            }
            
            paymentsDue.push({ user, classSession: classSessionWithSchedules });
            processedStudentClassPairs.add(studentClassKey);
          }
        }
      });
    }
  });
  
  return paymentsDue;
}; 