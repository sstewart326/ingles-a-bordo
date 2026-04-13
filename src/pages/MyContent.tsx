import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { Language } from '../contexts/LanguageContext';
import { useTranslation } from '../translations';
import { useAuthWithMasquerade } from '../hooks/useAuthWithMasquerade';
import { styles, classNames } from '../styles/styleUtils';
import { getContentLibraryPageForStudent, getYouTubeThumbnailUrl } from '../utils/contentLibraryUtils';
import { getCachedCollection } from '../utils/firebaseUtils';
import { where } from 'firebase/firestore';
import { ContentLibraryItem, User } from '../types/interfaces';
import toast from 'react-hot-toast';
import {
  FilmIcon,
  DocumentTextIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import { ContentLibraryViewButton } from '../components/ContentLibraryViewButton';
import ContentLibraryCommentsSection from '../components/ContentLibraryComments';
import type { DocumentSnapshot } from 'firebase/firestore';

const PAGE_SIZE = 12;

export default function MyContent() {
  const { language } = useLanguage();
  const t = useTranslation(language);
  const { currentUser } = useAuthWithMasquerade();

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [teacherResolved, setTeacherResolved] = useState(false);
  const [userData, setUserData] = useState<User | null>(null);
  const [teacherUser, setTeacherUser] = useState<User | null>(null);
  const [items, setItems] = useState<ContentLibraryItem[]>([]);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchFirstPage = useCallback(async () => {
    if (!currentUser?.uid || !teacherId || !userData?.id) return;
    setLoading(true);
    try {
      const result = await getContentLibraryPageForStudent(teacherId, userData.id, PAGE_SIZE, null);
      setItems(result.items);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
    } catch (e) {
      toast.error(t.failedToLoad || 'Failed to load content');
      setItems([]);
      setLastDoc(null);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.uid, teacherId, userData?.id, t.failedToLoad]);

  const fetchMore = useCallback(async () => {
    if (!currentUser?.uid || !teacherId || !lastDoc || loadingMore || !userData?.id) return;
    setLoadingMore(true);
    try {
      const result = await getContentLibraryPageForStudent(teacherId, userData.id, PAGE_SIZE, lastDoc);
      setItems((prev) => [...prev, ...result.items]);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
    } catch (e) {
      toast.error(t.failedToLoad || 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }, [currentUser?.uid, teacherId, lastDoc, loadingMore, userData?.id, t.failedToLoad]);

  useEffect(() => {
    let cancelled = false;
    const resolveTeacher = async () => {
      if (!currentUser?.uid) {
        setTeacherResolved(true);
        setTeacherId(null);
        setLoading(false);
        return;
      }
      try {
        const users = await getCachedCollection<User>('users', [where('uid', '==', currentUser.uid)], { userId: currentUser.uid });
        const data = users?.[0] ?? null;
        if (!cancelled) {
          setUserData(data);
          setTeacherId(data?.teacher ?? null);
          setTeacherResolved(true);
        }
      } catch (e) {
        if (!cancelled) {
          setTeacherId(null);
          setTeacherResolved(true);
        }
      }
    };
    resolveTeacher();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.uid]);

  useEffect(() => {
    if (teacherResolved && teacherId) {
      fetchFirstPage();
    } else if (teacherResolved && !teacherId) {
      setLoading(false);
    }
  }, [teacherResolved, teacherId, fetchFirstPage]);

  useEffect(() => {
    let cancelled = false;
    if (!teacherId) {
      setTeacherUser(null);
      return;
    }
    getCachedCollection<User>('users', [where('uid', '==', teacherId)], { userId: teacherId })
      .then((users) => {
        if (!cancelled) setTeacherUser(users?.[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setTeacherUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [teacherId]);

  return (
    <div className="flex-1 min-h-0">
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className={classNames(styles.headings.h1)}>{t.myContentTitle}</h1>
          <p className="mt-1 text-sm text-gray-600">{t.myContentIntro}</p>
        </div>

        {loading ? (
          <p className="text-gray-600 py-8">{t.loading}</p>
        ) : !teacherResolved ? null : !teacherId ? (
          <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-[var(--brand-color-light)] to-white py-12 px-6 text-center shadow-sm">
            <p className="text-lg font-medium text-gray-700 mb-2">{t.myContentEmpty}</p>
            <p className="text-gray-600">{t.myContentEmptyDesc}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-[var(--brand-color-light)] to-white py-12 px-6 text-center shadow-sm">
            <p className="text-lg font-medium text-gray-700 mb-2">{t.myContentEmpty}</p>
            <p className="text-gray-600">{t.myContentEmptyDesc}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <StudentContentCard
                  key={item.id}
                  item={item}
                  t={t}
                  language={language}
                  getYouTubeThumbnailUrl={getYouTubeThumbnailUrl}
                  contentLibraryAuthors={{
                    ...(currentUser?.uid
                      ? {
                          [currentUser.uid]: {
                            name: userData?.name ?? currentUser?.email ?? '',
                            profilePictureUrl: userData?.profilePictureUrl ?? null,
                          },
                        }
                      : {}),
                    ...(teacherId && teacherUser
                      ? {
                          [teacherId]: {
                            name: teacherUser.name || teacherUser.email || 'Teacher',
                            profilePictureUrl: teacherUser.profilePictureUrl ?? null,
                          },
                        }
                      : {}),
                  }}
                  currentUserId={currentUser?.uid ?? ''}
                  currentUserName={userData?.name ?? currentUser?.email ?? ''}
                  isTeacher={false}
                />
              ))}
            </div>
            {hasMore && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={fetchMore}
                  disabled={loadingMore}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--header-bg)] text-white hover:bg-[var(--header-hover)] disabled:opacity-50 transition-colors shadow-sm"
                >
                  {loadingMore ? t.loading : t.loadMore}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StudentContentCard({
  item,
  t,
  language,
  getYouTubeThumbnailUrl,
  contentLibraryAuthors,
  currentUserId,
  currentUserName,
  isTeacher,
}: {
  item: ContentLibraryItem;
  t: ReturnType<typeof useTranslation>;
  language: Language;
  getYouTubeThumbnailUrl: (id: string) => string;
  contentLibraryAuthors: Record<string, { name: string; profilePictureUrl?: string | null }>;
  currentUserId: string;
  currentUserName: string;
  isTeacher: boolean;
}) {
  const typeLabel =
    item.type === 'youtube'
      ? t.typeVideo
      : item.type === 'text'
        ? t.typeText
        : t.typeImage;

  return (
    <div className="relative rounded-xl overflow-hidden bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-[var(--brand-color-medium)] transition-all duration-200 flex flex-col">
      <div
        className={`aspect-video flex items-center justify-center overflow-hidden ${
          item.type === 'text'
            ? 'bg-gradient-to-br from-[var(--brand-color-light)] to-gray-100'
            : 'bg-gray-100'
        }`}
      >
        {item.type === 'youtube' && item.videoId && (
          <img
            src={getYouTubeThumbnailUrl(item.videoId)}
            alt=""
            className="w-full h-full object-cover"
          />
        )}
        {item.type === 'image' && item.imageUrl && (
          <img
            src={item.imageUrl}
            alt=""
            className="w-full h-full object-contain"
          />
        )}
        {item.type === 'text' && (
          <DocumentTextIcon className="h-20 w-20 text-[var(--header-bg)]" />
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col min-h-0">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
          {item.type === 'youtube' && <FilmIcon className="h-3.5 w-3.5" />}
          {item.type === 'text' && <DocumentTextIcon className="h-3.5 w-3.5" />}
          {item.type === 'image' && <PhotoIcon className="h-3.5 w-3.5" />}
          {typeLabel}
        </span>
        <h3 className="font-medium text-gray-900 mt-0.5 line-clamp-2">{item.title}</h3>
        {item.description && (
          <p className="text-sm text-gray-600 mt-1 line-clamp-2 flex-1">{item.description}</p>
        )}
        <div className="mt-3 flex gap-2">
          <ContentLibraryViewButton item={item} language={language} />
        </div>
        <ContentLibraryCommentsSection
          itemId={item.id}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          isTeacher={isTeacher}
          authors={contentLibraryAuthors}
        />
      </div>
    </div>
  );
}
