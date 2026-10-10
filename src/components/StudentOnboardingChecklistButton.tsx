import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  ClipboardDocumentListIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import Modal from './Modal';
import { Tooltip } from './Tooltip';
import { styles } from '../styles/styleUtils';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { OnboardingChecklistVersion, User } from '../types/interfaces';
import {
  getChecklistVersion,
  getLatestChecklist,
  getStudentProgress,
  saveStudentProgress,
} from '../services/onboardingChecklistService';

interface StudentOnboardingChecklistButtonProps {
  teacherId: string;
  student: User;
  /** Match desktop table hover labels vs mobile Tooltip. */
  tooltipStyle?: 'tooltip' | 'inline';
}

export function StudentOnboardingChecklistButton({
  teacherId,
  student,
  tooltipStyle = 'tooltip',
}: StudentOnboardingChecklistButtonProps) {
  const { language } = useLanguage();
  const t = useTranslation(language);

  const [isOpen, setIsOpen] = useState(false);
  const [version, setVersion] = useState<OnboardingChecklistVersion | null>(null);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [draftCheckedIds, setDraftCheckedIds] = useState<string[]>([]);
  const [latest, setLatest] = useState<{
    versionNumber: number;
    version: OnboardingChecklistVersion;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [noTemplate, setNoTemplate] = useState(false);

  const openModal = async () => {
    setIsOpen(true);
    setLoading(true);
    setNoTemplate(false);
    setVersion(null);
    setDraftVersion(null);
    setDraftCheckedIds([]);
    setLatest(null);
    try {
      const latestChecklist = await getLatestChecklist(teacherId);
      if (!latestChecklist) {
        setNoTemplate(true);
        return;
      }
      setLatest({
        versionNumber: latestChecklist.meta.latestVersion,
        version: latestChecklist.version,
      });

      const progress = await getStudentProgress(teacherId, student.id);
      if (progress) {
        const pinned =
          (await getChecklistVersion(teacherId, progress.checklistVersion)) ||
          latestChecklist.version;
        setVersion(pinned);
        setDraftVersion(progress.checklistVersion);
        setDraftCheckedIds([...progress.checkedItemIds]);
      } else {
        setVersion(latestChecklist.version);
        setDraftVersion(latestChecklist.meta.latestVersion);
        setDraftCheckedIds([]);
      }
    } catch (error) {
      console.error('Error loading student onboarding checklist:', error);
      toast.error(t.failedToLoadChecklist);
      setIsOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (itemId: string, checked: boolean) => {
    setDraftCheckedIds((prev) => {
      if (checked) {
        return prev.includes(itemId) ? prev : [...prev, itemId];
      }
      return prev.filter((id) => id !== itemId);
    });
  };

  const handleUseLatest = () => {
    if (!latest) return;
    const validIds = new Set(latest.version.items.map((item) => item.id));
    setDraftCheckedIds((prev) => prev.filter((id) => validIds.has(id)));
    setVersion(latest.version);
    setDraftVersion(latest.versionNumber);
  };

  const handleSave = async () => {
    if (draftVersion == null) return;
    setSaving(true);
    try {
      await saveStudentProgress(
        teacherId,
        student.id,
        student.email,
        draftVersion,
        draftCheckedIds
      );
      toast.success(t.checklistSaved);
      setIsOpen(false);
    } catch (error) {
      console.error('Error saving student checklist:', error);
      toast.error(t.failedToSaveChecklist);
    } finally {
      setSaving(false);
    }
  };

  const progressLabel = version
    ? t.checklistProgress
        .replace(
          '{checked}',
          String(
            draftCheckedIds.filter((id) =>
              version.items.some((item) => item.id === id)
            ).length
          )
        )
        .replace('{total}', String(version.items.length))
    : '';

  const triggerButton = (
    <button
      type="button"
      onClick={openModal}
      className="p-1.5 text-indigo-600 hover:text-indigo-800 rounded-full hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 relative group/button"
    >
      <ClipboardDocumentListIcon className="h-4 w-4" />
      <span className="sr-only">{t.studentOnboardingChecklist}</span>
      {tooltipStyle === 'inline' && (
        <span className="absolute bottom-full left-0 mb-1 px-3 py-2 w-40 bg-gray-800 text-white text-sm rounded-md shadow-lg opacity-0 invisible group-hover/button:opacity-100 group-hover/button:visible transition-all duration-200 z-[100] pointer-events-none whitespace-nowrap">
          {t.studentOnboardingChecklist}
          <span className="absolute w-2 h-2 bg-gray-800 transform rotate-45 left-4 -bottom-1" />
        </span>
      )}
    </button>
  );

  return (
    <>
      <div className="relative">
        {tooltipStyle === 'tooltip' ? (
          <Tooltip text={t.studentOnboardingChecklist} width="w-40">
            {triggerButton}
          </Tooltip>
        ) : (
          triggerButton
        )}
      </div>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <div className="w-[28rem] max-w-[calc(100vw-2rem)]">
          <div className="flex justify-between items-start mb-4 gap-2">
            <div>
              <h2 className={styles.headings.h2}>{t.studentOnboardingChecklist}</h2>
              <p className="text-sm text-gray-600 mt-1">{student.name}</p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              {version && (
                <span className="text-sm text-gray-500 whitespace-nowrap">{progressLabel}</span>
              )}
              {latest != null &&
                draftVersion != null &&
                draftVersion < latest.versionNumber && (
                  <button
                    type="button"
                    onClick={handleUseLatest}
                    className="relative group/useLatest inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    {t.useLatestOnboardingChecklist}
                    <InformationCircleIcon className="h-4 w-4 text-indigo-400 group-hover/useLatest:text-indigo-600" />
                    <span className="absolute top-full right-0 mt-1.5 px-3 py-2 w-64 max-w-[calc(100vw-4rem)] bg-gray-800 text-white text-xs font-normal rounded-md shadow-lg opacity-0 invisible group-hover/useLatest:opacity-100 group-hover/useLatest:visible transition-all duration-200 z-[110] pointer-events-none text-left whitespace-normal">
                      {t.useLatestOnboardingChecklistInfo}
                      <span className="absolute w-2 h-2 bg-gray-800 transform rotate-45 right-3 -top-1" />
                    </span>
                  </button>
                )}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-6 text-gray-500">{t.loading}</div>
          ) : noTemplate ? (
            <p className="text-sm text-gray-600">{t.noChecklistCreatedYet}</p>
          ) : (
            <div className="space-y-4">
              <ul className="space-y-2">
                {(version?.items || []).map((item) => {
                  const checked = draftCheckedIds.includes(item.id);
                  return (
                    <li key={item.id}>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => handleToggle(item.id, e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span
                          className={`text-sm ${
                            checked ? 'text-gray-500 line-through' : 'text-gray-900'
                          }`}
                        >
                          {item.label}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className={`${styles.buttons.primary} flex-1`}
                >
                  {saving ? t.saving : t.save}
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
