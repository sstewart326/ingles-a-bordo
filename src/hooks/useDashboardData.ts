import { useState, useCallback } from 'react';
import { where } from 'firebase/firestore';
import { useAuth } from './useAuth';
import { useAdmin } from './useAdmin';
import { getCachedCollection } from '../utils/firebaseUtils';
import { ClassSession, sortClassesByTime } from '../utils/scheduleUtils';
import { ClassMaterial, User } from '../types/interfaces';
import { updateClassList, fetchMaterialsForClasses } from '../utils/classUtils';
import { getAllClassesForMonth, invalidateCalendarCache } from '../services/calendarService';

// We can now use ClassSession directly since it includes all the properties we need
type ExtendedClassSession = ClassSession;

interface DashboardData {
  upcomingClasses: ExtendedClassSession[];
  pastClasses: ExtendedClassSession[];
  users: User[];
  userNames: { [email: string]: string };
  classMaterials: Record<string, ClassMaterial[]>;
  loadedMonths: Set<string>;
  loadedMaterialMonths: Set<string>;
  selectedDayDetails: {
    date: Date;
    classes: ExtendedClassSession[];
    paymentsDue: { user: User; classSession: ExtendedClassSession }[];
    materials: Record<string, ClassMaterial[]>;
    birthdays?: User[];
  } | null;
  dailyClassMap: Record<string, any[]>;
}

interface UseDashboardDataReturn extends DashboardData {
  setUpcomingClasses: (classes: ExtendedClassSession[]) => void;
  setPastClasses: (classes: ExtendedClassSession[]) => void;
  setLoadedMonths: (months: Set<string>) => void;
  setLoadedMaterialMonths: (months: Set<string>) => void;
  setSelectedDayDetails: (details: DashboardData['selectedDayDetails']) => void;
  setClassMaterials: (materials: Record<string, ClassMaterial[]>) => void;
  fetchClasses: (targetDate: Date, isInitialLoad?: boolean, shouldBypassCache?: boolean) => Promise<void>;
  getClassesForDay: (dayOfWeek: number, date: Date) => ExtendedClassSession[];
  isDateInRelevantMonthRange: (date: Date, selectedDate?: Date) => boolean;
  getRelevantMonthKeys: (date: Date) => string[];
  getMonthKey: (date: Date, offset?: number) => string;
  invalidateCache: () => void;
}

