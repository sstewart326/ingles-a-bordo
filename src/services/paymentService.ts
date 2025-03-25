import { collection, addDoc, query, where, getDocs, Timestamp, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Payment } from '../types/payment';
import { logQuery } from '../utils/firebaseUtils';

const PAYMENTS_COLLECTION = 'payments';

// Cache interface
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresIn: number;
}

// Cache implementation
class PaymentsCache {
  private cache: Map<string, CacheEntry<Payment[]>> = new Map();
  private readonly DEFAULT_EXPIRY = 5 * 60 * 1000; // 5 minutes in milliseconds

  private createKey(dates: Date[], classSessionIds?: string[]): string {
    const dateStr = dates.map(d => d.toISOString().split('T')[0]).sort().join(',');
    const classStr = classSessionIds ? classSessionIds.sort().join(',') : '';
    return `${dateStr}|${classStr}`;
  }

  get(dates: Date[], classSessionIds?: string[]): Payment[] | null {
    const key = this.createKey(dates, classSessionIds);
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check if cache has expired
    if (Date.now() - entry.timestamp > entry.expiresIn) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  set(dates: Date[], payments: Payment[], classSessionIds?: string[], expiresIn: number = this.DEFAULT_EXPIRY): void {
    const key = this.createKey(dates, classSessionIds);
    this.cache.set(key, {
      data: payments,
      timestamp: Date.now(),
      expiresIn
    });
  }

  invalidate(): void {
    this.cache.clear();
  }
}

const paymentsCache = new PaymentsCache();

export const checkExistingPayment = async (userId: string, classSessionId: string, dueDate: Date): Promise<Payment | null> => {
  const startOfDay = new Date(dueDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(dueDate);
  endOfDay.setHours(23, 59, 59, 999);

  // Extract the base class ID (for multiple schedule classes)
  const baseClassId = classSessionId.split('-')[0];
  
  // If the classSessionId contains a day suffix, we need to check for both the original and base IDs
  const hasMultipleSchedules = classSessionId !== baseClassId;
  
  let querySnapshot;
  
  if (hasMultipleSchedules) {
    logQuery('Checking existing payment with multiple schedules', { userId, classSessionId, baseClassId, dueDate });
    // For multiple schedules, check for payments with either the specific day ID or the base ID
    const q1 = query(
      collection(db, PAYMENTS_COLLECTION),
      where('userId', '==', userId),
      where('classSessionId', '==', classSessionId),
      where('dueDate', '>=', Timestamp.fromDate(startOfDay)),
      where('dueDate', '<=', Timestamp.fromDate(endOfDay))
    );
    
    const q2 = query(
      collection(db, PAYMENTS_COLLECTION),
      where('userId', '==', userId),
      where('classSessionId', '==', baseClassId),
      where('dueDate', '>=', Timestamp.fromDate(startOfDay)),
      where('dueDate', '<=', Timestamp.fromDate(endOfDay))
    );
    
    // Execute both queries
    logQuery('Querying multiple schedule payment queries', { userId, classSessionId, baseClassId });
    const [snapshot1, snapshot2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    logQuery('Multiple schedule query results', { 
      snapshot1Size: snapshot1.size, 
      snapshot2Size: snapshot2.size 
    });
    
    // Return the first payment found
    if (!snapshot1.empty) {
      const doc = snapshot1.docs[0];
      return { id: doc.id, ...doc.data() } as Payment;
    }
    
    if (!snapshot2.empty) {
      const doc = snapshot2.docs[0];
      return { id: doc.id, ...doc.data() } as Payment;
    }
    
    return null;
  } else {
    // For single schedule classes, just check for the exact ID
    logQuery('Checking existing payment with single schedule', { userId, classSessionId, dueDate });
    const q = query(
      collection(db, PAYMENTS_COLLECTION),
      where('userId', '==', userId),
      where('classSessionId', '==', classSessionId),
      where('dueDate', '>=', Timestamp.fromDate(startOfDay)),
      where('dueDate', '<=', Timestamp.fromDate(endOfDay))
    );
    
    querySnapshot = await getDocs(q);
    logQuery('Single schedule query result', { size: querySnapshot.size });
  }

  if (querySnapshot && !querySnapshot.empty) {
    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as Payment;
  }
  return null;
};

export const createPayment = async (
  userId: string,
  classSessionId: string,
  amount: number,
  currency: string,
  dueDate: Date,
  completedAt?: Date
): Promise<string> => {
  // Check if payment already exists
  const existingPayment = await checkExistingPayment(userId, classSessionId, dueDate);
  if (existingPayment) {
    return existingPayment.id;
  }

  // Extract the base class ID for consistency with multiple schedule classes
  const baseClassId = classSessionId.split('-')[0];
  
  // Use the base class ID for storing the payment to avoid duplicates across different days
  const paymentData: Omit<Payment, 'id'> = {
    userId,
    classSessionId: baseClassId, // Store with the base class ID
    amount,
    currency,
    status: 'completed',
    completedAt: completedAt ? Timestamp.fromDate(completedAt) : Timestamp.now(),
    dueDate: Timestamp.fromDate(dueDate),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  logQuery('Creating new payment', paymentData);
  const docRef = await addDoc(collection(db, PAYMENTS_COLLECTION), paymentData);
  
  // Invalidate cache when new payment is created
  logQuery('Invalidating payments cache');
  paymentsCache.invalidate();
  
  return docRef.id;
};

export const getPaymentsForDates = async (dates: Date[], classSessionIds?: string[]): Promise<Payment[]> => {
  // Check cache first
  const cachedPayments = paymentsCache.get(dates, classSessionIds);
  if (cachedPayments) {
    logQuery('Cache hit for payments', { dates, classSessionIds });
    return cachedPayments;
  }
  
  // If not in cache, fetch from Firestore
  const startTimestamps = dates.map(date => {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    return Timestamp.fromDate(startOfDay);
  });

  startTimestamps.map(timestamp => {
    logQuery('Querying payment for date', { timestamp: timestamp.toDate(), classSessionIds: classSessionIds });
  });

  const queries = startTimestamps.map(timestamp => 
    query(
      collection(db, PAYMENTS_COLLECTION),
      where('dueDate', '==', timestamp),
      ...(classSessionIds && classSessionIds.length > 0 
        ? [where('classSessionId', 'in', classSessionIds)]
        : [])
    )
  );

  const querySnapshots = await Promise.all(
    queries.map(q => getDocs(q))
  );

  const seenIds = new Set<string>();
  const payments: Payment[] = [];

  querySnapshots.forEach(snapshot => {
    snapshot.docs.forEach(doc => {
      if (!seenIds.has(doc.id)) {
        seenIds.add(doc.id);
        payments.push({ id: doc.id, ...doc.data() } as Payment);
      }
    });
  });

  logQuery('Payment query results', { totalPayments: payments.length });
  
  // Store in cache before returning
  paymentsCache.set(dates, payments, classSessionIds);
  return payments;
};

export const getPaymentsForDate = async (date: Date): Promise<Payment[]> => {
  return getPaymentsForDates([date]);
};

export const getPaymentsByDueDate = async (dueDate: Date, classSessionId: string): Promise<Payment[]> => {
  // Create start and end of day timestamps for the due date
  const startOfDay = new Date(dueDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(dueDate);
  endOfDay.setHours(23, 59, 59, 999);

  // Extract the base class ID (for multiple schedule classes)
  const baseClassId = classSessionId.split('-')[0];
  
  // If the classSessionId contains a day suffix, we need to check for both the original and base IDs
  const hasMultipleSchedules = classSessionId !== baseClassId;
  
  let querySnapshot;
  
  if (hasMultipleSchedules) {
    logQuery('Querying payments for multiple schedules', { dueDate, classSessionId, baseClassId });
    // For multiple schedules, check for payments with either the specific day ID or the base ID
    const q1 = query(
      collection(db, PAYMENTS_COLLECTION),
      where('classSessionId', '==', classSessionId),
      where('dueDate', '>=', Timestamp.fromDate(startOfDay)),
      where('dueDate', '<=', Timestamp.fromDate(endOfDay))
    );
    
    const q2 = query(
      collection(db, PAYMENTS_COLLECTION),
      where('classSessionId', '==', baseClassId),
      where('dueDate', '>=', Timestamp.fromDate(startOfDay)),
      where('dueDate', '<=', Timestamp.fromDate(endOfDay))
    );
    
    // Execute both queries
    const [snapshot1, snapshot2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    logQuery('Multiple schedule payment results', {
      snapshot1Size: snapshot1.size,
      snapshot2Size: snapshot2.size
    });
    
    // Combine and deduplicate results
    const allDocs = [...snapshot1.docs, ...snapshot2.docs];
    const uniquePayments = new Map<string, Payment>();
    
    allDocs.forEach(doc => {
      const payment = { id: doc.id, ...doc.data() } as Payment;
      uniquePayments.set(doc.id, payment);
    });
    
    return Array.from(uniquePayments.values());
  } else {
    logQuery('Querying payments for single schedule', { dueDate, classSessionId });
    const q = query(
      collection(db, PAYMENTS_COLLECTION),
      where('classSessionId', '==', classSessionId),
      where('dueDate', '>=', Timestamp.fromDate(startOfDay)),
      where('dueDate', '<=', Timestamp.fromDate(endOfDay))
    );
    
    querySnapshot = await getDocs(q);
    logQuery('Single schedule payment results', { size: querySnapshot.size });
    
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Payment);
  }
};

export const getPaymentById = async (paymentId: string): Promise<Payment | null> => {
  logQuery('Getting payment by ID', { paymentId });
  const docRef = doc(db, PAYMENTS_COLLECTION, paymentId);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    return null;
  }
  
  return { id: docSnap.id, ...docSnap.data() } as Payment;
};

export const deletePayment = async (paymentId: string): Promise<void> => {
  logQuery('Deleting payment', { paymentId });
  const docRef = doc(db, PAYMENTS_COLLECTION, paymentId);
  await deleteDoc(docRef);
  
  // Invalidate cache when payment is deleted
  logQuery('Invalidating payments cache');
  paymentsCache.invalidate();
}; 