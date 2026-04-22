import { SparklesIcon } from '@heroicons/react/24/solid';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { isBirthdayToday } from '../utils/birthdayUtils';

interface BirthdayScheduleBannerProps {
  birthdate: string | undefined;
  displayName: string;
}

/**
 * Stays visible on the schedule for the user’s local birthday (same date logic as
 * calendar birthday dots). Independent of the one-time confetti overlay.
 */
export function BirthdayScheduleBanner({
  birthdate,
  displayName
}: BirthdayScheduleBannerProps) {
  const { language } = useLanguage();
  const t = useTranslation(language);

  if (!isBirthdayToday(birthdate)) {
    return null;
  }

  const title =
    displayName.trim() !== ''
      ? t.happyBirthdayGreeting.replace('{name}', displayName)
      : t.happyBirthdayGeneric;

  return (
    <div
      className="mt-4 mb-2 flex items-center gap-3 rounded-lg border border-indigo-200/60 bg-indigo-50/80 px-4 py-3 ring-1 ring-inset ring-indigo-100/80"
      role="status"
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600"
        aria-hidden
      >
        <SparklesIcon className="h-5 w-5" />
      </span>
      <p className="text-base sm:text-lg font-semibold text-slate-800 leading-snug">
        <span className="mr-1.5 inline-block" aria-hidden>
          🎂
        </span>
        {title}
      </p>
    </div>
  );
}