export const useDashboardData = (): UseDashboardDataReturn => {
  const { currentUser } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();

  // State
  const [upcomingClasses, setUpcomingClasses] = useState<ExtendedClassSession[]>([]);
  const [pastClasses, setPastClasses] = useState<ExtendedClassSession[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userNames, setUserNames] = useState<{ [email: string]: string }>({});
  const [classMaterials, setClassMaterials] = useState<Record<string, ClassMaterial[]>>({});
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set());
  const [loadedMaterialMonths, setLoadedMaterialMonths] = useState<Set<string>>(new Set());
  const [selectedDayDetails, setSelectedDayDetails] = useState<DashboardData['selectedDayDetails']>(null);
  const [dailyClassMap, setDailyClassMap] = useState<Record<string, any[]>>({});

  // Utility functions
  const getMonthKey = (date: Date, offset: number = 0): string => {
    const year = date.getFullYear();
    const month = date.getMonth() + offset;

    if (month < 0) {
      return `${year - 1}-${11}`;
    } else if (month > 11) {
      return `${year + 1}-${0}`;
    }

    return `${year}-${month}`;
  };

  const getRelevantMonthKeys = (date: Date): string[] => {
    return [
      getMonthKey(date, -1),
      getMonthKey(date, 0),
      getMonthKey(date, 1)
    ];
  };

  const isDateInRelevantMonthRange = (date: Date, selectedDate: Date = new Date()): boolean => {
    const dateMonth = date.getMonth();
    const dateYear = date.getFullYear();

    // Use the selected date from the calendar instead of the current date
    const selectedMonth = selectedDate.getMonth();
    const selectedYear = selectedDate.getFullYear();

    // Allow any future date relative to the selected date
    if (dateYear > selectedYear || (dateYear === selectedYear && dateMonth > selectedMonth)) {
      return true;
    }

    // For past dates, only show one month back from the selected date
    return (
      (dateMonth === selectedMonth && dateYear === selectedYear) ||
      (dateMonth === selectedMonth - 1 && dateYear === selectedYear) ||
      (dateMonth === 11 && selectedMonth === 0 && dateYear === selectedYear - 1)
    );
  };

  const getClassesForDay = useCallback((_: number, date: Date): ExtendedClassSession[] => {
    if (isAdmin) {
      const dateString = date.toISOString().split('T')[0];
      const classesForDay = dailyClassMap[dateString] || [];

      // Process the classes to ensure student information is complete
      const processedClasses = classesForDay.map(classObj => {
        // If studentEmails is missing or empty but we have students, populate from students
        if ((!classObj.studentEmails || classObj.studentEmails.length === 0) && classObj.students && classObj.students.length > 0) {
          return {
            ...classObj,
            studentEmails: classObj.students.map((student: any) =>
              typeof student === 'string' ? student : student.email || '')
              .filter((email: string) => email !== '')
          };
        }
        return classObj;
      });
      
      // Sort classes by time
      return sortClassesByTime(processedClasses);
    }
    return [];
  }, [dailyClassMap, isAdmin]);

  const fetchClasses = useCallback(async (targetDate: Date = new Date(), isInitialLoad: boolean = false, shouldBypassCache: boolean = false) => {
    if (!currentUser || adminLoading) return;

    try {
      const monthsToLoad = getRelevantMonthKeys(targetDate);
      const newMonthsToLoad = monthsToLoad.filter(month => !loadedMonths.has(month));

      if (newMonthsToLoad.length > 0) {
        let transformedClasses: ExtendedClassSession[] = [];
        let userDocs: User[] = [];
        let combinedDailyClassMap: Record<string, any[]> = { ...dailyClassMap };

        // Only attempt admin data fetching if user is confirmed to be an admin
        if (!adminLoading && isAdmin) {
          try {
            for (const monthKey of newMonthsToLoad) {
              const [year, month] = monthKey.split('-').map(Number);
              const response = await getAllClassesForMonth(month, year, { bypassCache: shouldBypassCache });
              if (response) {
                transformedClasses = [...transformedClasses, ...response.classes];
                if (response.users) {
                  userDocs = [...userDocs, ...response.users];
                }
                if (response.dailyClassMap) {
                  combinedDailyClassMap = {
                    ...combinedDailyClassMap,
                    ...response.dailyClassMap
                  };
                }
              }
            }

            // Only update admin-specific state if we successfully fetched admin data
            if (transformedClasses.length > 0) {
              setDailyClassMap(combinedDailyClassMap);
              userDocs = Array.from(new Map(userDocs.map(user => [user.email, user])).values());
            }
          } catch (error) {
            // Reset data and fall through to student data fetching
            transformedClasses = [];
            userDocs = [];
          }
        }

        // Fetch student data if we're not an admin or if admin data fetch failed
        if (!isAdmin || transformedClasses.length === 0) {
          const allClasses = await getCachedCollection<ClassSession>(
            'classes',
            [where('studentEmails', 'array-contains', currentUser.email)],
            { userId: currentUser.uid, bypassCache: true }
          );

          transformedClasses = allClasses.map(classDoc => ({
            ...classDoc,
            paymentConfig: classDoc.paymentConfig || {
              type: 'monthly' as const,
              monthlyOption: 'first' as const,
              startDate: classDoc.startDate?.toDate().toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
              amount: 0,
              currency: 'USD',
              paymentLink: ''
            }
          })) as ExtendedClassSession[];

          // Extract unique emails from classes
          const uniqueEmails = new Set<string>();
          transformedClasses.forEach(classSession => {
            if (classSession.studentEmails) {
              classSession.studentEmails.forEach(email => uniqueEmails.add(email));
            }
          });

          // Fetch users only if we have emails to look up
          if (uniqueEmails.size > 0) {
            userDocs = await getCachedCollection<User>('users', [
              where('email', 'in', Array.from(uniqueEmails))
            ], { userId: currentUser.uid });
          }
        }

        // Process user data
        const newUserNames: { [email: string]: string } = {};
        userDocs.forEach(user => {
          newUserNames[user.email] = user.name;
        });

        // Ensure classes have payment config
        transformedClasses = transformedClasses.map(classSession => {
          if (!classSession.paymentConfig) {
            return {
              ...classSession,
              paymentConfig: {
                type: 'monthly' as const,
                monthlyOption: 'first' as const,
                startDate: classSession.startDate?.toDate().toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
                amount: 0,
                currency: 'USD',
                paymentLink: ''
              }
            };
          }
          return classSession;
        }) as ExtendedClassSession[];

        // Batch state updates to reduce re-renders
        const updates = () => {
          setUserNames(prev => ({ ...prev, ...newUserNames }));
          setUsers(prev => {
            // Merge new users with existing users, avoiding duplicates
            const emailMap = new Map(prev.map(user => [user.email, user]));
            userDocs.forEach(user => emailMap.set(user.email, user));
            return Array.from(emailMap.values());
          });

          // Only update upcoming/past classes on initial load
          if (isInitialLoad) {
            // Update class lists using the updateClassList function
            updateClassList({
              classes: transformedClasses.map(cls => ({
                ...cls,
                dates: cls.dates?.map(d => typeof d === 'string' ? d : d.toISOString())
              })) as ClassSession[],
              upcomingClasses: [],  // Start with empty arrays on initial load
              pastClasses: [],
              setUpcomingClasses: setUpcomingClasses as (classes: ClassSession[]) => void,
              setPastClasses: setPastClasses as (classes: ClassSession[]) => void
            });
          }

          // Update loaded months - add new months to the existing set
          setLoadedMonths(prev => {
            const updatedSet = new Set(prev);
            newMonthsToLoad.forEach(month => updatedSet.add(month));
            return updatedSet;
          });
        };

        // Perform all state updates in one go
        updates();

        // Fetch materials for classes
        await fetchMaterialsForClasses({
          classes: transformedClasses.map(cls => ({
            ...cls,
            dates: cls.dates?.map(d => typeof d === 'string' ? d : d.toISOString())
          })) as ClassSession[],
          state: {
            upcomingClasses: upcomingClasses.map(cls => ({
              ...cls,
              dates: cls.dates?.map(d => typeof d === 'string' ? d : d.toISOString())
            })) as ClassSession[],
            pastClasses: pastClasses.map(cls => ({
              ...cls,
              dates: cls.dates?.map(d => typeof d === 'string' ? d : d.toISOString())
            })) as ClassSession[],
            classMaterials,
            loadedMaterialMonths,
            teacherId: currentUser?.uid
          },
          setState: (updates) => {
            if (updates.classMaterials) setClassMaterials(updates.classMaterials);
            if (updates.loadedMaterialMonths) setLoadedMaterialMonths(updates.loadedMaterialMonths);
          },
          selectedDayDetails,
          setSelectedDayDetails,
          selectedDate: targetDate
        });
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  }, [currentUser, adminLoading, isAdmin, classMaterials, loadedMaterialMonths, selectedDayDetails, loadedMonths, upcomingClasses, pastClasses, dailyClassMap]);

  const invalidateCache = useCallback(() => {
    // Invalidate the calendar cache to force a fresh fetch on the next request
    invalidateCalendarCache('getAllClassesForMonthHttp');
    // Clear our internal record of loaded months
    setLoadedMonths(new Set());
    setLoadedMaterialMonths(new Set());
  }, []);

  return {
    // State
    upcomingClasses,
    pastClasses,
    users,
    userNames,
    classMaterials,
    loadedMonths,
    loadedMaterialMonths,
    selectedDayDetails,
    dailyClassMap,

    // State setters
    setUpcomingClasses,
    setPastClasses,
    setLoadedMonths,
    setLoadedMaterialMonths,
    setSelectedDayDetails,
    setClassMaterials,

    // Utility functions
    fetchClasses,
    getClassesForDay,
    isDateInRelevantMonthRange,
    getRelevantMonthKeys,
    getMonthKey,
    invalidateCache,
  };
}; 