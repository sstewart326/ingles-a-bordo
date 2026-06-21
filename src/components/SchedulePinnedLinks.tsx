import {
  LinkIcon,
  PlayIcon,
  DocumentTextIcon,
  DocumentIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { styles } from '../styles/styleUtils';
import { PinnedLink } from '../types/interfaces';
import {
  filterValidPinnedLinks,
  getPinnedLinkDisplayTitle,
  getPinnedLinkHostname,
  getPinnedLinkIconType,
  hasPinnedLinkCustomTitle,
  normalizePinnedLinkUrl,
  PinnedLinkIconType,
} from '../utils/pinnedLinkUtils';

interface SchedulePinnedLinksProps {
  links: PinnedLink[];
}

function PinnedLinkIcon({ type }: { type: PinnedLinkIconType }) {
  const className = 'h-5 w-5';

  switch (type) {
    case 'youtube':
      return <PlayIcon className={className} aria-hidden />;
    case 'google':
      return <DocumentTextIcon className={className} aria-hidden />;
    case 'pdf':
      return <DocumentIcon className={className} aria-hidden />;
    default:
      return <LinkIcon className={className} aria-hidden />;
  }
}

export function SchedulePinnedLinks({ links }: SchedulePinnedLinksProps) {
  const { language } = useLanguage();
  const t = useTranslation(language);

  const pinnedLinks = filterValidPinnedLinks(links);
  if (pinnedLinks.length === 0) return null;

  const useTwoColumns = pinnedLinks.length >= 3;

  return (
    <section
      className="mt-6 mb-4 bg-white rounded-lg shadow-sm border border-indigo-100/80 p-4 sm:p-5"
      aria-labelledby="schedule-pinned-links-heading"
    >
      <div className="flex items-center gap-2 mb-3">
        <h2 id="schedule-pinned-links-heading" className={styles.headings.h2}>
          {t.usefulLinksForYou}
        </h2>
      </div>

      <ul
        role="list"
        className={
          useTwoColumns
            ? 'grid grid-cols-1 sm:grid-cols-2 gap-1'
            : 'flex flex-col gap-1'
        }
      >
        {pinnedLinks.map((item, index) => {
          const href = normalizePinnedLinkUrl(item.url);
          const title = getPinnedLinkDisplayTitle(item);
          const showSubtitle = hasPinnedLinkCustomTitle(item);
          const subtitle = showSubtitle ? getPinnedLinkHostname(item.url) : null;
          const iconType = getPinnedLinkIconType(item.url);

          return (
            <li key={`${item.url}-${index}`}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${title} (${t.opensInNewTab})`}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-indigo-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-colors"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600"
                  aria-hidden
                >
                  <PinnedLinkIcon type={iconType} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-800 truncate">{title}</span>
                  {subtitle && (
                    <span className="block text-xs text-gray-500 truncate">{subtitle}</span>
                  )}
                </span>

                <ArrowTopRightOnSquareIcon
                  className="h-4 w-4 shrink-0 text-gray-400 group-hover:text-indigo-600 transition-colors"
                  aria-hidden
                />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
