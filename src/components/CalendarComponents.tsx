import { ClassSession } from '../utils/scheduleUtils';
import { useTranslation } from '../translations';
import { useLanguage } from '../hooks/useLanguage';
import React, { useRef } from 'react';
import { CalendarDayProps } from '../types/interfaces';

export const CalendarDay = ({
  date,
  isToday,
  dayClasses,
  paymentsDue,
  onClassCountClick,
  onPaymentPillClick
}: CalendarDayProps) => {
  const { language } = useLanguage();
  const t = useTranslation(language);
  const isPaymentDay = paymentsDue.length > 0;
  const daysUntilPayment = isPaymentDay ? 
    Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
  const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

  return (
    <div className="h-full flex flex-col">
      {/* Indicators */}
      <div className="calendar-day-indicators">
        {dayClasses.length > 0 && (
          <div className="indicator class-indicator" title="Has classes" />
        )}
        {isPaymentDay && (
          <div 
            className={`indicator ${isPaymentSoon ? 'payment-soon-indicator' : 'payment-indicator'}`}
            title={isPaymentSoon ? 'Payment due soon' : 'Payment due'}
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
          {dayClasses.length > 0 && (
            <div 
              className="calendar-pill class-count-pill"
              onClick={(e) => onClassCountClick(e, date, dayClasses, paymentsDue)}
            >
              {dayClasses.length} {dayClasses.length === 1 ? t.class || 'class' : t.class || 'classes'}
            </div>
          )}
          
          {isPaymentDay && (
            <div 
              className={`calendar-pill payment-pill ${isPaymentSoon ? 'soon' : 'normal'}`}
              onClick={(e) => onPaymentPillClick(e, date, dayClasses, paymentsDue)}
            >
              {(() => {
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
                    {paymentsDue.length} {paymentsDue.length === 1 ? t.paymentDue || 'payment' : t.paymentDue || 'payments'}
                    {hasPaymentAmount && ` (${currency} ${totalAmount.toFixed(2)})`}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface ClassTimeModalProps {
  isOpen: boolean;
  position: { x: number; y: number };
  classes: ClassSession[];
  date: Date;
  formatStudentNames: (studentEmails: string[]) => string;
  onClose: () => void;
}

export const ClassTimeModal = ({
  isOpen,
  position,
  classes,
  date,
  formatStudentNames,
  onClose
}: ClassTimeModalProps) => {
  const { language } = useLanguage();
  const modalRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  return (
    <>
      <div 
        className="fixed inset-0 z-40"
        onClick={handleOverlayClick}
      />
      <div 
        ref={modalRef}
        className="class-time-modal"
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          transform: 'translateX(-50%)',
          zIndex: 50,
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          padding: '0.75rem',
          minWidth: '200px',
          maxWidth: '300px',
          maxHeight: '80vh',
          overflowY: 'auto',
          pointerEvents: 'auto'
        }}
      >
        <div className="text-sm font-medium mb-2">
          {date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric' 
          })}
        </div>
        <div className="space-y-2">
          {classes.map((classItem) => (
            <div 
              key={classItem.id}
              className="time-pill"
              style={{
                backgroundColor: '#6366f1',
                color: 'white',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.25rem',
                fontSize: '0.75rem'
              }}
            >
              <div className="flex justify-between items-center">
                <span>{classItem.startTime}</span>
                <span className="text-xs">{formatStudentNames(classItem.studentEmails)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}; 