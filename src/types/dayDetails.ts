import { ClassSession } from '../utils/scheduleUtils';
import { ClassMaterial, User } from './interfaces';
import { Payment } from './payment';

export interface DayDetails {
  date: Date;
  classes: ClassSession[];
  paymentsDue: { user: User; classSession: ClassSession; }[];
  materials: Record<string, ClassMaterial[]>;
  birthdays?: User[];
  completedPayments: Record<string, Payment[]>;
  dailyItems?: Array<{
    type: 'class' | 'payment';
    id: string;
    startTime?: string;
    endTime?: string;
    timezone?: string;
    courseType?: string;
    students?: Array<{ name?: string; email: string }>;
    student?: { name?: string; email: string };
    paymentConfig?: any;
  }>;
} 