import React from 'react';
import {
  format,
  startOfMonth,
  isSameDay,
  isToday,
  isBefore,
  getDaysInMonth,
  addDays,
  addMonths,
  subMonths,
  startOfDay,
} from 'date-fns';
import { FaChevronLeft, FaChevronRight, FaUsers, FaClock } from 'react-icons/fa';

interface ClassInfo {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  studentEmails: string[];
  studentIds?: string[]; // Keep for backward compatibility
}

interface ClassDatePickerProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  classInfo: ClassInfo;
  availableClasses?: ClassInfo[];
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const ClassDatePicker: React.FC<ClassDatePickerProps> = ({
  selectedDate,
  onDateSelect,
  classInfo,
  availableClasses = [],
}) => {
  const [currentMonth, setCurrentMonth] = React.useState<Date>(startOfMonth(selectedDate));

  // Get all dates in the current month
  const daysInMonth = React.useMemo(() => {
    const numDays = getDaysInMonth(currentMonth);
    const monthStart = startOfMonth(currentMonth);
    return Array.from({ length: numDays }, (_, i) => addDays(monthStart, i));
  }, [currentMonth]);

  // Get the day number (0-6) for the first day of the month
  const firstDayOfMonth = currentMonth.getDay();

  // Create blank spaces for days before the first day of the month
  const blanks = Array(firstDayOfMonth).fill(null);

  // Function to check if a date is a valid class day
  const isValidClassDay = (date: Date): boolean => {
    const hasClasses = availableClasses.length > 0 
      ? availableClasses.some(c => c.dayOfWeek === date.getDay())
      : classInfo.dayOfWeek === date.getDay();
    return hasClasses && !isBefore(startOfDay(date), startOfDay(new Date()));
  };

  // Function to get classes for a specific date
  const getClassesForDate = (date: Date): ClassInfo[] => {
    if (availableClasses.length > 0) {
      return availableClasses.filter(c => c.dayOfWeek === date.getDay());
    }
    return classInfo.dayOfWeek === date.getDay() ? [classInfo] : [];
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}
          className="p-2 hover:bg-[var(--brand-color-light)] rounded-full transition-colors"
        >
          <FaChevronLeft className="w-4 h-4 text-[var(--brand-color-dark)]" />
        </button>
        <h2 className="text-lg font-semibold text-black">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <button
          onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}
          className="p-2 hover:bg-[var(--brand-color-light)] rounded-full transition-colors"
        >
          <FaChevronRight className="w-4 h-4 text-[var(--brand-color-dark)]" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Day Headers */}
        {DAYS_OF_WEEK.map(day => (
          <div key={day} className="text-center text-sm font-medium text-[var(--brand-color-dark)] py-2">
            {day}
          </div>
        ))}

        {/* Blank spaces */}
        {blanks.map((_, index) => (
          <div key={`blank-${index}`} className="aspect-square" />
        ))}

        {/* Calendar Days */}
        {daysInMonth.map((date: Date) => {
          const isClassDay = isValidClassDay(date);
          const isPast = isBefore(startOfDay(date), startOfDay(new Date()));
          const classesOnDay = getClassesForDate(date);
          const isSelected = isSameDay(date, selectedDate);

          return (
            <div key={date.toISOString()} className="relative">
              <button
                onClick={() => isClassDay && !isPast && onDateSelect(date)}
                disabled={!isClassDay || isPast}
                type="button"
                className={`
                  w-full aspect-square p-1
                  ${!isClassDay || isPast ? 'cursor-not-allowed bg-gray-50 select-none' : 'cursor-pointer bg-white hover:bg-[var(--brand-color-light)] border-2 border-[var(--brand-color-dark)]'}
                  ${isSelected ? 'bg-[var(--brand-color-medium)] ring-2 ring-[var(--brand-color-dark)] border-0' : ''}
                  ${isPast ? 'opacity-40' : ''}
                  rounded-lg transition-colors
                `}
              >
                <div
                  className={`
                    w-full h-full flex flex-col items-center justify-center
                    ${isToday(date) ? 'font-bold' : ''}
                    ${!isClassDay || isPast ? 'text-gray-400' : 'text-[var(--brand-color-dark)]'}
                  `}
                >
                  <span>{format(date, 'd')}</span>
                  {isClassDay && !isPast && classesOnDay.length > 0 && (
                    <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex gap-1">
                      {classesOnDay.map((_, idx) => (
                        <div key={idx} className="w-1 h-1 rounded-full bg-[var(--brand-color)]" />
                      ))}
                    </div>
                  )}
                </div>
              </button>

              {/* Tooltip for class info */}
              {isClassDay && !isPast && (
                <div className="absolute z-10 bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block">
                  <div className="bg-[var(--header-bg)] text-white text-xs rounded py-2 px-3 whitespace-nowrap">
                    <div className="font-medium mb-1">{format(date, 'MMM d, yyyy')}</div>
                    {classesOnDay.map((cls, idx) => (
                      <div key={idx} className="mb-2 last:mb-0">
                        <div className="flex items-center gap-1 text-gray-300">
                          <FaClock className="w-3 h-3" />
                          <span>{cls.startTime} - {cls.endTime}</span>
                        </div>
                        <div className="flex items-center gap-1 text-gray-300">
                          <FaUsers className="w-3 h-3" />
                          <span>{cls.studentIds?.length || 0} students</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                    <div className="border-8 border-transparent border-t-[var(--header-bg)]" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Class Schedule Info */}
      <div className="mt-4 pt-4 border-t border-[var(--brand-color-light)]">
        <div className="text-sm text-gray-800 font-medium">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-[var(--brand-color-dark)]" />
            <span>Available class dates</span>
          </div>
          <p>
            Classes occur every {DAYS_OF_WEEK[classInfo.dayOfWeek]} from {classInfo.startTime} to {classInfo.endTime}
          </p>
        </div>
      </div>
    </div>
  );
}; 