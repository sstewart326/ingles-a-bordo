import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { formatLocalizedDate } from '../utils/dateUtils';
import { PaymentUrgency, UrgentPayment } from '../utils/paymentUtils';

interface PaymentDueBannerProps {
  urgentPayments: UrgentPayment[];
  onJumpToDate: (date: Date) => void;
}

function formatAmount(amount: number, currency?: string, locale?: string): string {
  const symbol =
    currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'BRL' ? 'R$' : '$';
  return `${symbol}${amount.toLocaleString(locale === 'pt-BR' ? 'pt-BR' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getHeadline(
  urgency: PaymentUrgency,
  daysUntil: number,
  t: ReturnType<typeof useTranslation>
): string {
  if (urgency === 'overdue') return t.paymentDueBannerOverdue;
  if (urgency === 'dueToday') return t.paymentDueBannerDueToday;
  return t.paymentDueBannerDueSoon.replace('{days}', String(Math.max(daysUntil, 1)));
}

function getBannerStyles(urgency: PaymentUrgency): {
  container: string;
  icon: string;
  headline: string;
  role: 'alert' | 'status';
} {
  const isCritical = urgency === 'overdue' || urgency === 'dueToday';
  if (isCritical) {
    return {
      container:
        'mt-4 mb-2 rounded-lg border border-red-200/80 bg-red-50/90 px-4 py-3 ring-1 ring-inset ring-red-100/80',
      icon: 'bg-red-100 text-red-600',
      headline: 'text-red-800',
      role: 'alert',
    };
  }
  return {
    container:
      'mt-4 mb-2 rounded-lg border border-amber-200/80 bg-amber-50/90 px-4 py-3 ring-1 ring-inset ring-amber-100/80',
    icon: 'bg-amber-100 text-amber-600',
    headline: 'text-amber-900',
    role: 'status',
  };
}

function PaymentDueBannerItem({
  payment,
  onJumpToDate,
}: {
  payment: UrgentPayment;
  onJumpToDate: (date: Date) => void;
}) {
  const { language } = useLanguage();
  const t = useTranslation(language);
  const styles = getBannerStyles(payment.urgency);
  const headline = getHeadline(payment.urgency, payment.daysUntil, t);
  const formattedDate = formatLocalizedDate(payment.dueDate, language);

  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${styles.container}`}>
      <div className="flex items-start gap-3 min-w-0">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${styles.icon}`}
          aria-hidden
        >
          <ExclamationTriangleIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className={`text-base sm:text-lg font-semibold leading-snug ${styles.headline}`}>
            {headline}
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            {formattedDate}
            {payment.amount != null && (
              <span className="ml-2 font-medium text-slate-800">
                · {formatAmount(payment.amount, payment.currency, language)}
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pl-2">
        {payment.paymentLink && (
          <a
            href={payment.paymentLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            {t.paymentDueBannerPayNow}
          </a>
        )}
        <button
          type="button"
          onClick={() => onJumpToDate(payment.dueDate)}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          {t.paymentDueBannerViewDetails}
        </button>
      </div>
    </div>
  );
}

/**
 * Surfaces urgent unpaid payments above the schedule calendar so students
 * don't have to discover payment dots on a specific date.
 */
export function PaymentDueBanner({ urgentPayments, onJumpToDate }: PaymentDueBannerProps) {
  if (urgentPayments.length === 0) {
    return null;
  }

  const topUrgency = urgentPayments[0].urgency;
  const role = topUrgency === 'overdue' || topUrgency === 'dueToday' ? 'alert' : 'status';

  return (
    <div className="space-y-2" role={role}>
      {urgentPayments.map(payment => (
        <PaymentDueBannerItem
          key={`${payment.classSessionId}-${payment.dueDate.toISOString()}`}
          payment={payment}
          onJumpToDate={onJumpToDate}
        />
      ))}
    </div>
  );
}
