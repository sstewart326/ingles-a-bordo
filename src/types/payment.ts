import { Timestamp } from 'firebase/firestore';

export interface Payment {
  id: string;
  userId: string;
  classSessionId: string;
  amount: number;
  currency: string;
  status: 'completed';
  completedAt: Timestamp;
  dueDate: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PaymentDueNotification {
  userId: string;
  classSessionId: string;
  dueDate: Timestamp;
  completed: boolean;
} 