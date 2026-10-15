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

/** Content Library: teacher-uploaded content (YouTube, text, image) for students to view */
export type ContentLibraryItemType = 'youtube' | 'text' | 'image';

export interface ContentLibraryItem {
  id: string;
  teacherId: string;
  type: ContentLibraryItemType;
  title: string;
  description?: string;
  /** Empty = all students; non-empty = only those student UIDs */
  studentIds: string[];
  videoId?: string;
  videoUrl?: string;
  imageUrl?: string;
  /** Storage path for image (used for delete); set when uploading */
  imagePath?: string;
  order?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Content library comment. Visibility = content item visibility (teacher + students who can see item). */
export interface ContentLibraryComment {
  id: string;
  authorId: string;
  /** Display name at post time (persisted so readers do not need a user lookup). */
  authorName?: string;
  /** Profile image URL at post time (Storage path is publicly readable). */
  authorProfilePictureUrl?: string;
  authorIsTeacher: boolean;
  content: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  parentCommentId?: string;
  /** When true, comment was soft-deleted (e.g. has replies); show as [Deleted], keep replies. Default false when missing from Firestore. */
  deleted: boolean;
}

/** Resolved comment for display: content may come from latest version if edited. */
export interface ContentLibraryCommentResolved extends ContentLibraryComment {
  /** Resolved content (original or latest version). */
  content: string;
  hasEdits: boolean;
}

/** Single version of a comment (edit history). Comment doc is never updated; edits add new version docs. */
export interface ContentLibraryCommentVersion {
  id: string;
  content: string;
  createdAt: Timestamp;
  updatedBy?: string;
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

/** A link pinned to a user; optional title is shown instead of the URL when set. */
export interface PinnedLink {
  url: string;
  title?: string;
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
  /** When the current live schedule became effective. Defaults to createdAt when unset. */
  scheduleEffectiveFrom?: Timestamp;
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
  profilePictureUrl?: string;  // URL to the user's profile picture
  teacher?: string;  // ID of the admin who created this user
  paymentConfig?: {
    type: 'weekly' | 'monthly';
    weeklyInterval?: number;
    monthlyOption?: 'first' | 'fifteen' | 'last';
    startDate: string;
    paymentLink?: string;
  };
  pinnedLinks?: PinnedLink[];  // Links shown to this user on their schedule (optional title displays instead of URL)
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

/**
 * Frozen schedule snapshot stored at classes/{classId}/versions/{versionId}.
 * createdAt is when that schedule became effective.
 */
export interface ClassScheduleVersionDoc {
  id: string;
  createdAt: Timestamp;
  scheduleType: 'single' | 'multiple';
  schedules: ClassSchedule[];
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
  frequency: {
    type: 'weekly' | 'biweekly' | 'custom';
    every: number;
  };
}

/** Flat item in a teacher's universal onboarding checklist. */
export interface OnboardingChecklistItem {
  id: string;
  label: string;
}

/** Meta doc at onboardingChecklists/{teacherId}. */
export interface OnboardingChecklistMeta {
  teacherId: string;
  latestVersion: number;
  updatedAt: Timestamp | Date;
}

/** Immutable snapshot at onboardingChecklists/{teacherId}/versions/{version}. */
export interface OnboardingChecklistVersion {
  version: number;
  items: OnboardingChecklistItem[];
  createdAt: Timestamp | Date;
  createdBy: string;
}

/** Per-student checked state at onboardingChecklistProgress/{teacherId}_{studentId}. */
export interface OnboardingChecklistProgress {
  teacherId: string;
  studentId: string;
  studentEmail: string;
  checklistVersion: number;
  checkedItemIds: string[];
  updatedAt: Timestamp | Date;
}

/**
 * Attendance record for a single class session.
 * Stored at classes/{classId}/attendance/{classDate} (classDate = YYYY-MM-DD).
 * Only absences are stored; students not in absentStudentIds are considered present.
 */
export interface ClassAttendance {
  absentStudentIds: string[];
  teacherId: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

/**
 * Represents a one-off exception to a class schedule.
 * Used for cancellations and reschedules.
 */
export interface ClassException {
  id: string;
  classId: string;
  originalDate: string | null;  // YYYY-MM-DD format, null for reschedules without an original date
  type: 'cancelled' | 'rescheduled';
  originalStartTime: string;  // Original start time of the class
  originalEndTime: string;  // Original end time of the class
  // For rescheduled:
  newDate?: string;  // YYYY-MM-DD format
  newStartTime?: string;
  newEndTime?: string;
  reason?: string;
  timezone: string;  // Timezone identifier (e.g., "America/New_York", "UTC")
  createdAt: Date;
  createdBy: string;
} 