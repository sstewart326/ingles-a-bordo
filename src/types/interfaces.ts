/**
 * Common interfaces used throughout the application
 */

export interface ClassMaterial {
  classId: string;
  slides?: string[]; // Array of URLs to slides
  links?: string[];
  createdAt: Date;
  updatedAt: Date;
  classDate: Date; // The specific date this material is for
  studentEmails: string[]; // The specific students these materials are for
  studentIds?: string[]; // Keep for backward compatibility
}

export interface Class {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  courseType: string;
  notes?: string;
  studentEmails: string[];
  studentIds?: string[]; // Keep for backward compatibility
  startDate?: { toDate: () => Date }; // Firebase Timestamp
  endDate?: { toDate: () => Date }; // Optional Firebase Timestamp
}

export interface ClassInfo {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  studentEmails: string[];
  studentIds?: string[]; // Keep for backward compatibility
  startDate: { toDate: () => Date }; // Firebase Timestamp (required)
  endDate?: { toDate: () => Date }; // Firebase Timestamp (optional)
}

export interface User {
  id: string;
  email: string;
  name?: string;
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