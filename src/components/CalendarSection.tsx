import { useState, useRef, useEffect } from 'react';
import { Calendar } from './Calendar';
import { ClassTimeModal } from './CalendarComponents';
import { ClassSession, User } from '../utils/scheduleUtils';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { renderCalendarDay } from '../utils/calendarDayUtils';
import { getPaymentsDueForDay } from '../utils/paymentUtils';

interface CalendarSectionProps {
  selectedDate: Date;
  upcomingClasses: ClassSession[];
  loadedMonths: Set<string>;
  setLoadedMonths: (months: Set<string>) => void;
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
  loadedMonths,
  setLoadedMonths,
  onMonthChange,
  onDayClick,
  formatStudentNames,
  isDateInRelevantMonthRange,
  getClassesForDay,
  users
}: CalendarSectionProps) => {
  const [classTimeModal, setClassTimeModal] = useState<{
    isOpen: boolean;
    position: { x: number, y: number };
    classes: ClassSession[];
    date: Date;
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    classes: [],
    date: new Date()
  });

  const classTimeModalRef = useRef<HTMLDivElement>(null);
  const { language } = useLanguage();
  const t = useTranslation(language);

  // Add a useEffect to handle clicks outside the modal and scroll events
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (classTimeModalRef.current && !classTimeModalRef.current.contains(event.target as Node)) {
        setClassTimeModal(prev => ({ ...prev, isOpen: false }));
      }
    };
    
    const handleScroll = () => {
      setClassTimeModal(prev => ({ ...prev, isOpen: false }));
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const getPaymentsDueForSelectedDay = (date: Date): { user: User; classSession: ClassSession }[] => {
    return getPaymentsDueForDay(date, upcomingClasses, users, isDateInRelevantMonthRange);
  };

  const renderCalendarDayWrapper = (date: Date, isToday: boolean) => {
    const dayClasses = getClassesForDay(date.getDay(), date);
    const paymentsDue = getPaymentsDueForSelectedDay(date);

    const dayData = renderCalendarDay({
      date,
      isToday,
      dayClasses,
      paymentsDue,
      state: {
        classTimeModal,
        setClassTimeModal,
        handleDayClick: onDayClick
      },
      formatStudentNames,
      t: {
        class: t.class,
        paymentDue: t.paymentDue,
        birthday: t.birthday,
        birthdays: t.birthdays
      },
      language,
      users
    });

    return (
      <div className="h-full flex flex-col">
        {/* Indicators */}
        <div className="calendar-day-indicators">
          {dayData.indicators.hasClasses && (
            <div className="indicator class-indicator" title="Has classes" />
          )}
          {dayData.indicators.isPaymentDay && (
            <div 
              className={`indicator ${dayData.indicators.isPaymentSoon ? 'payment-soon-indicator' : 'payment-indicator'}`}
              title={dayData.indicators.isPaymentSoon ? 'Payment due soon' : 'Payment due'}
            />
          )}
          {dayData.indicators.hasBirthdays && (
            <div className="indicator birthday-indicator" title="Has birthdays" />
          )}
        </div>

        {/* Date */}
        <div className="flex flex-col items-center">
          <div className={`date-number ${dayData.dateNumber.isToday ? 'text-[#6366f1]' : ''} ${dayData.dateNumber.isPaymentDay ? (dayData.dateNumber.isPaymentSoon ? 'text-[#ef4444]' : 'text-[#f59e0b]') : ''} ${dayData.dateNumber.hasBirthdays ? 'text-pink-500' : ''}`}>
            {dayData.dateNumber.value}
          </div>
        </div>

        {/* Class count and payment pills */}
        <div className="class-details">
          <div className="flex flex-col items-center gap-2">
            {dayData.pills.classCount && (
              <div 
                className="calendar-pill class-count-pill"
                onClick={dayData.pills.classCount.onClick}
              >
                {dayData.pills.classCount.count} {dayData.pills.classCount.text}
              </div>
            )}
            
            {dayData.pills.payment && (
              <div 
                className={`calendar-pill payment-pill ${dayData.pills.payment.isSoon ? 'soon' : 'normal'}`}
                onClick={dayData.pills.payment.onClick}
              >
                {dayData.pills.payment.count} {dayData.pills.payment.text}
              </div>
            )}

            {dayData.pills.birthdays && (
              <div 
                className="calendar-pill birthday-pill"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setClassTimeModal({
                    isOpen: true,
                    position: {
                      x: rect.left + rect.width / 2,
                      y: rect.bottom + window.scrollY + 10
                    },
                    classes: dayClasses,
                    date
                  });
                  onDayClick(date, dayClasses, paymentsDue);
                }}
              >
                {dayData.pills.birthdays.count} {dayData.pills.birthdays.text}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative">
      <Calendar
        selectedDate={selectedDate}
        onDateSelect={(date) => onDayClick(date, getClassesForDay(date.getDay(), date), getPaymentsDueForSelectedDay(date))}
        onMonthChange={onMonthChange}
        renderDay={renderCalendarDayWrapper}
      />
      
      {/* Class Time Modal */}
      {classTimeModal.isOpen && (
        <ClassTimeModal
          isOpen={classTimeModal.isOpen}
          position={classTimeModal.position}
          classes={classTimeModal.classes}
          date={classTimeModal.date}
          formatStudentNames={formatStudentNames}
          onClose={() => setClassTimeModal(prev => ({ ...prev, isOpen: false }))}
        />
      )}
    </div>
  );
}; 