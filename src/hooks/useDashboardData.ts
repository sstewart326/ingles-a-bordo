import { useState, useCallback } from 'react';
import { where } from 'firebase/firestore';
import { useAuth } from './useAuth';
import { useAdmin } from './useAdmin';
import { getCachedCollection } from '../utils/firebaseUtils';
import { ClassSession, User } from '../utils/scheduleUtils';
import { ClassMaterial } from '../types/interfaces';
import { updateClassList, fetchMaterialsForClasses } from '../utils/classUtils';
import { getAllClassesForMonth, invalidateCalendarCache } from '../services/calendarService';

// Extend the ClassSession interface to include the additional properties we need
interface ExtendedClassSession extends ClassSession {
  dates?: Date[];
  studentNames?: string[];
}

interface DashboardData {
  upcomingClasses: ClassSession[];
  pastClasses: ClassSession[];
  users: User[];
  userNames: { [email: string]: string };
  classMaterials: Record<string, ClassMaterial[]>;
  loadedMonths: Set<string>;
  loadedMaterialMonths: Set<string>;
  selectedDayDetails: {
    date: Date;
    classes: ClassSession[];
    paymentsDue: { user: User; classSession: ClassSession }[];
    materials: Record<string, ClassMaterial[]>;
    birthdays?: User[];
  } | null;
  dailyClassMap: Record<string, any[]>;
}

interface UseDashboardDataReturn extends DashboardData {
  setUpcomingClasses: (classes: ClassSession[]) => void;
  setPastClasses: (classes: ClassSession[]) => void;
  setLoadedMonths: (months: Set<string>) => void;
  setLoadedMaterialMonths: (months: Set<string>) => void;
  setSelectedDayDetails: (details: DashboardData['selectedDayDetails']) => void;
  setClassMaterials: (materials: Record<string, ClassMaterial[]>) => void;
  fetchClasses: (targetDate: Date, isInitialLoad?: boolean, shouldBypassCache?: boolean) => Promise<void>;
  getClassesForDay: (dayOfWeek: number, date: Date) => ClassSession[];
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
  const [userNames, setUserNames] = useState<{[email: string]: string}>({});
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

  const getClassesForDay = useCallback((_: number, date: Date): ClassSession[] => {
    if (isAdmin) {
      const dateString = date.toISOString().split('T')[0];
      return dailyClassMap[dateString] || [];
    }
    return [];
  }, [dailyClassMap, isAdmin]);

  const fetchClasses = useCallback(async (targetDate: Date = new Date(), isInitialLoad: boolean = false, shouldBypassCache: boolean = false) => {
    if (!currentUser || adminLoading) return;

    try {
      const monthsToLoad = getRelevantMonthKeys(targetDate);
      console.log('Months to load:', monthsToLoad);
      
      // Filter out months that have already been loaded
      const newMonthsToLoad = monthsToLoad.filter(month => !loadedMonths.has(month));
      console.log('New months to load:', newMonthsToLoad);
      
      if (newMonthsToLoad.length > 0) {
        let transformedClasses: ExtendedClassSession[] = [];
        let userDocs: User[] = [];
        let combinedDailyClassMap: Record<string, any[]> = { ...dailyClassMap };
        
        if (isAdmin) {
          // For admin users, fetch data for all relevant months
          const fetchPromises = newMonthsToLoad.map(async (monthKey) => {
            const [year, month] = monthKey.split('-').map(Number);
            try {
              const response = await getAllClassesForMonth(month, year, { bypassCache: shouldBypassCache });
              return response;
            } catch (error) {
              console.error(`Error fetching classes for ${monthKey}:`, error);
              return null;
            }
          });

          const responses = await Promise.all(fetchPromises);
          
          // Combine all responses
          responses.forEach(response => {
            if (response) {
              if (response.classes) {
                transformedClasses = [...transformedClasses, ...response.classes];
              }
              
              if (response.dailyClassMap) {
                // Merge the dailyClassMap from this response
                combinedDailyClassMap = { ...combinedDailyClassMap, ...response.dailyClassMap };
              }
              
              // Get users from the response
              if (response.users && Array.isArray(response.users)) {
                userDocs = [...userDocs, ...response.users];
              }
            }
          });

          // Update the dailyClassMap state
          setDailyClassMap(combinedDailyClassMap);

          // Remove duplicate users by email
          userDocs = Array.from(new Map(userDocs.map(user => [user.email, user])).values());
        } else {
          // For non-admin users, use the original implementation but bypass cache
          const allClasses = await getCachedCollection<ClassSession>(
            'classes',
            [where('studentEmails', 'array-contains', currentUser.email)],
            { userId: currentUser.uid, bypassCache: true }
          );
          
          transformedClasses = allClasses.map(classDoc => ({
            ...classDoc,
            paymentConfig: classDoc.paymentConfig || {
              type: 'monthly',
              monthlyOption: 'first',
              startDate: classDoc.startDate?.toDate().toISOString().split('T')[0] || new Date().toISOString().split('T')[0]
            }
          }));
          
          // Extract unique emails from classes
          const uniqueEmails = new Set<string>();
          transformedClasses.forEach(classSession => {
            if (classSession.studentEmails) {
              classSession.studentEmails.forEach(email => uniqueEmails.add(email));
            }
          });
          
          // Fetch users
          userDocs = await getCachedCollection<User>('users', [
            where('email', 'in', Array.from(uniqueEmails))
          ], { userId: currentUser.uid });
        }
        
        // Process user data
        const newUserNames: {[email: string]: string} = {};
        userDocs.forEach(user => {
          newUserNames[user.email] = user.name;
        });

        // Log the number of classes fetched
        console.log(`Fetched ${transformedClasses.length} classes for months: ${newMonthsToLoad.join(', ')}`);
        
        // Ensure classes have payment config
        transformedClasses = transformedClasses.map(classSession => {
          if (!classSession.paymentConfig) {
            return {
              ...classSession,
              paymentConfig: {
                type: 'monthly',
                monthlyOption: 'first',
                startDate: classSession.startDate?.toDate().toISOString().split('T')[0] || new Date().toISOString().split('T')[0]
              }
            };
          }
          return classSession;
        });

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
              classes: transformedClasses,
              upcomingClasses: [],  // Start with empty arrays on initial load
              pastClasses: [],
              setUpcomingClasses,
              setPastClasses
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
          classes: transformedClasses,
          state: {
            upcomingClasses,
            pastClasses,
            classMaterials,
            loadedMaterialMonths
          },
          setState: (updates) => {
            if (updates.classMaterials) setClassMaterials(updates.classMaterials);
            if (updates.loadedMaterialMonths) setLoadedMaterialMonths(updates.loadedMaterialMonths);
          },
          selectedDayDetails,
          setSelectedDayDetails
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