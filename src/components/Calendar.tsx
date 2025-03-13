import React from 'react';
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
}

export const Calendar: React.FC<CalendarProps> = ({
  selectedDate,
  onMonthChange,
  onDayClick,
  renderDay,
  showNavigation = true,
}) => {
  const { language } = useLanguage();
  const t = useTranslation(language);
  const DAYS_OF_WEEK = [t.sundayShort, t.mondayShort, t.tuesdayShort, t.wednesdayShort, t.thursdayShort, t.fridayShort, t.saturdayShort];

  const { days, firstDay } = getDaysInMonth(selectedDate);

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
    <div>
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

      <div className="calendar-grid bg-white rounded-2xl shadow-sm border border-[#f0f0f0]">
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
      </div>
    </div>
  );
}; 