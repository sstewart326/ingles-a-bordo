import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

export interface RegisterPaymentRequest {
  userEmail: string;
  classId: string;
  dueDate?: string;
  amount?: number;
  currency?: string;
  stripeReference?: string;
  billingPeriodStart?: number;
  billingPeriodEnd?: number;
}

export interface PaymentConfig {
  type?: 'weekly' | 'monthly';
  weeklyInterval?: number;
  monthlyOption?: 'first' | 'fifteen' | 'last';
  startDate?: string;
  amount?: number;
  currency?: string;
}

function getBaseClassId(classId: string): string {
  return classId.split('-')[0];
}

/**
 * Calendar due dates are date-only (YYYY-MM-DD). Store them as noon UTC so the
 * civil day is stable in Cloud Functions (TZ=UTC) and in US/Brazil local display.
 * Local midnight in a UTC process becomes 00:00Z, which shifts back a day in EDT/BRT.
 */
function calendarDateToUtcNoon(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0, 0));
}

function parseDueDateString(dueDate: string): Date {
  const [year, month, day] = dueDate.split('-').map(Number);
  return calendarDateToUtcNoon(year, month - 1, day);
}

function toUtcNoon(date: Date): Date {
  return calendarDateToUtcNoon(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

/**
 * Calculate payment due dates within a range (shared logic for calendar and renewals).
 */
export function calculatePaymentDueDatesInRange(
  paymentConfig: PaymentConfig | null | undefined,
  rangeStart: Date,
  rangeEnd: Date
): Date[] {
  const dates: Date[] = [];
  if (!paymentConfig) {
    return dates;
  }

  let paymentStartDate: Date;
  if (paymentConfig.startDate) {
    paymentStartDate = parseDueDateString(paymentConfig.startDate);
  } else {
    paymentStartDate = toUtcNoon(rangeStart);
  }

  if (paymentStartDate > rangeEnd) {
    return dates;
  }

  if (paymentConfig.type === 'weekly') {
    const interval = paymentConfig.weeklyInterval || 1;
    let currentPaymentDate = new Date(paymentStartDate);

    if (currentPaymentDate < rangeStart) {
      const diffTime = rangeStart.getTime() - currentPaymentDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const intervalsToAdd = Math.ceil(diffDays / (7 * interval));
      currentPaymentDate = new Date(
        currentPaymentDate.getTime() + intervalsToAdd * 7 * interval * 24 * 60 * 60 * 1000
      );
      currentPaymentDate = toUtcNoon(currentPaymentDate);
    }

    while (currentPaymentDate <= rangeEnd) {
      if (currentPaymentDate >= paymentStartDate) {
        dates.push(toUtcNoon(currentPaymentDate));
      }
      currentPaymentDate = new Date(
        currentPaymentDate.getTime() + 7 * interval * 24 * 60 * 60 * 1000
      );
      currentPaymentDate = toUtcNoon(currentPaymentDate);
    }
  } else {
    const monthlyOption = paymentConfig.monthlyOption || 'first';
    let year = rangeStart.getUTCFullYear();
    let month = rangeStart.getUTCMonth();
    const endYear = rangeEnd.getUTCFullYear();
    const endMonth = rangeEnd.getUTCMonth();

    while (year < endYear || (year === endYear && month <= endMonth)) {
      let paymentDate: Date;

      switch (monthlyOption) {
        case 'fifteen':
          paymentDate = calendarDateToUtcNoon(year, month, 15);
          break;
        case 'last':
          // Day 0 of next month = last day of current month
          paymentDate = calendarDateToUtcNoon(year, month + 1, 0);
          break;
        case 'first':
        default:
          paymentDate = calendarDateToUtcNoon(year, month, 1);
      }

      if (paymentDate >= paymentStartDate && paymentDate >= rangeStart && paymentDate <= rangeEnd) {
        dates.push(paymentDate);
      }

      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
  }

  return dates.sort((a, b) => a.getTime() - b.getTime());
}

export function resolveDueDateForBillingPeriod(
  paymentConfig: PaymentConfig | null | undefined,
  billingPeriodStart: number,
  billingPeriodEnd: number
): Date | null {
  const rangeStart = toUtcNoon(new Date(billingPeriodStart * 1000));
  const rangeEnd = toUtcNoon(new Date(billingPeriodEnd * 1000));
  const candidates = calculatePaymentDueDatesInRange(paymentConfig, rangeStart, rangeEnd);

  if (candidates.length > 0) {
    return candidates[0];
  }

  return rangeStart;
}

async function findExistingPayment(
  db: admin.firestore.Firestore,
  userEmail: string,
  classSessionId: string,
  dueDate: Date
): Promise<string | null> {
  // Match any timestamp on the same UTC civil day (legacy UTC-midnight + noon UTC)
  const snapshot = await db.collection('payments')
    .where('userId', '==', userEmail)
    .where('classSessionId', '==', classSessionId)
    .where('dueDate', '>=', Timestamp.fromDate(startOfUtcDay(dueDate)))
    .where('dueDate', '<=', Timestamp.fromDate(endOfUtcDay(dueDate)))
    .limit(1)
    .get();

  if (!snapshot.empty) {
    return snapshot.docs[0].id;
  }
  return null;
}

export async function registerPaymentFromStripeData(
  request: RegisterPaymentRequest
): Promise<{ paymentId: string; created: boolean }> {
  const { userEmail, classId, dueDate, amount, currency, stripeReference, billingPeriodStart, billingPeriodEnd } = request;

  if (!userEmail || !classId) {
    throw new Error('userEmail and classId are required');
  }

  const baseClassId = getBaseClassId(classId);
  const db = admin.firestore();

  const classDoc = await db.collection('classes').doc(baseClassId).get();
  if (!classDoc.exists) {
    throw new Error(`Class not found: ${baseClassId}`);
  }

  const classData = classDoc.data()!;
  const paymentConfig = classData.paymentConfig as PaymentConfig | undefined;

  if (!paymentConfig) {
    throw new Error(`Class ${baseClassId} has no payment configuration`);
  }

  let resolvedDueDate: Date;
  if (dueDate) {
    resolvedDueDate = parseDueDateString(dueDate);
  } else if (billingPeriodStart != null && billingPeriodEnd != null) {
    const resolved = resolveDueDateForBillingPeriod(paymentConfig, billingPeriodStart, billingPeriodEnd);
    if (!resolved) {
      throw new Error('Could not resolve due date for billing period');
    }
    resolvedDueDate = resolved;
  } else {
    throw new Error('dueDate or billing period is required');
  }

  const usersSnapshot = await db.collection('users')
    .where('email', '==', userEmail)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    throw new Error(`User not found: ${userEmail}`);
  }

  const userData = usersSnapshot.docs[0].data();
  const teacherId = userData.teacher as string | undefined;
  if (!teacherId) {
    throw new Error(`No teacher assigned for user: ${userEmail}`);
  }

  const existingId = await findExistingPayment(db, userEmail, baseClassId, resolvedDueDate);
  if (existingId) {
    logger.info('Payment already registered', { paymentId: existingId, stripeReference });
    return { paymentId: existingId, created: false };
  }

  const dueDateUtcNoon = toUtcNoon(resolvedDueDate);
  const resolvedAmount = amount ?? paymentConfig.amount ?? 0;
  const resolvedCurrency = currency ?? paymentConfig.currency ?? 'USD';
  const monthKey = `${dueDateUtcNoon.getUTCFullYear()}-${String(dueDateUtcNoon.getUTCMonth() + 1).padStart(2, '0')}`;
  const now = Timestamp.now();

  const paymentData = {
    userId: userEmail,
    classSessionId: baseClassId,
    teacherId,
    month: monthKey,
    amount: resolvedAmount,
    currency: resolvedCurrency,
    status: 'completed' as const,
    completedAt: now,
    dueDate: Timestamp.fromDate(dueDateUtcNoon),
    createdAt: now,
    updatedAt: now,
    ...(stripeReference ? { stripeReference } : {}),
  };

  const docRef = await db.collection('payments').add(paymentData);
  logger.info('Registered payment from Stripe', {
    paymentId: docRef.id,
    userEmail,
    classId: baseClassId,
    dueDate: dueDate ?? resolvedDueDate.toISOString(),
    stripeReference,
  });

  return { paymentId: docRef.id, created: true };
}
