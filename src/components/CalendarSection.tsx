import { useState, useRef, useEffect, useCallback } from 'react';
import { Calendar } from './Calendar';
import { CalendarDay } from './CalendarDay';
import { ClassSession } from '../utils/scheduleUtils';
import { getPaymentsDueForDay } from '../utils/paymentUtils';
import { getPaymentsByTeacherAndMonth } from '../services/paymentService';
import { Payment } from '../types/payment';
import { User } from '../types/interfaces';
import { useAuth } from '../hooks/useAuth';

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
  const { currentUser } = useAuth();
  const [completedPayments, setCompletedPayments] = useState<Payment[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);
  const previousClassMonthRef = useRef<string>('');
  const previousPaymentMonthRef = useRef<string>('');
  const calendarClassesRef = useRef<Record<string, ClassSession[]>>({});

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
      // Don't fetch if we're already loading or if we don't have a user ID
      if (isLoadingPayments || !currentUser?.uid) {
        setCompletedPayments([]);
        setIsLoadingPayments(false);
        return;
      }

      // Check if we really need to fetch
      if (previousPaymentMonthRef.current === currentMonth) {
        return;
      }
      
      setIsLoadingPayments(true);
      
      try {
        // Use the new teacher-based lookup, more efficient
        const payments = await getPaymentsByTeacherAndMonth(
          currentUser.uid,
          selectedDate
        );
        setCompletedPayments(payments);
        previousPaymentMonthRef.current = currentMonth;
      } catch (error) {
        console.error('Error fetching payments:', error);
        setCompletedPayments([]);
      } finally {
        setIsLoadingPayments(false);
      }
    };

    fetchMonthPayments();
  }, [selectedDate, currentUser?.uid, isLoadingPayments]);

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
            dayClasses={getClassesForDayWithCache(date)}
            paymentsDue={dayPaymentsDue}
            isDateInRelevantMonthRange={isDateInRelevantMonthRange}
            completedPayments={completedPayments}
            isLoading={isLoadingPayments}
            users={users}
            onDayClick={handleDayClick}
            onClassCountClick={(_) => handleDayClick(date)}
            onPaymentPillClick={(_) => handleDayClick(date)}
          />
        );
      }}
    />
  );
}; 