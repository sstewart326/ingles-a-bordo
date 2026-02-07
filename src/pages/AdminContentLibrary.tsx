import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { Language } from '../contexts/LanguageContext';
import { useTranslation } from '../translations';
import { useAuthWithMasquerade } from '../hooks/useAuthWithMasquerade';
import { styles, classNames } from '../styles/styleUtils';
import {
  getContentLibraryPage,
  createContentLibraryItem,
  updateContentLibraryItem,
  deleteContentLibraryItem,
  parseYouTubeVideoId,
  getYouTubeThumbnailUrl,
  uploadContentLibraryImage,
} from '../utils/contentLibraryUtils';
import { ContentLibraryItem, ContentLibraryItemType, User } from '../types/interfaces';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  FilmIcon,
  DocumentTextIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import { ContentLibraryViewButton } from '../components/ContentLibraryViewButton';
import type { DocumentSnapshot } from 'firebase/firestore';

const PAGE_SIZE = 12;

export default function AdminContentLibrary() {
  const { language } = useLanguage();
  const t = useTranslation(language);
  const { currentUser } = useAuthWithMasquerade();

  const [items, setItems] = useState<ContentLibraryItem[]>([]);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [students, setStudents] = useState<User[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentLibraryItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [formType, setFormType] = useState<ContentLibraryItemType>('youtube');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStudentIds, setFormStudentIds] = useState<string[]>([]);
  const [formAllStudents, setFormAllStudents] = useState(true);
  const [formVideoUrl, setFormVideoUrl] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formImageFile, setFormImageFile] = useState<File | null>(null);
  const [formImagePreviewUrl, setFormImagePreviewUrl] = useState<string | null>(null);

  const fetchFirstPage = useCallback(async () => {
    if (!currentUser?.uid) return;
    setLoading(true);
    try {
      const result = await getContentLibraryPage(currentUser.uid, PAGE_SIZE, null);
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
  }, [currentUser?.uid, t.failedToLoad]);

  const fetchMore = useCallback(async () => {
    if (!currentUser?.uid || !lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await getContentLibraryPage(currentUser.uid, PAGE_SIZE, lastDoc);
      setItems((prev) => [...prev, ...result.items]);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
    } catch (e) {
      toast.error(t.failedToLoad || 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }, [currentUser?.uid, lastDoc, loadingMore, t.failedToLoad]);

  const fetchStudents = useCallback(async () => {
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const list: User[] = [];
      snapshot.forEach((doc) => {
        const d = doc.data();
        if (!d.isAdmin) {
          list.push({
            id: doc.id,
            uid: d.uid,
            email: d.email,
            name: d.name,
            isAdmin: d.isAdmin,
            createdAt: d.createdAt,
          } as User);
        }
      });
      setStudents(list);
    } catch (e) {
      console.error('Failed to fetch students', e);
    }
  }, []);

  useEffect(() => {
    fetchFirstPage();
  }, [fetchFirstPage]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const openAddModal = () => {
    setEditingItem(null);
    setFormType('youtube');
    setFormTitle('');
    setFormDescription('');
    setFormStudentIds([]);
    setFormAllStudents(true);
    setFormVideoUrl('');
    setFormBody('');
    setFormImageFile(null);
    setFormImagePreviewUrl(null);
    setModalOpen(true);
  };

  const openEditModal = (item: ContentLibraryItem) => {
    setEditingItem(item);
    setFormType(item.type);
    setFormTitle(item.title);
    setFormDescription(item.description ?? '');
    setFormStudentIds(item.studentIds ?? []);
    setFormAllStudents((item.studentIds ?? []).length === 0);
    setFormVideoUrl(item.videoUrl ?? '');
    setFormBody(item.body ?? '');
    setFormImageFile(null);
    setFormImagePreviewUrl(item.imageUrl ?? null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingItem(null);
    setFormImagePreviewUrl(null);
    if (formImageFile) setFormImageFile(null);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormImageFile(file);
      setFormImagePreviewUrl(URL.createObjectURL(file));
    }
  };

  const getEffectiveStudentIds = (): string[] =>
    formAllStudents ? [] : formStudentIds;

  const validateForm = (): boolean => {
    if (!formTitle.trim()) {
      toast.error(t.titleLabel + ' is required');
      return false;
    }
    if (formType === 'youtube') {
      const id = parseYouTubeVideoId(formVideoUrl);
      if (!id) {
        toast.error('Please enter a valid YouTube URL');
        return false;
      }
    }
    if (formType === 'text' && !formBody.trim()) {
      toast.error('Please enter some text');
      return false;
    }
    if (formType === 'image') {
      if (!editingItem && !formImageFile) {
        toast.error('Please select an image');
        return false;
      }
    }
    return true;
  };

  const handleSave = async () => {
    if (!currentUser?.uid || !validateForm()) return;
    setSaving(true);
    try {
      const studentIds = getEffectiveStudentIds();
      if (editingItem) {
        const updates: Partial<ContentLibraryItem> = {
          type: formType,
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          studentIds,
        };
        if (formType === 'youtube') {
          const videoId = parseYouTubeVideoId(formVideoUrl);
          updates.videoId = videoId ?? undefined;
          updates.videoUrl = formVideoUrl.trim() || undefined;
        }
        if (formType === 'text') updates.body = formBody.trim();
        if (formType === 'image' && formImageFile) {
          const result = await uploadContentLibraryImage(formImageFile, currentUser.uid);
          updates.imageUrl = result.imageUrl;
          updates.imagePath = result.imagePath;
        }
        await updateContentLibraryItem(editingItem.id, currentUser.uid, updates);
        toast.success(t.success || 'Saved');
      } else {
        let imageUrl: string | undefined;
        let imagePath: string | undefined;
        if (formType === 'image') {
          if (formImageFile) {
            const result = await uploadContentLibraryImage(formImageFile, currentUser.uid);
            imageUrl = result.imageUrl;
            imagePath = result.imagePath;
          } else {
            toast.error('Please select an image');
            setSaving(false);
            return;
          }
        }
        const item: Omit<ContentLibraryItem, 'id' | 'createdAt' | 'updatedAt'> = {
          teacherId: currentUser.uid,
          type: formType,
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          studentIds,
          ...(formType === 'youtube' && {
            videoId: parseYouTubeVideoId(formVideoUrl) ?? undefined,
            videoUrl: formVideoUrl.trim() || undefined,
          }),
          ...(formType === 'text' && { body: formBody.trim() }),
          ...(formType === 'image' && { imageUrl, imagePath }),
        };
        await createContentLibraryItem(currentUser.uid, item);
        toast.success(t.success || 'Created');
      }
      closeModal();
      fetchFirstPage();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error || 'Error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!currentUser?.uid) return;
    try {
      await deleteContentLibraryItem(itemId, currentUser.uid);
      setDeleteConfirmId(null);
      toast.success(t.success || 'Deleted');
      fetchFirstPage();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error || 'Error');
    }
  };

  const typeBadgeLabel =
    formType === 'youtube'
      ? t.typeVideo
      : formType === 'text'
        ? t.typeText
        : t.typeImage;

  const videoIdPreview = parseYouTubeVideoId(formVideoUrl);

  return (
    <div className="flex-1">
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className={classNames(styles.headings.h1)}>{t.contentLibraryTitle}</h1>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white bg-[var(--header-bg)] hover:bg-[var(--header-hover)]"
          >
            <PlusIcon className="h-5 w-5" />
            {t.addContent}
          </button>
        </div>

        {loading ? (
          <p className="text-gray-600 py-8">{t.loading}</p>
        ) : items.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-lg font-medium text-gray-700 mb-2">{t.contentLibraryEmpty}</p>
            <p className="text-gray-600">{t.contentLibraryEmptyDesc}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <ContentCard
                  key={item.id}
                  item={item}
                  t={t}
                  language={language}
                  onEdit={() => openEditModal(item)}
                  onDelete={() => setDeleteConfirmId(item.id)}
                  getYouTubeThumbnailUrl={getYouTubeThumbnailUrl}
                />
              ))}
            </div>
            {hasMore && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={fetchMore}
                  disabled={loadingMore}
                  className="px-4 py-2 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                >
                  {loadingMore ? t.loading : t.loadMore}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={closeModal}>
        <h2 className="text-xl font-semibold mb-4">
          {editingItem ? t.edit : t.add} {typeBadgeLabel}
        </h2>

        {/* Type selector */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {(['youtube', 'text', 'image'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFormType(type)}
              className={classNames(
                'inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium',
                formType === type
                  ? 'bg-[var(--header-bg)] text-white hover:bg-[var(--header-hover)]'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              {type === 'youtube' && <FilmIcon className="h-4 w-4" />}
              {type === 'text' && <DocumentTextIcon className="h-4 w-4" />}
              {type === 'image' && <PhotoIcon className="h-4 w-4" />}
              {type === 'youtube'
                ? t.typeVideo
                : type === 'text'
                  ? t.typeText
                  : t.typeImage}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.titleLabel} *
            </label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder={t.titleLabel}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.descriptionLabel}
            </label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder={t.descriptionLabel}
            />
          </div>

          {/* Audience */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t.audienceLabel}
            </label>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={formAllStudents}
                onChange={(e) => {
                  setFormAllStudents(e.target.checked);
                  if (e.target.checked) setFormStudentIds([]);
                }}
              />
              <span>{t.allStudents}</span>
            </label>
            {!formAllStudents && (
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 space-y-1">
                {students.map((s) => (
                  <label key={s.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formStudentIds.includes(s.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormStudentIds((prev) => [...prev, s.id]);
                        } else {
                          setFormStudentIds((prev) => prev.filter((id) => id !== s.id));
                        }
                      }}
                    />
                    <span className="text-sm">{s.name || s.email}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {formType === 'youtube' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                YouTube URL *
              </label>
              <input
                type="url"
                value={formVideoUrl}
                onChange={(e) => setFormVideoUrl(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder={t.youtubeUrlPlaceholder}
              />
              {videoIdPreview && (
                <div className="mt-2">
                  <img
                    src={getYouTubeThumbnailUrl(videoIdPreview)}
                    alt=""
                    className="rounded w-full max-w-xs aspect-video object-cover"
                  />
                </div>
              )}
            </div>
          )}

          {formType === 'text' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.typeText} *
              </label>
              <textarea
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                rows={5}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder={t.typeText}
              />
            </div>
          )}

          {formType === 'image' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.typeImage} *
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[var(--brand-color-light)] file:text-[var(--header-bg)]"
              />
              {formImagePreviewUrl && (
                <img
                  src={formImagePreviewUrl}
                  alt=""
                  className="mt-2 rounded max-h-40 object-contain"
                />
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-6 justify-end">
          <button
            type="button"
            onClick={closeModal}
            className="px-4 py-2 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm font-medium text-white bg-[var(--header-bg)] hover:bg-[var(--header-hover)] disabled:opacity-50"
          >
            {saving ? t.saving : t.save}
          </button>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
      >
        <p className="text-gray-700 mb-4">{t.deleteContentConfirm}</p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => setDeleteConfirmId(null)}
            className="px-4 py-2 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700"
          >
            {t.delete}
          </button>
        </div>
      </Modal>
    </div>
  );
};

function ContentCard({
  item,
  t,
  language,
  onEdit,
  onDelete,
  getYouTubeThumbnailUrl,
}: {
  item: ContentLibraryItem;
  t: ReturnType<typeof useTranslation>;
  language: Language;
  onEdit: () => void;
  onDelete: () => void;
  getYouTubeThumbnailUrl: (id: string) => string;
}) {
  const typeLabel =
    item.type === 'youtube'
      ? t.typeVideo
      : item.type === 'text'
        ? t.typeText
        : t.typeImage;

  return (
    <div className="relative border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          type="button"
          onClick={onEdit}
          aria-label={t.edit}
          className="p-1.5 rounded-md bg-white/90 shadow-sm text-gray-600 hover:text-[var(--brand-color-dark)] hover:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-color)]"
        >
          <PencilIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={t.delete}
          className="p-1.5 rounded-md bg-white/90 shadow-sm text-gray-600 hover:text-red-600 hover:bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
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
      <div className="p-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {typeLabel}
        </span>
        <h3 className="font-medium text-gray-900 mt-0.5 line-clamp-2">{item.title}</h3>
        {item.description && (
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.description}</p>
        )}
        {item.type === 'text' && item.body != null && (
          <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap overflow-y-auto max-h-32 border border-gray-100 rounded-md bg-gray-50/50 px-2 py-2">
            {item.body}
          </div>
        )}
        <ContentLibraryViewButton item={item} language={language} />
      </div>
    </div>
  );
}
