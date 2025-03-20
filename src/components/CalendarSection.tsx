import { useState, useRef, useEffect, useCallback } from 'react';
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
  isDateInRelevantMonthRange: (date: Date, selectedDate?: Date) => boolean;
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
  const previousClassMonthRef = useRef<string>('');
  const previousPaymentMonthRef = useRef<string>('');
  const calendarClassesRef = useRef<Record<string, ClassSession[]>>({});
  const [monthPaymentDueDates, setMonthPaymentDueDates] = useState<{
    datesWithPayments: Date[];
    classSessionIds: string[];
  }>({ datesWithPayments: [], classSessionIds: [] });

  // Pre-calculate all payment due dates for the month
  useEffect(() => {
    const datesWithPayments: Date[] = [];
    const classSessionIds = new Set<string>();
    
    const firstDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const lastDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
    
    for (let date = new Date(firstDay); date <= lastDay; date.setDate(date.getDate() + 1)) {
      const paymentsDue = getPaymentsDueForDay(
        new Date(date), 
        upcomingClasses, 
        users, 
        (date) => isDateInRelevantMonthRange(date, selectedDate)
      );
      if (paymentsDue.length > 0) {
        datesWithPayments.push(new Date(date));
        paymentsDue.forEach(({ classSession }) => classSessionIds.add(classSession.id));
      }
    }
    
    setMonthPaymentDueDates({
      datesWithPayments,
      classSessionIds: Array.from(classSessionIds)
    });
  }, [selectedDate, upcomingClasses, users, isDateInRelevantMonthRange]);

  // Cache classes for each day to prevent recalculation
  const getClassesForDayWithCache = useCallback((date: Date) => {
    const dateKey = date.toISOString().split('T')[0];
    if (!calendarClassesRef.current[dateKey]) {
      calendarClassesRef.current[dateKey] = getClassesForDay(date.getDay(), date);
    }
    return calendarClassesRef.current[dateKey];
  }, [getClassesForDay]);

  // Clear class cache when month changes
  useEffect(() => {
    const currentMonth = selectedDate.getMonth();
    const currentYear = selectedDate.getFullYear();
    const monthKey = `${currentYear}-${currentMonth}`;
    
    if (previousClassMonthRef.current !== monthKey) {
      previousClassMonthRef.current = monthKey;
      calendarClassesRef.current = {};
    }
  }, [selectedDate]);

  // Fetch all payments for the visible month
  useEffect(() => {
    const currentMonth = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}`;
    
    const fetchMonthPayments = async () => {
      setIsLoadingPayments(true);
      
      try {
        if (monthPaymentDueDates.datesWithPayments.length > 0) {
          const payments = await getPaymentsForDates(
            monthPaymentDueDates.datesWithPayments,
            monthPaymentDueDates.classSessionIds
          );
          setCompletedPayments(payments);
        } else {
          setCompletedPayments([]);
        }
      } finally {
        setIsLoadingPayments(false);
      }
    };

    // Fetch payments when month changes or payment due dates update
    if (previousPaymentMonthRef.current !== currentMonth || monthPaymentDueDates.datesWithPayments.length > 0) {
      fetchMonthPayments();
      previousPaymentMonthRef.current = currentMonth;
    }
  }, [selectedDate, monthPaymentDueDates]);

  const handleDayClick = useCallback((date: Date) => {
    const classes = getClassesForDayWithCache(date);
    const paymentsDue = getPaymentsDueForDay(
      date, 
      upcomingClasses, 
      users, 
      (date) => isDateInRelevantMonthRange(date, selectedDate)
    );
    onDayClick(date, classes, paymentsDue);
  }, [getClassesForDayWithCache, upcomingClasses, users, isDateInRelevantMonthRange, onDayClick, selectedDate]);

  return (
    <Calendar
      selectedDate={selectedDate}
      onMonthChange={onMonthChange}
      onDayClick={handleDayClick}
      isLoading={isLoadingPayments}
      renderDay={(date, isToday) => {
        const dayPaymentsDue = getPaymentsDueForDay(
          date, 
          upcomingClasses, 
          users, 
          (date) => isDateInRelevantMonthRange(date, selectedDate)
        );
        
        return (
          <CalendarDay
            date={date}
            isToday={isToday}
            classes={getClassesForDayWithCache(date)}
            paymentsDue={dayPaymentsDue}
            isDateInRelevantMonthRange={isDateInRelevantMonthRange}
            completedPayments={completedPayments}
            isLoading={isLoadingPayments}
            users={users}
            onDayClick={handleDayClick}
          />
        );
      }}
    />
  );
}; 