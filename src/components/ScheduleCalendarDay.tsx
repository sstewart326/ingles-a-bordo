import React from 'react';
import { ClassSession } from '../utils/scheduleUtils';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { FaFileAlt, FaBook, FaCommentAlt } from 'react-icons/fa';
import { formatTimeWithTimezones } from '../utils/dateUtils';
import { User } from '../types/interfaces';
export interface ScheduleCalendarDayProps<T extends ClassSession> {
  date: Date;
  isToday: boolean;
  classes: T[];
  paymentsDue: { user: User; classSession: ClassSession }[] | boolean;
  onClassCountClick?: (e: React.MouseEvent, classes: T[], date: Date) => void;
  onPaymentPillClick?: (e: React.MouseEvent, date: Date, classes: T[]) => void;
  onDayClick?: (date: Date, classes: T[]) => void;
  materialsInfo?: Map<string, { hasSlides: boolean; hasLinks: boolean }>;
  homeworkInfo?: Map<string, number>; // Map of classId to homework count for this date
  onHomeworkPillClick?: (e: React.MouseEvent, date: Date, classes: T[]) => void;
  homeworkFeedbackInfo?: Map<string, boolean>; // Map of classId_date to boolean indicating if feedback exists
  paymentStatus?: { isCompleted: boolean; completedAt?: string };
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
  homeworkInfo,
  onHomeworkPillClick,
  homeworkFeedbackInfo,
  paymentStatus
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

  // Check if any class on this day has homework
  const hasHomework = React.useMemo(() => {
    if (!homeworkInfo || classes.length === 0) return false;
    
    const dateStr = date.toISOString().split('T')[0];
    
    const result = classes.some(classItem => {
      const key = `${classItem.id}_${dateStr}`;
      const hasHw = homeworkInfo.has(key) && homeworkInfo.get(key)! > 0;
      return hasHw;
    });
    
    return result;
  }, [classes, date, homeworkInfo]);

  // Check if any homework on this day has feedback
  const hasHomeworkFeedback = React.useMemo(() => {
    if (!homeworkFeedbackInfo || classes.length === 0) return false;
    
    const dateStr = date.toISOString().split('T')[0];
    
    return classes.some(classItem => {
      const key = `${classItem.id}_${dateStr}`;
      return homeworkFeedbackInfo.has(key) && homeworkFeedbackInfo.get(key) === true;
    });
  }, [classes, date, homeworkFeedbackInfo]);

  // Get total homework count for this day
  const getTotalHomeworkCount = (): number => {
    if (!homeworkInfo || classes.length === 0) return 0;
    
    const dateStr = date.toISOString().split('T')[0];
    let count = 0;
    
    classes.forEach(classItem => {
      const key = `${classItem.id}_${dateStr}`;
      if (homeworkInfo.has(key)) {
        count += homeworkInfo.get(key)!;
      }
    });
    
    return count;
  };

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

