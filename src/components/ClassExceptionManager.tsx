import React, { useState, useMemo } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { useAuth } from '../hooks/useAuth';
import { 
  createClassException, 
  moveMaterialsAndHomework 
} from '../utils/classExceptionUtils';
import { 
  generateTimeOptions, 
  calculateEndTime, 
  convert24HourTo12Hour 
} from '../utils/timeUtils';
import { XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import Modal from './Modal';
import { styles } from '../styles/styleUtils';
import toast from 'react-hot-toast';

interface ClassExceptionManagerProps {
  classId: string;
  classDate: Date;
  isAdmin: boolean;
  timezone: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
  onExceptionCreated?: () => void;
}

/**
 * ClassExceptionManager - Admin component for managing one-off class exceptions
 * Allows cancelling or rescheduling classes (past and future)
 */
export const ClassExceptionManager: React.FC<ClassExceptionManagerProps> = ({
  classId,
  classDate,
  isAdmin,
  timezone,
  defaultStartTime = '09:00',
  defaultEndTime = '10:00',
  onExceptionCreated
}) => {
  const { language } = useLanguage();
  const t = useTranslation(language);
  const { currentUser } = useAuth();

  // Generate time options once
  const timeOptions = useMemo(() => generateTimeOptions(), []);

  // Convert default times to 12-hour format if they're in 24-hour format
  const defaultStartTime12 = useMemo(() => {
    // Check if it's already in 12-hour format (contains AM/PM)
    if (defaultStartTime.includes('AM') || defaultStartTime.includes('PM')) {
      return defaultStartTime;
    }
    // Convert from 24-hour to 12-hour format
    return convert24HourTo12Hour(defaultStartTime);
  }, [defaultStartTime]);

  const defaultEndTime12 = useMemo(() => {
    // Check if it's already in 12-hour format (contains AM/PM)
    if (defaultEndTime.includes('AM') || defaultEndTime.includes('PM')) {
      return defaultEndTime;
    }
    // Convert from 24-hour to 12-hour format
    return convert24HourTo12Hour(defaultEndTime);
  }, [defaultEndTime]);

  // Modal states
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);

  // Form states - using Date objects for dates, 12-hour format strings for times
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState<Date | null>(null);
  const [rescheduleStartTime, setRescheduleStartTime] = useState(defaultStartTime12);
  const [rescheduleEndTime, setRescheduleEndTime] = useState(defaultEndTime12);
  const [rescheduleReason, setRescheduleReason] = useState('');

  // Loading states
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);

  // Don't show if not admin
  if (!isAdmin) return null;

  // Handle start time change with automatic end time calculation
  const handleRescheduleStartTimeChange = (time: string) => {
    setRescheduleStartTime(time);
    setRescheduleEndTime(calculateEndTime(time));
  };

  const handleCancelClass = async () => {
    if (!currentUser) return;

    setIsCancelling(true);
    try {
      await createClassException(classId, {
        originalDate: classDate,
        type: 'cancelled',
        originalStartTime: defaultStartTime,
        originalEndTime: defaultEndTime,
        timezone,
        reason: cancelReason || undefined,
        createdAt: new Date(),
        createdBy: currentUser.uid
      });

      toast.success(t.exceptions.classCancelled);
      setShowCancelModal(false);
      setCancelReason('');
      onExceptionCreated?.();
    } catch (error) {
      console.error('Error cancelling class:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(`Failed to cancel class: ${errorMessage}`);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRescheduleClass = async () => {
    if (!currentUser || !rescheduleDate) return;
    
    setIsRescheduling(true);
    try {
      // rescheduleDate is already a Date object - createClassException will convert it to YYYY-MM-DD string
      await createClassException(classId, {
        originalDate: classDate,
        type: 'rescheduled',
        originalStartTime: defaultStartTime,
        originalEndTime: defaultEndTime,
        newDate: rescheduleDate,
        newStartTime: rescheduleStartTime,
        newEndTime: rescheduleEndTime,
        timezone,
        reason: rescheduleReason || undefined,
        createdAt: new Date(),
        createdBy: currentUser.uid
      });

      // Move materials and homework to the new date (using Date objects for the move functions)
      await moveMaterialsAndHomework(classId, classDate, rescheduleDate);

      toast.success(t.exceptions.classRescheduled);
      setShowRescheduleModal(false);
      setRescheduleDate(null);
      setRescheduleReason('');
      onExceptionCreated?.();
    } catch (error) {
      console.error('Error rescheduling class:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(`Failed to reschedule class: ${errorMessage}`);
    } finally {
      setIsRescheduling(false);
    }
  };


  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      {/* Section Header */}
      <div className={styles.card.label}>
        {t.exceptions.modifyClass}
      </div>
      
      {/* Buttons Container */}
      <div className="flex flex-wrap gap-2 mt-2">
        {/* Cancel Button - Always visible */}
        <button
          onClick={() => setShowCancelModal(true)}
          className="flex items-center px-2.5 py-1 text-sm bg-white text-gray-600 rounded-md hover:bg-gray-50 transition-colors border border-gray-200"
        >
          <XMarkIcon className="h-4 w-4 mr-1 text-red-500" />
          {t.exceptions.cancelClass}
        </button>

        {/* Reschedule Button - Available for all classes (past and future) */}
        <button
          onClick={() => setShowRescheduleModal(true)}
          className="flex items-center px-2.5 py-1 text-sm bg-white text-gray-600 rounded-md hover:bg-gray-50 transition-colors border border-gray-200"
        >
          <ArrowPathIcon className="h-4 w-4 mr-1 text-amber-500" />
          {t.exceptions.rescheduleClass}
        </button>
      </div>

      {/* Cancel Modal */}
      <Modal isOpen={showCancelModal} onClose={() => setShowCancelModal(false)}>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center text-red-600">
            <XMarkIcon className="h-5 w-5 mr-2" />
            {t.exceptions.cancelClass}
          </h3>
          
          <div className="mb-4">
            <div className="text-sm text-gray-600 mb-2">
              {t.date}: {classDate.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.exceptions.reason}
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t.exceptions.enterReason}
              className="w-full p-2 border border-gray-300 rounded-md text-sm"
              rows={3}
            />
          </div>

          <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
            <p className="text-sm text-red-700">{t.exceptions.confirmCancel}</p>
          </div>

          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setShowCancelModal(false)}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
              disabled={isCancelling}
            >
              {t.cancel}
            </button>
            <button
              onClick={handleCancelClass}
              disabled={isCancelling}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50"
            >
              {isCancelling ? t.loading : t.exceptions.cancelClass}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reschedule Modal */}
      <Modal isOpen={showRescheduleModal} onClose={() => setShowRescheduleModal(false)}>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center text-yellow-700">
            <ArrowPathIcon className="h-5 w-5 mr-2" />
            {t.exceptions.rescheduleClass}
          </h3>
          
          <div className="mb-4">
            <div className="text-sm text-gray-600 mb-2">
              {t.exceptions.originalDate}: {classDate.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.exceptions.newDateTime}
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <DatePicker
                  selected={rescheduleDate}
                  onChange={(date: Date | null) => setRescheduleDate(date)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  showTimeSelect={false}
                  dateFormat="MMMM d, yyyy"
                  placeholderText={t.exceptions.selectNewDate || "Select date"}
                />
              </div>
              <div className="flex gap-2">
                <div>
                  <select
                    value={rescheduleStartTime}
                    onChange={(e) => handleRescheduleStartTimeChange(e.target.value)}
                    className="mt-1 block rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm min-w-[120px]"
                  >
                    {timeOptions.map(time => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>
                <span className="self-center">-</span>
                <div>
                  <select
                    value={rescheduleEndTime}
                    onChange={(e) => setRescheduleEndTime(e.target.value)}
                    className="mt-1 block rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm min-w-[120px]"
                  >
                    {timeOptions.map(time => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.exceptions.reason}
            </label>
            <textarea
              value={rescheduleReason}
              onChange={(e) => setRescheduleReason(e.target.value)}
              placeholder={t.exceptions.enterReason}
              className="w-full p-2 border border-gray-300 rounded-md text-sm"
              rows={2}
            />
          </div>

          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setShowRescheduleModal(false)}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
              disabled={isRescheduling}
            >
              {t.cancel}
            </button>
            <button
              onClick={handleRescheduleClass}
              disabled={isRescheduling || !rescheduleDate}
              className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 disabled:opacity-50"
            >
              {isRescheduling ? t.loading : t.exceptions.rescheduleClass}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

