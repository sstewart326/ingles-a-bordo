import { ClassSession, User } from '../utils/scheduleUtils';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { Payment } from '../types/payment';

export interface CalendarDayProps<T extends ClassSession> {
  date: Date;
  isToday: boolean;
  classes: T[];
  paymentsDue?: { user: User; classSession: ClassSession }[];
  onDayClick?: (date: Date, classes: T[]) => void;
  completedPayments?: Payment[];
  isLoading?: boolean;
  isDateInRelevantMonthRange: (date: Date) => boolean;
}

export function CalendarDay<T extends ClassSession>({
  date,
  isToday,
  classes = [],
  paymentsDue = [],
  onDayClick,
  completedPayments = [],
  isLoading = false,
  isDateInRelevantMonthRange
}: CalendarDayProps<T>) {
  const { language } = useLanguage();
  const t = useTranslation(language);
  
  const isPaymentDay = paymentsDue.length > 0;
  const daysUntilPayment = isPaymentDay ? 
    Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
  const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

  // Check if all payments for this day are completed
  const allPaymentsCompleted = isPaymentDay && paymentsDue.every(({ user, classSession }) => {
    return completedPayments.some(payment => 
      payment.userId === user.id && payment.classSessionId === classSession.id
    );
  });

  // Handle day click
  const handleDayClick = () => {
    if (onDayClick) {
      onDayClick(date, classes);
    }
  };

  // Don't show payment indicators while loading
  const shouldShowPaymentIndicators = isPaymentDay && !isLoading;
  
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
    if (!paymentsDue.length) return '';
    
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

  const isRelevant = isDateInRelevantMonthRange(date);
  const hasClasses = classes.length > 0;

  return (
    <div className={`h-full flex flex-col ${!isRelevant ? 'text-gray-400' : ''}`} onClick={handleDayClick}>
      {/* Indicators */}
      <div className="calendar-day-indicators">
        {hasClasses && (
          <div className="indicator class-indicator" title="Has classes" />
        )}
        {shouldShowPaymentIndicators && (
          <div 
            className={`indicator ${
              allPaymentsCompleted ? 'bg-green-500' :
              isPaymentSoon ? 'payment-soon-indicator' : 'payment-indicator'
            }`}
            title={
              allPaymentsCompleted ? t.allPaymentsCompleted :
              isPaymentSoon ? 'Payment due soon' : 'Payment due'
            }
          />
        )}
      </div>

      {/* Date */}
      <div className="flex flex-col items-center">
        <div className={`date-number ${isToday ? 'text-[#6366f1]' : ''} ${
          shouldShowPaymentIndicators ? (
            allPaymentsCompleted ? 'text-green-500' :
            isPaymentSoon ? 'text-[#ef4444]' : 'text-[#f59e0b]'
          ) : ''
        }`}>
          {date.getDate()}
        </div>
      </div>

      {/* Class count and payment pills */}
      <div className="class-details">
        <div className="flex flex-col items-center gap-2">
          {hasClasses && (
            <div 
              className="calendar-pill class-count-pill"
              onClick={(e) => {
                e.stopPropagation();
                handleDayClick();
              }}
            >
              {classes.length} {classes.length === 1 ? t.class : t.class}
            </div>
          )}
          
          {shouldShowPaymentIndicators && (
            <div 
              key={`payment-pill-${completedPayments.length}`}
              className={`calendar-pill payment-pill ${
                allPaymentsCompleted ? 'bg-green-500 hover:bg-green-600' :
                isPaymentSoon ? 'soon' : 'normal'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                handleDayClick();
              }}
              title={createPaymentTooltip()}
            >
              {paymentsDue.length} {paymentsDue.length === 1 ? t.paymentDue : t.paymentsDue}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 