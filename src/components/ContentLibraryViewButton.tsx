import { PlayIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { ContentLibraryItem } from '../types/interfaces';
import { useTranslation } from '../translations';
import { Language } from '../contexts/LanguageContext';

/**
 * Shared "View" button for content library items (videos and images).
 * Opens the video URL or image URL in a new tab. Renders nothing for text items.
 * Used by MyContent (student) and AdminContentLibrary (teacher) to avoid duplication.
 */
export function ContentLibraryViewButton({
  item,
  language,
}: {
  item: ContentLibraryItem;
  language: Language;
}) {
  const t = useTranslation(language);

  const canView =
    (item.type === 'youtube' && (item.videoId || item.videoUrl)) ||
    (item.type === 'image' && item.imageUrl);

  const handleView = () => {
    if (item.type === 'youtube') {
      const url = item.videoUrl ?? (item.videoId ? `https://www.youtube.com/watch?v=${item.videoId}` : null);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (item.type === 'image' && item.imageUrl) {
      window.open(item.imageUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (!canView) return null;

  return (
    <button
      type="button"
      onClick={handleView}
      className="mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--header-bg)] text-white hover:bg-[var(--header-hover)] transition-colors w-full"
    >
      {item.type === 'youtube' ? (
        <PlayIcon className="h-4 w-4" />
      ) : (
        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
      )}
      {t.myContentView}
    </button>
  );
}
