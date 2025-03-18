import React from 'react';
import { ClassSession, User } from '../utils/scheduleUtils';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { FaFileAlt, FaBook, FaCommentAlt } from 'react-icons/fa';

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
      const time = classSession.startTime && classSession.endTime 
        ? `${classSession.startTime} - ${classSession.endTime}` 
        : '';
      
      const amountText = classSession.paymentConfig?.amount && classSession.paymentConfig?.currency
        ? ` (${classSession.paymentConfig.currency} ${classSession.paymentConfig.amount.toFixed(2)})`
        : '';
      
      return `${user.name}: ${dayName} ${time}${amountText}`;
    }).join('\n');
  };

  // Format time for a single class
  const formatSingleClassTime = (classItem: ClassSession): string => {
    // For classes with multiple schedules, find the matching schedule for the day of week
    let startTime = classItem.startTime;
    let endTime = classItem.endTime;
    
    if (classItem.scheduleType === 'multiple' && Array.isArray(classItem.schedules) && classItem.dayOfWeek !== undefined) {
      const matchingSchedule = classItem.schedules.find(schedule => 
        schedule.dayOfWeek === classItem.dayOfWeek
      );
      
      if (matchingSchedule) {
        startTime = matchingSchedule.startTime;
        endTime = matchingSchedule.endTime;
      }
    }
    
    if (!startTime || !endTime) return '';
    
    // Format times to be simpler (without leading zeros and AM/PM when possible)
    const formatTimeString = (timeStr: string): { display: string; period: string } => {
      // Extract hours, minutes, and period
      const match = timeStr.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
      if (!match) return { display: timeStr, period: '' };
      
      let [_, hours, minutes, period] = match;
      let hour = parseInt(hours);
      
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

    const startTimeInfo = formatTimeString(startTime);
    const endTimeInfo = formatTimeString(endTime);
    
    // If both periods are the same, only show it once at the end
    if (startTimeInfo.period === endTimeInfo.period) {
      return `${startTimeInfo.display}-${endTimeInfo.display} ${startTimeInfo.period}`;
    }
    
    // Otherwise show both periods
    return `${startTimeInfo.display} ${startTimeInfo.period}-${endTimeInfo.display} ${endTimeInfo.period}`;
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
            className={`indicator ${isPaymentSoon ? 'payment-soon-indicator' : 'payment-indicator'}`}
            title={isPaymentSoon ? 'Payment due soon' : 'Payment due'}
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
        <div className={`date-number ${isToday ? 'text-[#6366f1]' : ''} ${isPaymentDay ? (isPaymentSoon ? 'text-[#ef4444]' : 'text-[#f59e0b]') : ''}`}>
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
              key="payment-pill"
              className={`calendar-pill payment-pill ${isPaymentSoon ? 'soon' : 'normal'}`}
              onClick={handlePaymentPillClick}
              title={createPaymentTooltip()}
            >
              {Array.isArray(paymentsDue)
                ? (() => {
                    // Calculate total payment amount if available
                    let totalAmount = 0;
                    let currency = '';
                    let hasPaymentAmount = false;
                    
                    paymentsDue.forEach(({ classSession }) => {
                      if (classSession.paymentConfig?.amount && classSession.paymentConfig?.currency) {
                        totalAmount += classSession.paymentConfig.amount;
                        currency = classSession.paymentConfig.currency;
                        hasPaymentAmount = true;
                      }
                    });
                    
                    return (
                      <>
                        {paymentsDue.length} {paymentsDue.length === 1 ? t.paymentDue || 'payment' : t.paymentsDue || 'payments'}
                        {hasPaymentAmount && ` (${currency} ${totalAmount.toFixed(2)})`}
                      </>
                    );
                  })()
                : 'Payment Due'
              }
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