import React, { useRef, useEffect } from 'react';
import { getDaysInMonth } from '../utils/dateUtils';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { styles } from '../styles/styleUtils';

interface CalendarProps {
  selectedDate: Date;
  onMonthChange: (date: Date) => void;
  onDayClick: (date: Date) => void;
  renderDay: (date: Date, isToday: boolean) => React.ReactNode;
  showNavigation?: boolean;
  isLoading?: boolean;
}

export const Calendar: React.FC<CalendarProps> = ({
  selectedDate,
  onMonthChange,
  onDayClick,
  renderDay,
  showNavigation = true,
  isLoading = false,
}) => {
  const { language } = useLanguage();
  const t = useTranslation(language);
  const DAYS_OF_WEEK = [t.sundayShort, t.mondayShort, t.tuesdayShort, t.wednesdayShort, t.thursdayShort, t.fridayShort, t.saturdayShort];
  
  // Add a ref to track initial render
  const isInitialRender = useRef(true);
  // Store the previous date to detect actual changes
  const prevDateRef = useRef<Date | null>(null);

  const { days, firstDay } = getDaysInMonth(selectedDate);
  
  // Check if the month actually changed to avoid unnecessary callbacks
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      prevDateRef.current = selectedDate;
      return;
    }
    
    // Only trigger onMonthChange if the month or year actually changed
    if (prevDateRef.current) {
      const prevMonth = prevDateRef.current.getMonth();
      const prevYear = prevDateRef.current.getFullYear();
      const currentMonth = selectedDate.getMonth();
      const currentYear = selectedDate.getFullYear();
      
      if (prevMonth !== currentMonth || prevYear !== currentYear) {
        // Update the previous date reference
        prevDateRef.current = selectedDate;
      }
    }
  }, [selectedDate, onMonthChange]);

  const handlePreviousMonth = () => {
    onMonthChange(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1));
  };

  const handleNextMonth = () => {
    onMonthChange(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1));
  };

  const handleDayClick = (date: Date) => {
    onDayClick(date);
  };

  return (
    <div className="relative">
      {showNavigation && (
        <div className="flex items-center justify-between mb-6 relative z-10">
          <h2 className={styles.headings.h2}>
            {selectedDate.toLocaleString(language === 'pt-BR' ? 'pt-BR' : 'en', { month: 'long', year: 'numeric' })}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePreviousMonth}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#6B5590] hover:bg-[#7B65A0] text-white transition-colors text-xl relative z-10"
            >
              ‹
            </button>
            <button
              onClick={handleNextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#6B5590] hover:bg-[#7B65A0] text-white transition-colors text-xl relative z-10"
            >
              ›
            </button>
          </div>
        </div>
      )}

      <div className="calendar-grid bg-white rounded-2xl shadow-sm border border-[#f0f0f0] relative">
        {/* Day headers */}
        {DAYS_OF_WEEK.map((day) => (
          <div
            key={day}
            className="calendar-day-header text-center text-sm font-medium text-[#666666] py-4"
          >
            {day}
          </div>
        ))}

        {/* Empty cells for days before the first of the month */}
        {Array.from({ length: firstDay }).map((_, index) => (
          <div key={`empty-${index}`} className="calendar-day empty" />
        ))}

        {/* Calendar days */}
        {Array.from({ length: days }).map((_, index) => {
          const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), index + 1);
          const isToday =
            date.getDate() === new Date().getDate() &&
            date.getMonth() === new Date().getMonth() &&
            date.getFullYear() === new Date().getFullYear();
          const isSelected = 
            date.getDate() === selectedDate.getDate() &&
            date.getMonth() === selectedDate.getMonth() &&
            date.getFullYear() === selectedDate.getFullYear();

          return (
            <div
              key={index}
              onClick={() => handleDayClick(date)}
              className={`calendar-day ${isToday ? 'bg-[#f8f8f8]' : ''} ${isSelected ? 'selected' : ''}`}
            >
              {renderDay(date, isToday)}
            </div>
          );
        })}

        {/* Empty cells for remaining days in the last week */}
        {Array.from({ length: (7 - ((firstDay + days) % 7)) % 7 }).map((_, index) => (
          <div key={`empty-end-${index}`} className="calendar-day empty" />
        ))}
        
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center z-20 rounded-2xl">
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#6B5590]"></div>
              <p className="mt-2 text-[#6B5590] font-medium">{t.loading || 'Loading...'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 