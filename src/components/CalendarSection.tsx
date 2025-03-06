import { useState, useRef, useEffect } from 'react';
import { Calendar } from './Calendar';
import { CalendarDay } from './CalendarDay';
import { ClassSession, User } from '../utils/scheduleUtils';
import { getPaymentsDueForDay } from '../utils/paymentUtils';
import { getPaymentsForDates } from '../services/paymentService';
import { Payment } from '../types/payment';

interface CalendarSectionProps {
  selectedDate: Date;
  upcomingClasses: ClassSession[];
  onMonthChange: (date: Date) => void;
  onDayClick: (date: Date, classes: ClassSession[], paymentsDue: { user: User; classSession: ClassSession }[]) => void;
  formatStudentNames: (studentEmails: string[]) => string;
  isDateInRelevantMonthRange: (date: Date) => boolean;
  getClassesForDay: (dayOfWeek: number, date: Date) => ClassSession[];
  users: User[];
}

export const CalendarSection = ({
  selectedDate,
  upcomingClasses,
  onMonthChange,
  onDayClick,
  isDateInRelevantMonthRange,
  getClassesForDay,
  users
}: CalendarSectionProps) => {
  const [completedPayments, setCompletedPayments] = useState<Payment[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);
  const previousMonthRef = useRef<string>('');

  // Pre-calculate all payment due dates for the month
  const getMonthPaymentDueDates = () => {
    const datesWithPayments: Date[] = [];
    const classSessionIds = new Set<string>();
    
    const firstDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const lastDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
    
    for (let date = new Date(firstDay); date <= lastDay; date.setDate(date.getDate() + 1)) {
      const paymentsDue = getPaymentsDueForDay(new Date(date), upcomingClasses, users, isDateInRelevantMonthRange);
      if (paymentsDue.length > 0) {
        datesWithPayments.push(new Date(date));
        paymentsDue.forEach(({ classSession }) => classSessionIds.add(classSession.id));
      }
    }

    return { datesWithPayments, classSessionIds: Array.from(classSessionIds) };
  };

  // Fetch all payments for the visible month
  useEffect(() => {
    const currentMonth = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}`;
    
    // Only fetch if the month has changed
    if (previousMonthRef.current !== currentMonth) {
      const fetchMonthPayments = async () => {
        setIsLoadingPayments(true);
        
        try {
          const { datesWithPayments, classSessionIds } = getMonthPaymentDueDates();

          if (datesWithPayments.length > 0) {
            const payments = await getPaymentsForDates(datesWithPayments, classSessionIds);
            setCompletedPayments(payments);
          } else {
            setCompletedPayments([]);
          }
        } finally {
          setIsLoadingPayments(false);
        }
      };

      fetchMonthPayments();
      previousMonthRef.current = currentMonth;
    }
  }, [selectedDate, upcomingClasses, users, isDateInRelevantMonthRange]);

  const handleMonthChange = (newDate: Date) => {
    // Clear the previous month ref to force a refresh on month change
    previousMonthRef.current = '';
    onMonthChange(newDate);
  };

  const getPaymentsDueForSelectedDay = (date: Date): { user: User; classSession: ClassSession }[] => {
    return getPaymentsDueForDay(date, upcomingClasses, users, isDateInRelevantMonthRange);
  };

  const handleDayClick = (date: Date, classes: ClassSession[]) => {
    const paymentsDue = getPaymentsDueForSelectedDay(date);
    onDayClick(date, classes, paymentsDue);
  };

  const renderCalendarDayWrapper = (date: Date, isToday: boolean) => {
    const dayClasses = getClassesForDay(date.getDay(), date);
    const paymentsDue = getPaymentsDueForSelectedDay(date);

    // Filter completed payments for this specific day
    const dayCompletedPayments = completedPayments.filter(payment => {
      const paymentDate = payment.dueDate.toDate();
      return paymentDate.getDate() === date.getDate() &&
             paymentDate.getMonth() === date.getMonth() &&
             paymentDate.getFullYear() === date.getFullYear();
    });

    return (
      <div className="h-full flex flex-col">
        <CalendarDay
          date={date}
          isToday={isToday}
          classes={dayClasses}
          paymentsDue={paymentsDue}
          onDayClick={handleDayClick}
          completedPayments={dayCompletedPayments}
          isLoading={isLoadingPayments}
        />
      </div>
    );
  };

  return (
    <div className="relative">
      <Calendar
        key={`calendar-${selectedDate.getTime()}`}
        selectedDate={selectedDate}
        onDateSelect={handleDayClick}
        onMonthChange={handleMonthChange}
        renderDay={renderCalendarDayWrapper}
      />
    </div>
  );
}; 