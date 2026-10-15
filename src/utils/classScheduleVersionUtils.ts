import {
  collection,
  doc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Class, ClassSchedule, ClassScheduleVersionDoc } from '../types/interfaces';

/**
 * Builds a schedule snapshot from the current class fields (prior schedule to archive).
 */
export const buildScheduleVersionSnapshot = (
  classData: Class,
  createdAt: Timestamp
): Omit<ClassScheduleVersionDoc, 'id'> => {
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

  return {
    createdAt,
    scheduleType: classData.scheduleType || 'single',
    schedules,
    dayOfWeek: classData.dayOfWeek,
    startTime: classData.startTime,
    endTime: classData.endTime,
    timezone: classData.timezone,
    frequency: classData.frequency || { type: 'weekly', every: 1 },
  };
};

/**
 * Archives the prior schedule into classes/{classId}/versions/{versionId}.
 * createdAt on the version is when that schedule became effective.
 */
export const archiveClassScheduleVersion = async (
  classId: string,
  classData: Class
): Promise<string> => {
  const effectiveFrom =
    classData.scheduleEffectiveFrom || classData.createdAt || Timestamp.now();

  const versionId = Date.now().toString();
  const snapshot = buildScheduleVersionSnapshot(classData, effectiveFrom);
  const versionRef = doc(collection(db, 'classes', classId, 'versions'), versionId);

  await setDoc(versionRef, snapshot);
  return versionId;
};
