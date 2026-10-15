import {
  collection,
  doc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Class, ClassConfigVersionDoc, ClassSchedule, PaymentConfig } from '../types/interfaces';

/**
 * Builds a config snapshot from the current class fields (prior config to archive).
 */
export const buildConfigVersionSnapshot = (
  classData: Class,
  createdAt: Timestamp
): Omit<ClassConfigVersionDoc, 'id'> => {
  const schedules: ClassSchedule[] =
    classData.scheduleType === 'multiple' && classData.schedules
      ? classData.schedules.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          timezone: s.timezone || classData.timezone,
        }))
      : [
          {
            dayOfWeek: classData.dayOfWeek,
            startTime: classData.startTime,
            endTime: classData.endTime,
            timezone: classData.timezone,
          },
        ];

  const paymentConfig: PaymentConfig = classData.paymentConfig
    ? { ...classData.paymentConfig }
    : {
        type: 'monthly',
        monthlyOption: 'first',
        startDate: new Date().toISOString().split('T')[0],
      };

  return {
    createdAt,
    scheduleType: classData.scheduleType || 'single',
    schedules,
    dayOfWeek: classData.dayOfWeek,
    startTime: classData.startTime,
    endTime: classData.endTime,
    timezone: classData.timezone,
    frequency: classData.frequency || { type: 'weekly', every: 1 },
    paymentConfig,
  };
};

/**
 * Archives the prior config into classes/{classId}/versions/{versionId}.
 * createdAt on the version is when that config became effective.
 */
export const archiveClassConfigVersion = async (
  classId: string,
  classData: Class
): Promise<string> => {
  const effectiveFrom =
    classData.configEffectiveFrom ||
    classData.startDate ||
    classData.createdAt ||
    Timestamp.now();

  const versionId = Date.now().toString();
  const snapshot = buildConfigVersionSnapshot(classData, effectiveFrom);
  const versionRef = doc(collection(db, 'classes', classId, 'versions'), versionId);

  await setDoc(versionRef, snapshot);
  return versionId;
};
