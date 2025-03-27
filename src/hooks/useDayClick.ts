import { useCallback, useRef } from 'react';
import { ClassSession } from '../utils/scheduleUtils';
import { User } from '../types/interfaces';
import { DayDetails } from '../types/dayDetails';
import { handleDayClickInternal } from '../utils/dayClickUtils';

interface UseDayClickProps {
  getClassesForDay: (dayOfWeek: number, date: Date) => ClassSession[];
  users: User[];
  dailyClassMap: Record<string, any[]>;
  currentUser?: { uid: string };
  isDateInRelevantMonthRange?: (date: Date, selectedDate?: Date) => boolean;
  setSelectedDayDetails: (details: DayDetails | null) => void;
}

export const useDayClick = ({
  getClassesForDay,
  users,
  dailyClassMap,
  currentUser,
  isDateInRelevantMonthRange,
  setSelectedDayDetails
}: UseDayClickProps) => {
  const isFetchingRef = useRef<boolean>(false);

  const handleDayClick = useCallback(async (date: Date) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const details = await handleDayClickInternal(
        date,
        getClassesForDay,
        users,
        dailyClassMap,
        currentUser,
        isDateInRelevantMonthRange
      );
      setSelectedDayDetails(details);
    } catch (error) {
      console.error('Error in handleDayClick:', error);
    } finally {
      isFetchingRef.current = false;
    }
  }, [getClassesForDay, users, dailyClassMap, currentUser, isDateInRelevantMonthRange, setSelectedDayDetails]);

  return handleDayClick;
}; 