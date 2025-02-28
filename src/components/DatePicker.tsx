import React, { useState } from 'react';
import {
  format,
  startOfMonth,
  isSameDay,
  isToday,
  getDaysInMonth,
  addDays,
  addMonths,
  subMonths,
  startOfDay,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
} from 'date-fns';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';

interface DatePickerProps {
  selectedDate: string;
  onChange: (date: string) => void;
  minDate?: Date;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  selectedDate,
  onChange,
  minDate,
}) => {
  const { language } = useLanguage();
  const t = useTranslation(language);
  const DAYS_OF_WEEK = [t.sundayShort, t.mondayShort, t.tuesdayShort, t.wednesdayShort, t.thursdayShort, t.fridayShort, t.saturdayShort];

  // Parse the selected date and set it to noon to avoid timezone issues
  const parsedSelectedDate = React.useMemo(() => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed in Date constructor
    return setHours(setMinutes(setSeconds(setMilliseconds(date, 0), 0), 0), 12);
  }, [selectedDate]);

  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(parsedSelectedDate));

  // Get all dates in the current month
  const daysInMonth = React.useMemo(() => {
    const numDays = getDaysInMonth(currentMonth);
    const monthStart = startOfMonth(currentMonth);
    return Array.from({ length: numDays }, (_, i) => {
      const date = addDays(monthStart, i);
      // Set each date to noon to avoid timezone issues
      return setHours(setMinutes(setSeconds(setMilliseconds(date, 0), 0), 0), 12);
    });
  }, [currentMonth]);

  // Get the day number (0-6) for the first day of the month
  const firstDayOfMonth = currentMonth.getDay();

  // Create blank spaces for days before the first day of the month
  const blanks = Array(firstDayOfMonth).fill(null);

  const handleDateSelect = (date: Date) => {
    // Format the date in YYYY-MM-DD format in the local timezone
    const formattedDate = format(date, 'yyyy-MM-dd');
    onChange(formattedDate);
    setIsOpen(false);
  };

  const isDateDisabled = (date: Date) => {
    if (!minDate) return false;
    const normalizedMinDate = setHours(setMinutes(setSeconds(setMilliseconds(minDate, 0), 0), 0), 12);
    return date < startOfDay(normalizedMinDate);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={format(parsedSelectedDate, 'MMM dd, yyyy')}
        onClick={() => setIsOpen(true)}
        readOnly
        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm cursor-pointer"
      />
      
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          ></div>
          <div className="absolute z-20 mt-1 bg-white rounded-lg shadow-lg p-4 w-64">
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-600 transition-colors text-xl"
              >
                ‹
              </button>
              <h2 className="text-sm font-semibold text-gray-900">
                {currentMonth.toLocaleString(language === 'pt-BR' ? 'pt-BR' : 'en', { month: 'long', year: 'numeric' })}
              </h2>
              <button
                type="button"
                onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-600 transition-colors text-xl"
              >
                ›
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Day Headers */}
              {DAYS_OF_WEEK.map(day => (
                <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
                  {day}
                </div>
              ))}

              {/* Blank spaces */}
              {blanks.map((_, index) => (
                <div key={`blank-${index}`} className="aspect-square" />
              ))}

              {/* Calendar Days */}
              {daysInMonth.map((date: Date) => {
                const isSelected = isSameDay(date, parsedSelectedDate);
                const isDisabled = isDateDisabled(date);
                const isCurrentDay = isToday(date);

                return (
                  <button
                    key={date.toISOString()}
                    type="button"
                    onClick={() => !isDisabled && handleDateSelect(date)}
                    disabled={isDisabled}
                    className={`
                      aspect-square p-1 text-sm rounded-full transition-colors
                      ${isDisabled ? 'bg-white text-gray-300 cursor-not-allowed' : 
                        isSelected ? 'bg-indigo-600 text-white hover:bg-indigo-700' :
                        isCurrentDay ? 'bg-indigo-50 text-indigo-600 font-medium hover:bg-indigo-100' :
                        'bg-white text-gray-900 hover:bg-indigo-50 hover:text-indigo-600'
                      }
                    `}
                  >
                    {format(date, 'd')}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}; 