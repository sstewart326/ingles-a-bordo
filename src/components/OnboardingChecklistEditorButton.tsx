import { useState } from 'react';
import toast from 'react-hot-toast';
import { ClipboardDocumentListIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import Modal from './Modal';
import { styles } from '../styles/styleUtils';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { OnboardingChecklistItem } from '../types/interfaces';
import {
  getLatestChecklist,
  newChecklistItem,
  saveChecklistVersion,
} from '../services/onboardingChecklistService';

interface OnboardingChecklistEditorButtonProps {
  teacherId: string;
  teacherEmail?: string | null;
}

export function OnboardingChecklistEditorButton({
  teacherId,
  teacherEmail,
}: OnboardingChecklistEditorButtonProps) {
  const { language } = useLanguage();
  const t = useTranslation(language);

  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<OnboardingChecklistItem[]>([]);
  const [latestVersion, setLatestVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const openEditor = async () => {
    setIsOpen(true);
    setLoading(true);
    try {
      const latest = await getLatestChecklist(teacherId);
      if (latest) {
        setItems(latest.version.items.map((item) => ({ ...item })));
        setLatestVersion(latest.meta.latestVersion);
      } else {
        setItems([newChecklistItem()]);
        setLatestVersion(null);
      }
    } catch (error) {
      console.error('Error loading onboarding checklist:', error);
      toast.error(t.failedToLoadChecklist);
      setItems([newChecklistItem()]);
      setLatestVersion(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const cleaned = items
      .map((item) => ({ ...item, label: item.label.trim() }))
      .filter((item) => item.label.length > 0);
    if (cleaned.length === 0) {
      toast.error(t.onboardingChecklistEmptyDesc);
      return;
    }
    setSaving(true);
    try {
      const version = await saveChecklistVersion(
        teacherId,
        cleaned,
        teacherEmail || teacherId
      );
      setLatestVersion(version);
      setItems(cleaned);
      toast.success(t.checklistSaved);
      setIsOpen(false);
    } catch (error) {
      console.error('Error saving onboarding checklist:', error);
      toast.error(t.failedToSaveChecklist);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        className="bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-800 px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 flex items-center gap-2"
      >
        <ClipboardDocumentListIcon className="h-4 w-4" />
        {t.onboardingChecklist}
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <div className="w-[28rem] max-w-[calc(100vw-2rem)]">
          <div className="flex justify-between items-center mb-4">
            <h2 className={styles.headings.h2}>{t.editOnboardingChecklist}</h2>
          </div>
          {latestVersion != null && (
            <p className="text-xs text-gray-500 mb-3">v{latestVersion}</p>
          )}
          {loading ? (
            <div className="text-center py-6 text-gray-500">{t.loading}</div>
          ) : (
            <div className="space-y-3">
              {items.length === 0 && (
                <div className="text-sm text-gray-600">
                  <p className="font-medium">{t.onboardingChecklistEmpty}</p>
                  <p className="text-xs text-gray-500 mt-1">{t.onboardingChecklistEmptyDesc}</p>
                </div>
              )}
              {items.map((item, index) => (
                <div key={item.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={item.label}
                    onChange={(e) => {
                      const value = e.target.value;
                      setItems((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, label: value } : row))
                      );
                    }}
                    placeholder={t.onboardingChecklistItemPlaceholder}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                    className="p-1.5 text-red-600 hover:text-red-800 rounded shrink-0"
                    aria-label={t.delete}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, newChecklistItem()])}
                className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
              >
                <PlusIcon className="h-4 w-4" />
                {t.addChecklistItem}
              </button>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className={`${styles.buttons.primary} flex-1`}
                >
                  {saving ? t.saving : t.saveChecklist}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