  // Handle homework pill click
  const handleHomeworkPillClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the calendar day click
    if (onHomeworkPillClick) {
      onHomeworkPillClick(e, date, classes);
    }
  };
  
  // Function to get day name from dayOfWeek number
  const getDayName = (dayOfWeek: number | undefined): string => {
    if (dayOfWeek === undefined) return '';
    
    const days = [
      t.sunday || 'Sunday',
      t.monday || 'Monday', 
      t.tuesday || 'Tuesday', 
      t.wednesday || 'Wednesday', 
      t.thursday || 'Thursday', 
      t.friday || 'Friday', 
      t.saturday || 'Saturday'
    ];
    
    return days[dayOfWeek];
  };
  
  // Create tooltip text for payment pill
  const createPaymentTooltip = (): string => {
    if (!Array.isArray(paymentsDue) || !paymentsDue.length) return '';
    
    return paymentsDue.map(({ user, classSession }) => {
      const dayName = getDayName(classSession.dayOfWeek);
      const time = formatSingleClassTime(classSession);
      
      // Show timezone if available and different from user's timezone
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const tzInfo = classSession.timezone && classSession.timezone !== userTimezone 
        ? ` (${classSession.timezone.replace(/^.*\//, '')})` 
        : '';
      
      const amountText = classSession.paymentConfig?.amount && classSession.paymentConfig?.currency
        ? ` (${classSession.paymentConfig.currency} ${classSession.paymentConfig.amount.toFixed(2)})`
        : '';
      
      return `${user.name}: ${dayName} ${time}${tzInfo}${amountText}`;
    }).join('\n');
  };

  // Format time for a single class
  const formatSingleClassTime = (classItem: ClassSession): string => {
    // Get the start and end times, considering multiple schedules
    let startTime = classItem.startTime;
    let endTime = classItem.endTime;
    let timezone = classItem.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Find the matching schedule for the day of week if we have multiple schedules
    if (classItem.scheduleType === 'multiple' && Array.isArray(classItem.schedules)) {
      // Use the calendar day's date to determine day of week
      const dayOfWeek = date.getDay();
      
      // First try to find schedule matching this specific calendar day
      const matchingSchedule = classItem.schedules.find(schedule => 
        schedule.dayOfWeek === dayOfWeek
      );
      
      // If found a matching schedule for this day, use it
      if (matchingSchedule) {
        startTime = matchingSchedule.startTime;
        endTime = matchingSchedule.endTime;
        // Use schedule timezone if available
        if (matchingSchedule.timezone) {
          timezone = matchingSchedule.timezone;
        }
      }
      // If no matching schedule for this day but we have a specific dayOfWeek on the class
      else if (classItem.dayOfWeek !== undefined) {
        const fallbackSchedule = classItem.schedules.find(schedule => 
          schedule.dayOfWeek === classItem.dayOfWeek
        );
        
        if (fallbackSchedule) {
          startTime = fallbackSchedule.startTime;
          endTime = fallbackSchedule.endTime;
          // Use schedule timezone if available
          if (fallbackSchedule.timezone) {
            timezone = fallbackSchedule.timezone;
          }
        }
      }
    }
    
    if (!startTime || !endTime) return '';
    
    // Get the user's local timezone
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Use our utility function to format the time with both timezones
    return formatTimeWithTimezones(startTime, endTime, timezone, userTimezone, date);
  };

  return (
    <div className="h-full flex flex-col" onClick={handleDayClick}>
      {/* Indicators */}
      <div className="calendar-day-indicators">
        {classes.length > 0 && (
          <div key="class-indicator" className="indicator class-indicator" title="Has classes" />
        )}
        {isPaymentDay && (
          <div
            key="payment-indicator"
            className={`indicator ${
              paymentStatus?.isCompleted
                ? 'payment-completed-indicator'
                : isPaymentSoon
                ? 'payment-soon-indicator'
                : 'payment-indicator'
            }`}
            title={paymentStatus?.isCompleted ? 'Payment completed' : isPaymentSoon ? 'Payment due soon' : 'Payment due'}
          />
        )}
        {hasMaterials && (
          <div key="materials-indicator" className="indicator material-indicator" title="Has materials" />
        )}
        {hasHomework && (
          <div key="homework-indicator" className="indicator homework-indicator" title="Has homework" />
        )}
        {hasHomeworkFeedback && (
          <div key="feedback-indicator" className="indicator feedback-indicator" title="Has feedback from teacher" />
        )}
      </div>

      {/* Date */}
      <div className="flex flex-col items-center">
        <div className={`date-number ${isToday ? 'text-[#6366f1]' : ''} ${
          isPaymentDay 
            ? paymentStatus?.isCompleted
              ? 'text-[#22c55e]'  // Green text for completed payments
              : isPaymentSoon
              ? 'text-[#ef4444]'  // Red text for soon payments
              : 'text-[#f59e0b]'  // Yellow text for normal payments
            : ''
        }`}>
          {date.getDate()}
        </div>
      </div>

      {/* Class count and payment pills */}
      <div className="class-details">
        <div className="flex flex-col items-center gap-2">
          {classes.length > 0 && (
            <div
              key="class-count-pill"
              className="calendar-pill class-count-pill"
              onClick={handleClassCountClick}
            >
              {classes.length === 1 
                ? (() => {
                    // Get the start and end times, considering multiple schedules
                    let classItem = classes[0];
                    let startTime = classItem.startTime;
                    let endTime = classItem.endTime;
                    let timezone = classItem.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
                    
                    // If it's a multiple schedule class, find the right schedule for this day
                    if (classItem.scheduleType === 'multiple' && Array.isArray(classItem.schedules)) {
                      const dayOfWeek = date.getDay();
                      const matchingSchedule = classItem.schedules.find(s => s.dayOfWeek === dayOfWeek);
                      
                      if (matchingSchedule) {
                        startTime = matchingSchedule.startTime;
                        endTime = matchingSchedule.endTime;
                        timezone = matchingSchedule.timezone || timezone;
                      }
                    }

                    // Get the user's local timezone
                    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    
                    // Use our utility function to format the time with both timezones
                    // Don't show source time in the pill to save space
                    return formatTimeWithTimezones(startTime, endTime, timezone, userTimezone, date, false);
                  })()
                : `${classes.length} ${t.class}`
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
              key="payment-pill"
              className={`calendar-pill payment-pill ${
                paymentStatus?.isCompleted
                  ? 'completed'
                  : isPaymentSoon
                  ? 'soon'
                  : 'normal'
              }`}
              onClick={handlePaymentPillClick}
              title={createPaymentTooltip()}
            >
              {paymentStatus?.isCompleted ? t.paymentCompleted : t.paymentDue}
            </div>
          )}

          {hasHomework && (
            <div 
              key="homework-pill"
              className={`calendar-pill homework-pill ${hasHomeworkFeedback ? 'has-feedback' : ''}`}
              onClick={handleHomeworkPillClick}
            >
              Homework ({getTotalHomeworkCount()})
              <span className="homework-icon text-white ml-1">
                <FaBook className="inline-block w-3 h-3" />
              </span>
              {hasHomeworkFeedback && (
                <span className="feedback-icon text-white ml-1">
                  <FaCommentAlt className="inline-block w-3 h-3" />
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 