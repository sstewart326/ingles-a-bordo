import { getBaseClassId } from './scheduleUtils';

const PRODUCTION_PAYMENT_HOST = 'pay.inglesabordo.com';

function formatDueDate(dueDate: Date): string {
  const year = dueDate.getFullYear();
  const month = String(dueDate.getMonth() + 1).padStart(2, '0');
  const day = String(dueDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isPaymentCheckoutUrl(url: URL): boolean {
  if (url.hostname.includes(PRODUCTION_PAYMENT_HOST)) {
    return true;
  }
  // Local pay app (vite on :3000) during development
  if (
    import.meta.env.DEV &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
    url.pathname.startsWith('/checkout/')
  ) {
    return true;
  }
  return false;
}

export function buildPaymentLinkUrl(
  paymentLink: string,
  context: { userEmail: string; classId: string; dueDate: Date }
): string {
  try {
    const url = new URL(paymentLink);
    if (!isPaymentCheckoutUrl(url)) {
      return paymentLink;
    }

    url.searchParams.set('userEmail', context.userEmail);
    url.searchParams.set('classId', getBaseClassId(context.classId));
    url.searchParams.set('dueDate', formatDueDate(context.dueDate));
    return url.toString();
  } catch {
    return paymentLink;
  }
}
