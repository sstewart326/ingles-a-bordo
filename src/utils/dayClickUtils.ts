import { ClassSession } from './scheduleUtils';
import { ClassMaterial, User } from '../types/interfaces';
import { Payment } from '../types/payment';
import { DayDetails } from '../types/dayDetails';
import { getPaymentsDueForDay } from './paymentUtils';
import { getPaymentsForDates } from '../services/paymentService';
import { getClassMaterials } from './classMaterialsUtils';
import { getBaseClassId } from './scheduleUtils';

export const handleDayClickInternal = async (
  date: Date,
  getClassesForDay: (dayOfWeek: number, date: Date) => ClassSession[],
  users: User[],
  dailyClassMap: Record<string, any[]>,
  currentUser?: { uid: string },
  isDateInRelevantMonthRange?: (date: Date, selectedDate?: Date) => boolean
): Promise<DayDetails> => {
  const classes = getClassesForDay(date.getDay(), date);
  const paymentsDue = await getPaymentsDueForDay(
    date,
    classes,
    users,
    isDateInRelevantMonthRange || ((_: Date) => true)
  );
  const materials: Record<string, ClassMaterial[]> = {};
  const completedPayments: Record<string, Payment[]> = {};

  // Get all payments for the date
  const payments = await getPaymentsForDates([date], classes.map(c => c.id));

  // Group payments by classId
  payments.forEach(payment => {
    if (payment.classSessionId) {
      if (!completedPayments[payment.classSessionId]) {
        completedPayments[payment.classSessionId] = [];
      }
      completedPayments[payment.classSessionId].push(payment);
    }
  });

  // Fetch materials for each class
  for (const classSession of classes) {
    const classId = getBaseClassId(classSession.id);
    if (classId) {
      const classMaterials = await getClassMaterials(classId, date, currentUser?.uid);
      if (classMaterials.length > 0) {
        materials[classId] = classMaterials;
      }
    }
  }

  // Get birthdays for the selected date
  const birthdays = users.filter(user => {
    if (!user.birthdate) return false;
    const [month, day] = user.birthdate.split('-').map(Number);
    return day === date.getDate() && month === date.getMonth() + 1;
  });

  return {
    date,
    classes,
    paymentsDue,
    materials,
    birthdays,
    completedPayments,
    dailyItems: dailyClassMap[date.toISOString().split('T')[0]] || []
  };
}; 