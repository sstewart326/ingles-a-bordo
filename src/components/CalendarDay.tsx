import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { CalendarDayProps } from '../types/interfaces';
export function CalendarDay({
  date,
  isToday,
  dayClasses = [],
  paymentsDue = [],
  onDayClick,
  completedPayments = [],
  isLoading = false,
  isDateInRelevantMonthRange,
  users = []
}: CalendarDayProps) {
  const { language } = useLanguage();
  const t = useTranslation(language);
  
  const isPaymentDay = paymentsDue.length > 0;
  const daysUntilPayment = isPaymentDay ? 
    Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
  const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

  // Check for birthdays
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const dateString = `${month}-${day}`;
  const birthdays = users.filter(user => user.birthdate === dateString);
  const hasBirthdays = birthdays.length > 0;

  // Check if all payments for this day are completed
  const allPaymentsCompleted = isPaymentDay && paymentsDue.every(({ user, classSession }) => {
    // Start by getting the date in midnight form for comparison
    const selectedDateStart = new Date(date);
    selectedDateStart.setHours(0, 0, 0, 0);
    
    return completedPayments.some(payment => {
      // First check if this payment is for the correct user and class
      if (payment.userId !== user.email || payment.classSessionId !== classSession.id) {
        return false;
      }
      
      // Then check if the payment's due date matches the calendar day
      if (payment.dueDate) {
        // Convert Firebase Timestamp to JavaScript Date
        let dueDateObj;
        if (typeof payment.dueDate === 'object' && 'seconds' in payment.dueDate) {
          // If it's a Firestore Timestamp
          dueDateObj = new Date(payment.dueDate.seconds * 1000);
        } else if (Object.prototype.toString.call(payment.dueDate) === '[object Date]') {
          // If it's already a Date object
          dueDateObj = payment.dueDate as unknown as Date;
        } else {
          // If it's a date string or timestamp
          dueDateObj = new Date(payment.dueDate as any);
        }
        
        // Reset hours to compare just the date
        dueDateObj.setHours(0, 0, 0, 0);
        
        // Compare the dates
        return dueDateObj.getTime() === selectedDateStart.getTime();
      }
      
      // If no date info is available, fall back to just checking ID matches
      return true;
    });
  });

  // Handle day click
  const handleDayClick = () => {
    if (onDayClick) {
      onDayClick(date, dayClasses);
    }
  };

  // Handle pill click with proper event handling
  const handlePillClick = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent any default behavior
    e.stopPropagation(); // Stop event from bubbling up
    handleDayClick(); // Trigger the day click handler
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
      
      return `${user.name}: ${dayName} ${t.class} ${time}${amountText}`;
    }).join('\n');
  };

  // Create tooltip text for class pill
  const createClassTooltip = (): string => {
    if (!dayClasses.length) return '';
    
    return dayClasses.map(classSession => {
      const time = classSession.startTime && classSession.endTime 
        ? `${classSession.startTime} - ${classSession.endTime}` 
        : '';
      
      const studentNames = classSession.studentEmails.map(email => {
        const user = users.find(u => u.email === email);
        return user?.name || email;
      });
      
      return `${studentNames.join(', ')}\n${time}`;
    }).join('\n\n');
  };

  // Create tooltip text for birthday pill
  const createBirthdayTooltip = (): string => {
    if (!birthdays.length) return '';
    
    return birthdays.map(user => {
      // Format the date string for display
      const formattedDate = new Date(new Date().getFullYear(), parseInt(month) - 1, parseInt(day))
        .toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en-US', { 
          month: 'long', 
          day: 'numeric' 
        });
      
      return `${user.name}`;
    }).join('\n\n');
  };

  const isRelevant = isDateInRelevantMonthRange(date, date);
  const hasClasses = dayClasses.length > 0;

  return (
    <div className={`h-full flex flex-col ${!isRelevant ? 'text-gray-400' : ''}`} onClick={handleDayClick}>
      {/* Header section with indicators and date */}
      <div className="calendar-day-header">
        <div className="calendar-day-indicators">
          {hasClasses && (
            <div className="indicator class-indicator" title="Has classes" />
          )}
          {shouldShowPaymentIndicators && (
            <div 
              className={`indicator ${
                allPaymentsCompleted ? 'payment-completed-indicator' :
                isPaymentSoon ? 'payment-soon-indicator' : 'payment-indicator'
              }`}
              title={
                allPaymentsCompleted ? t.allPaymentsCompleted :
                isPaymentSoon ? 'Payment due soon' : 'Payment due'
              }
            />
          )}
          {hasBirthdays && (
            <div className="indicator birthday-indicator" title={`${birthdays.length} ${birthdays.length === 1 ? t.birthday : t.birthdays}`}>
              🎂
            </div>
          )}
        </div>

        <div className={`date-number ${isToday ? 'text-[#6366f1]' : ''} ${
          shouldShowPaymentIndicators ? (
            allPaymentsCompleted ? 'text-green-500' :
            isPaymentSoon ? 'text-[#ef4444]' : 'text-[#f59e0b]'
          ) : ''
        }`}>
          {date.getDate()}
        </div>
      </div>

      {/* Class count, payment pills, and birthday pills */}
      <div className="class-details">
        <div className="flex flex-col items-center gap-2">
          {hasClasses && (
            <div 
              className="calendar-pill class-count-pill"
              onClick={handlePillClick}
              title={createClassTooltip()}
            >
              {dayClasses.length} {dayClasses.length === 1 ? t.class : t.class}
            </div>
          )}
          
          {shouldShowPaymentIndicators && (
            <div 
              key={`payment-pill-${completedPayments.length}`}
              className={`calendar-pill payment-pill ${
                allPaymentsCompleted ? 'bg-green-500 hover:bg-green-600' :
                isPaymentSoon ? 'soon' : 'normal'
              }`}
              onClick={handlePillClick}
              title={createPaymentTooltip()}
            >
              {allPaymentsCompleted ? t.allPaymentsCompleted : 
                (() => {
                  // Get the selected date for date comparison
                  const selectedDateStart = new Date(date);
                  selectedDateStart.setHours(0, 0, 0, 0);
                  
                  const pendingPayments = paymentsDue.filter(({ user, classSession }) => 
                    !completedPayments.some(payment => {
                      // First check if this payment is for the correct user and class
                      if (payment.userId !== user.email || payment.classSessionId !== classSession.id) {
                        return false;
                      }
                      
                      // Then check if the payment's due date matches the calendar day
                      if (payment.dueDate) {
                        // Convert Firebase Timestamp to JavaScript Date
                        let dueDateObj;
                        if (typeof payment.dueDate === 'object' && 'seconds' in payment.dueDate) {
                          // If it's a Firestore Timestamp
                          dueDateObj = new Date(payment.dueDate.seconds * 1000);
                        } else if (Object.prototype.toString.call(payment.dueDate) === '[object Date]') {
                          // If it's already a Date object
                          dueDateObj = payment.dueDate as unknown as Date;
                        } else {
                          // If it's a date string or timestamp
                          dueDateObj = new Date(payment.dueDate as any);
                        }
                        
                        // Reset hours to compare just the date
                        dueDateObj.setHours(0, 0, 0, 0);
                        
                        // Compare the dates
                        return dueDateObj.getTime() === selectedDateStart.getTime();
                      }
                      
                      // If no due date, just check the IDs
                      return true;
                    })
                  ).length;
                  return `${pendingPayments} ${pendingPayments === 1 ? t.paymentDue : t.paymentsDue}`;
                })()
              }
            </div>
          )}

          {hasBirthdays && (
            <div 
              className="calendar-pill birthday-pill"
              onClick={handlePillClick}
              title={createBirthdayTooltip()}
            >
              {birthdays.length} {birthdays.length === 1 ? t.birthday : t.birthdays}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 