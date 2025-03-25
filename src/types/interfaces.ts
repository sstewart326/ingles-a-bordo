import { Timestamp } from 'firebase/firestore';
import { ClassSession } from '../utils/scheduleUtils';
import { Payment } from './payment';

/**
 * Common interfaces used throughout the application
 */



export interface CalendarDayProps {
  date: Date;
  isToday: boolean;
  dayClasses: ClassSession[];
  paymentsDue: { user: User; classSession: ClassSession }[];
  onClassCountClick: (e: React.MouseEvent, date: Date, dayClasses: ClassSession[], paymentsDue: { user: User; classSession: ClassSession }[]) => void;
  onPaymentPillClick: (e: React.MouseEvent, date: Date, dayClasses: ClassSession[], paymentsDue: { user: User; classSession: ClassSession }[]) => void;
  onDayClick?: (date: Date, classes: ClassSession[]) => void;
  completedPayments?: Payment[];
  isLoading?: boolean;
  isDateInRelevantMonthRange: (date: Date, selectedDate?: Date) => boolean;
  users?: User[];
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface ClassMaterial {
  classId: string;
  id?: string;
  slides?: string[]; // Array of URLs to slides
  links?: string[];
  createdAt: Date;
  updatedAt: Date;
  classDate: Date; // The specific date this material is for
  studentEmails: string[]; // The specific students these materials are for
  studentIds?: string[]; // Keep for backward compatibility
  teacherId: string; // The ID of the teacher who created the material
  month: string; // The month in YYYY-MM format for efficient querying
}

// New interface for homework assignments
export interface Homework {
  id: string;
  classId: string;
  teacherId: string; // ID of the teacher who created the homework
  month: string; // YYYY-MM format for querying by month
  title: string;
  description: string;
  documents?: { url: string; name: string; type: string; size: number }[]; // Files attached to homework
  classDate: Date; // The date this homework is assigned for
  allowTextSubmission: boolean; // Whether students can submit text responses
  allowFileSubmission: boolean; // Whether students can upload files
  createdAt: Date;
  updatedAt: Date;
}

// Interface for student homework submissions
export interface HomeworkSubmission {
  id: string;
  homeworkId: string;
  studentEmail: string;
  textResponse?: string;
  files?: { url: string; name: string; type: string; size: number }[];
  submittedAt: Date;
  updatedAt: Date;
  status: 'submitted' | 'reviewed' | 'graded';
  feedback?: string;
  grade?: string;
}

export interface PaymentConfig {
  type: 'weekly' | 'monthly';
  weeklyInterval?: number;  // for weekly payments, number of weeks
  monthlyOption?: 'first' | 'fifteen' | 'last';  // for monthly payments: first day, 15th, or last day
  startDate: string;  // YYYY-MM-DD date string
  paymentLink?: string;  // URL for payment
  amount?: number;  // Payment amount
  currency?: string;  // Payment currency (e.g., USD, BRL)
  completed?: boolean;  // Whether the payment has been completed
}

export interface Class {
  id: string;
  studentEmails: string[];
  studentIds: string[];
  scheduleType: 'single' | 'multiple';  // New field to indicate schedule type
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;  // Add timezone field
  schedules?: ClassSchedule[];
  courseType: string;
  notes?: string;
  startDate: Timestamp;
  endDate: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  contractUrl?: string;  // URL to the contract document
  paymentConfig: PaymentConfig;
  frequency: {
    type: 'weekly' | 'biweekly' | 'custom';
    every: number; // 1 for weekly, 2 for biweekly, custom number for every X weeks
  };
}

export interface ClassInfo {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
  studentEmails: string[];
  studentIds?: string[]; // Keep for backward compatibility
  startDate: { toDate: () => Date }; // Firebase Timestamp (required)
  endDate?: { toDate: () => Date }; // Firebase Timestamp (optional)
}

export interface User {
  id: string;
  uid?: string;  // Firebase Auth UID
  email: string;
  name: string;
  isAdmin: boolean;
  isTeacher?: boolean;
  status?: 'active' | 'pending';
  createdAt: string | Date;
  birthdate?: string;  // Add birthdate to User interface
  teacher?: string;  // ID of the admin who created this user
  paymentConfig?: {
    type: 'weekly' | 'monthly';
    weeklyInterval?: number;
    monthlyOption?: 'first' | 'fifteen' | 'last';
    startDate: string;
    paymentLink?: string;
  };
}

export interface MonthYear {
  month: number;
  year: number;
}

export interface ClassPlanItem {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  completedDate?: { toDate: () => Date }; // Firebase Timestamp
  children?: ClassPlanItem[]; // Add support for nested items
  isExpanded?: boolean; // Track if children are visible
}

export interface ClassPlan {
  id: string;
  studentEmail: string;
  month: number; // 0-11
  year: number;
  items: ClassPlanItem[];
  createdAt: { toDate: () => Date }; // Firebase Timestamp
  updatedAt: { toDate: () => Date }; // Firebase Timestamp
  createdBy: string; // admin's email
}

export interface ClassPlanTemplate {
  id: string;
  name: string;
  items: Omit<ClassPlanItem, 'id' | 'completed' | 'completedDate'>[];
  createdAt: { toDate: () => Date }; // Firebase Timestamp
  createdBy: string; // admin's email
}

export interface ClassSchedule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
} 