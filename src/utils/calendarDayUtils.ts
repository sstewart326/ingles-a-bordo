import { ClassSession, User } from './scheduleUtils';
import { MouseEvent } from 'react';

interface CalendarDayState {
  classTimeModal: {
    isOpen: boolean;
    position: { x: number; y: number };
    classes: ClassSession[];
    date: Date;
  };
  setClassTimeModal: (modal: {
    isOpen: boolean;
    position: { x: number; y: number };
    classes: ClassSession[];
    date: Date;
  }) => void;
  handleDayClick: (date: Date, classes: ClassSession[], paymentsDue: { user: User; classSession: ClassSession }[]) => void;
}

interface RenderCalendarDayParams {
  date: Date;
  isToday: boolean;
  dayClasses: ClassSession[];
  paymentsDue: { user: User; classSession: ClassSession }[];
  state: CalendarDayState;
  formatStudentNames: (studentEmails: string[]) => string;
  t: { [key: string]: string };
  language: string;
  users: User[];
}

export const renderCalendarDay = ({
  date,
  isToday,
  dayClasses,
  paymentsDue,
  state,
  formatStudentNames,
  t,
  language,
  users
}: RenderCalendarDayParams) => {
  const isPaymentDay = paymentsDue.length > 0;
  const daysUntilPayment = isPaymentDay ? 
    Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
  const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

  // Check for birthdays
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const dateString = `${month}-${day}`;
  const birthdays = users.filter(user => user.birthdate === dateString);

  const handleClassCountClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    state.setClassTimeModal({
      isOpen: true,
      position: {
        x: rect.left + rect.width / 2,
        y: rect.bottom + window.scrollY + 10
      },
      classes: dayClasses,
      date
    });
    state.handleDayClick(date, dayClasses, paymentsDue);
  };

  const handlePaymentPillClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    state.setClassTimeModal({
      isOpen: true,
      position: {
        x: rect.left + rect.width / 2,
        y: rect.bottom + window.scrollY + 10
      },
      classes: dayClasses,
      date
    });
    state.handleDayClick(date, dayClasses, paymentsDue);
  };

  return {
    indicators: {
      hasClasses: dayClasses.length > 0,
      isPaymentDay,
      isPaymentSoon,
      hasBirthdays: birthdays.length > 0
    },
    dateNumber: {
      value: date.getDate(),
      isToday,
      isPaymentDay,
      isPaymentSoon,
      hasBirthdays: birthdays.length > 0
    },
    pills: {
      classCount: dayClasses.length > 0 ? {
        count: dayClasses.length,
        text: dayClasses.length === 1 ? t.class || 'class' : t.class || 'classes',
        onClick: handleClassCountClick
      } : null,
      payment: isPaymentDay ? {
        count: paymentsDue.length,
        text: paymentsDue.length === 1 ? t.paymentDue || 'payment' : t.paymentDue || 'payments',
        isSoon: isPaymentSoon,
        onClick: handlePaymentPillClick
      } : null,
      birthdays: birthdays.length > 0 ? {
        count: birthdays.length,
        text: birthdays.length === 1 ? t.birthday || 'birthday' : t.birthdays || 'birthdays',
        names: birthdays.map(user => user.name)
      } : null
    }
  };
};