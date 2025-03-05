import React from 'react';
import { ClassSession, ClassWithStudents, User, formatClassTime } from '../utils/scheduleUtils';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { FaFileAlt, FaLink } from 'react-icons/fa';

export interface ScheduleCalendarDayProps<T extends ClassSession> {
  date: Date;
  isToday: boolean;
  classes: T[];
  paymentsDue: { user: User; classSession: ClassSession }[] | boolean;
  onClassCountClick?: (e: React.MouseEvent, classes: T[], date: Date) => void;
  onPaymentPillClick?: (e: React.MouseEvent, date: Date, classes: T[]) => void;
  onDayClick?: (date: Date, classes: T[]) => void;
  materialsInfo?: Map<string, { hasSlides: boolean; hasLinks: boolean }>;
}

export function ScheduleCalendarDay<T extends ClassSession>({
  date,
  isToday,
  classes,
  paymentsDue,
  onClassCountClick,
  onPaymentPillClick,
  onDayClick,
  materialsInfo,
}: ScheduleCalendarDayProps<T>) {
  const { language } = useLanguage();
  const t = useTranslation(language);
  
  // Determine if it's a payment day and if payment is soon
  const isPaymentDay = Array.isArray(paymentsDue) ? paymentsDue.length > 0 : !!paymentsDue;
  const daysUntilPayment = isPaymentDay ? 
    Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
  const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

  // Check if any class on this day has materials
  const hasMaterials = React.useMemo(() => {
    if (!materialsInfo || classes.length === 0) return false;
    
    const dateStr = date.toISOString().split('T')[0];
    return classes.some(classItem => {
      const key = `${classItem.id}_${dateStr}`;
      return materialsInfo.has(key);
    });
  }, [classes, date, materialsInfo]);

  // Handle day click
  const handleDayClick = () => {
    if (onDayClick) {
      onDayClick(date, classes);
    }
  };

  // Handle class count click
  const handleClassCountClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the calendar day click
    if (onClassCountClick) {
      onClassCountClick(e, classes, date);
    }
  };

  // Handle payment pill click
  const handlePaymentPillClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the calendar day click
    if (onPaymentPillClick) {
      onPaymentPillClick(e, date, classes);
    }
  };

  // Format time for a single class
  const formatSingleClassTime = (classItem: ClassSession): string => {
    if (!classItem.startTime || !classItem.endTime) return '';
    
    // Format times to be simpler (without leading zeros and AM/PM when possible)
    const formatTimeString = (timeStr: string): { display: string; period: string } => {
      // Extract hours, minutes, and period
      const match = timeStr.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
      if (!match) return { display: timeStr, period: '' };
      
      let [_, hours, minutes, period] = match;
      let hour = parseInt(hours);
      let is24HourFormat = false;
      
      // If period is specified
      if (period) {
        period = period.toUpperCase();
        // For PM times, add 12 to hour for 24-hour calculation (except 12 PM)
        if (period === 'PM' && hour !== 12) {
          hour += 12;
        }
        // For 12 AM, set hour to 0 in 24-hour format
        if (period === 'AM' && hour === 12) {
          hour = 0;
        }
      } else {
        // If no period is specified, assume 24-hour format
        is24HourFormat = true;
      }
      
      // Convert to 12-hour format for display
      const displayHour = hour % 12 || 12;
      
      // Determine period for display
      const displayPeriod = hour >= 12 ? 'PM' : 'AM';
      
      // Format the time
      if (minutes === '00') {
        // If minutes are 00, just show the hour
        return {
          display: `${displayHour}`,
          period: displayPeriod
        };
      } else {
        // Otherwise show hour:minutes
        return {
          display: `${displayHour}:${minutes}`,
          period: displayPeriod
        };
      }
    };

    const startTimeInfo = formatTimeString(classItem.startTime);
    const endTimeInfo = formatTimeString(classItem.endTime);

    // If both times are in the same period (AM or PM), only show the period once at the end
    if (startTimeInfo.period === endTimeInfo.period) {
      return `${startTimeInfo.display} - ${endTimeInfo.display} ${startTimeInfo.period}`;
    } else {
      // If times span AM/PM, show the period for each time
      return `${startTimeInfo.display} ${startTimeInfo.period} - ${endTimeInfo.display} ${endTimeInfo.period}`;
    }
  };

  return (
    <div className="h-full flex flex-col" onClick={handleDayClick}>
      {/* Indicators */}
      <div className="calendar-day-indicators">
        {classes.length > 0 && (
          <div className="indicator class-indicator" title="Has classes" />
        )}
        {isPaymentDay && (
          <div 
            className={`indicator ${isPaymentSoon ? 'payment-soon-indicator' : 'payment-indicator'}`}
            title={isPaymentSoon ? 'Payment due soon' : 'Payment due'}
          />
        )}
        {hasMaterials && (
          <div 
            className="indicator material-indicator bg-[#4f46e5]"
            title="Has documents or links"
          />
        )}
      </div>

      {/* Date */}
      <div className="flex flex-col items-center">
        <div className={`date-number ${isToday ? 'text-[#6366f1]' : ''} ${isPaymentDay ? (isPaymentSoon ? 'text-[#ef4444]' : 'text-[#f59e0b]') : ''}`}>
          {date.getDate()}
        </div>
      </div>

      {/* Class count and payment pills */}
      <div className="class-details">
        <div className="flex flex-col items-center gap-2">
          {classes.length > 0 && (
            <div 
              className="calendar-pill class-count-pill"
              onClick={handleClassCountClick}
            >
              {classes.length === 1 
                ? formatSingleClassTime(classes[0])
                : `${classes.length} ${t.class || 'class'}`
              }
              {hasMaterials && (
                <span className="material-icon text-white">
                  <FaFileAlt className="inline-block w-3 h-3" />
                </span>
              )}
            </div>
          )}
          
          {isPaymentDay && (
            <div 
              className={`calendar-pill payment-pill ${isPaymentSoon ? 'soon' : 'normal'}`}
              onClick={handlePaymentPillClick}
            >
              {Array.isArray(paymentsDue) 
                ? `${paymentsDue.length} ${paymentsDue.length === 1 ? t.paymentDue || 'payment' : t.paymentsDue || 'payments'}`
                : t.paymentDue || 'Payment due'
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 