import { ClassSession, sortClassesByTime } from './scheduleUtils';
import { MouseEvent } from 'react';
import { User } from '../types/interfaces';

interface CalendarDayState {
  classTimeModal: {
    isOpen: boolean;
    position: { x: number; y: number };
    classes: ClassSession[];
    date: Date;
  };
  setClassTimeModal: (modal: {
    isOpen: boolean;
    position: { x: number; y: number };
    classes: ClassSession[];
    date: Date;
  }) => void;
  handleDayClick: (date: Date, classes: ClassSession[], paymentsDue: { user: User; classSession: ClassSession }[]) => void;
}

interface RenderCalendarDayParams {
  date: Date;
  isToday: boolean;
  dayClasses: ClassSession[];
  paymentsDue: { user: User; classSession: ClassSession }[];
  state: CalendarDayState;
  t: { [key: string]: string };
  users: User[];
}

export const renderCalendarDay = ({
  date,
  isToday,
  dayClasses,
  paymentsDue,
  state,
  t,
  users
}: RenderCalendarDayParams) => {
  const isPaymentDay = paymentsDue.length > 0;
  const daysUntilPayment = isPaymentDay ? 
    Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
  const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

  // Check for birthdays
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const dateString = `${month}-${day}`;
  const birthdays = users.filter(user => user.birthdate === dateString);

  const handleClassCountClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    state.setClassTimeModal({
      isOpen: true,
      position: {
        x: rect.left + rect.width / 2,
        y: rect.bottom + window.scrollY + 10
      },
      classes: dayClasses,
      date
    });
    state.handleDayClick(date, dayClasses, paymentsDue);
  };

  const handlePaymentPillClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    state.setClassTimeModal({
      isOpen: true,
      position: {
        x: rect.left + rect.width / 2,
        y: rect.bottom + window.scrollY + 10
      },
      classes: dayClasses,
      date
    });
    state.handleDayClick(date, dayClasses, paymentsDue);
  };

  return {
    indicators: {
      hasClasses: dayClasses.length > 0,
      isPaymentDay,
      isPaymentSoon,
      hasBirthdays: birthdays.length > 0
    },
    dateNumber: {
      value: date.getDate(),
      isToday,
      isPaymentDay,
      isPaymentSoon,
      hasBirthdays: birthdays.length > 0
    },
    pills: {
      classCount: dayClasses.length > 0 ? {
        count: dayClasses.length,
        text: dayClasses.length === 1 ? t.class || 'class' : t.class || 'classes',
        onClick: handleClassCountClick
      } : null,
      payment: isPaymentDay ? {
        count: paymentsDue.length,
        text: paymentsDue.length === 1 ? t.paymentDue || 'payment' : t.paymentDue || 'payments',
        isSoon: isPaymentSoon,
        onClick: handlePaymentPillClick
      } : null,
      birthdays: birthdays.length > 0 ? {
        count: birthdays.length,
        text: birthdays.length === 1 ? t.birthday || 'birthday' : t.birthdays || 'birthdays',
        names: birthdays.map(user => user.name)
      } : null
    }
  };
};

/**
 * Process dailyClassMap entries for a specific date
 * Trust the backend data - dailyClassMap already has everything we need.
 * Only adds missing properties from fullClassInfo, preserving all dailyClassMap values.
 * 
 * @param dailyClassMapEntries - Array of class entries from dailyClassMap[dateString]
 * @param fullClassInfoMap - Optional map of classId -> full class info for filling in missing properties
 * @returns Processed and sorted classes
 */
export const processDailyClassMapEntries = <T extends ClassSession = ClassSession>(
  dailyClassMapEntries: any[],
  fullClassInfoMap?: Map<string, any> | Record<string, any>
): T[] => {
  if (!dailyClassMapEntries || dailyClassMapEntries.length === 0) {
    return [];
  }

  // Process each entry - trust dailyClassMap values, only fill in missing properties
  const processedClasses: T[] = dailyClassMapEntries.map((classEntry: any) => {
    // Start with the dailyClassMap entry as-is (it has the correct times)
    let processed: any = { ...classEntry };
    
    // Only if full class info is provided, fill in missing properties (but never override existing ones)
    if (fullClassInfoMap) {
      const classId = classEntry.id;
      const baseId = classId.split('-')[0];
      
      let fullClassInfo: any = null;
      if (fullClassInfoMap instanceof Map) {
        fullClassInfo = fullClassInfoMap.get(classId) || fullClassInfoMap.get(baseId);
      } else {
        fullClassInfo = fullClassInfoMap[classId] || fullClassInfoMap[baseId];
      }
      
      if (fullClassInfo) {
        // Only add properties that don't exist in classEntry
        Object.keys(fullClassInfo).forEach(key => {
          if (processed[key] === undefined || processed[key] === null || processed[key] === '') {
            processed[key] = fullClassInfo[key];
          }
        });
      }
    }
    
    return processed as T;
  });
  
  // No deduplication - trust the backend data
  // Sort classes by time
  return sortClassesByTime(processedClasses) as T[];
};