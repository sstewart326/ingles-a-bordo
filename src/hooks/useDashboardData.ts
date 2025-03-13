import { useState, useEffect, useCallback, useRef } from 'react';
import { where } from 'firebase/firestore';
import { useAuth } from './useAuth';
import { useAdmin } from './useAdmin';
import { getCachedCollection } from '../utils/firebaseUtils';
import { ClassSession, User } from '../utils/scheduleUtils';
import { ClassMaterial } from '../types/interfaces';
import { updateClassList, fetchMaterialsForClasses } from '../utils/classUtils';
import { getAllClassesForMonth } from '../services/calendarService';
import { debugLog } from '../utils/debugUtils';

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
  fetchClasses: (targetDate: Date) => Promise<void>;
  getClassesForDay: (dayOfWeek: number, date: Date) => ClassSession[];
  isDateInRelevantMonthRange: (date: Date) => boolean;
  getRelevantMonthKeys: (date: Date) => string[];
  getMonthKey: (date: Date, offset?: number) => string;
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
  const initializationRef = useRef(false);

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

  const isDateInRelevantMonthRange = (date: Date): boolean => {
    const dateMonth = date.getMonth();
    const dateYear = date.getFullYear();
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    // Allow any future date
    if (dateYear > currentYear || (dateYear === currentYear && dateMonth > currentMonth)) {
      return true;
    }
    
    // For past dates, only show one month back
    return (
      (dateMonth === currentMonth && dateYear === currentYear) ||
      (dateMonth === currentMonth - 1 && dateYear === currentYear) ||
      (dateMonth === 11 && currentMonth === 0 && dateYear === currentYear - 1)
    );
  };

  // Helper function to sort classes by start time
  const sortClassesByTime = useCallback((classes: ClassSession[]): ClassSession[] => {
    return classes.sort((a, b) => {
      const dayDiff = (a.dayOfWeek || 0) - (b.dayOfWeek || 0);
      if (dayDiff !== 0) return dayDiff;
      
      const timeA = a.startTime || '';
      const timeB = b.startTime || '';
      
      const parseTimeToMinutes = (time: string): number => {
        if (!time) return 0;
        const cleanTime = time.toLowerCase().replace(/[ap]m\s*/g, '');
        const [hours, minutes] = cleanTime.split(':').map(Number);
        let totalMinutes = hours * 60 + minutes;
        
        if (time.toLowerCase().includes('pm') && hours !== 12) {
          totalMinutes += 12 * 60;
        } else if (time.toLowerCase().includes('am') && hours === 12) {
          totalMinutes = minutes;
        }
        
        return totalMinutes;
      };
      
      return parseTimeToMinutes(timeA) - parseTimeToMinutes(timeB);
    });
  }, []);

  // Cache for date calculations
  const dateCache = useRef(new Map<string, Date[]>());
  const classCache = useRef(new Map<string, ClassSession[]>());

  const getClassesForDay = useCallback((dayOfWeek: number, date: Date): ClassSession[] => {
    if (isAdmin) {
      // For admin users, use the dailyClassMap
      const dateString = date.toISOString().split('T')[0];
      return dailyClassMap[dateString] || [];
    }

    // For non-admin users, use the existing logic
    const cacheKey = `${date.toISOString()}_${dayOfWeek}`;
    if (classCache.current.has(cacheKey)) {
      return classCache.current.get(cacheKey)!;
    }

    const calendarDate = new Date(date);
    calendarDate.setHours(0, 0, 0, 0);
    
    // Check if date is in relevant range using cache
    const rangeCacheKey = calendarDate.getTime().toString();
    if (!dateCache.current.has(rangeCacheKey)) {
      dateCache.current.set(rangeCacheKey, isDateInRelevantMonthRange(date) ? [calendarDate] : []);
    }
    
    if (!dateCache.current.get(rangeCacheKey)) {
      classCache.current.set(cacheKey, []);
      return [];
    }
    
    const classes = upcomingClasses.filter(classItem => {
      // If the class has specific dates, check if this date is in the list
      const extendedClass = classItem as ExtendedClassSession;
      if (extendedClass.dates && extendedClass.dates.length > 0) {
        return extendedClass.dates.some(classDate => {
          const dateToCheck = new Date(classDate);
          dateToCheck.setHours(0, 0, 0, 0);
          return dateToCheck.getTime() === calendarDate.getTime();
        });
      }
      
      // If no specific dates, use the traditional day of week check
      if (classItem.dayOfWeek !== dayOfWeek) return false;
      
      // Check start and end dates
      if (classItem.startDate) {
        const startDate = typeof classItem.startDate.toDate === 'function' 
          ? classItem.startDate.toDate() 
          : new Date(classItem.startDate as any);
        startDate.setHours(0, 0, 0, 0);
        if (startDate > calendarDate) return false;
      }

      if (classItem.endDate) {
        const endDate = typeof classItem.endDate.toDate === 'function' 
          ? classItem.endDate.toDate() 
          : new Date(classItem.endDate as any);
        endDate.setHours(0, 0, 0, 0);
        if (endDate < calendarDate) return false;
      }

      // Check class frequency
      const frequency = classItem.frequency || { type: 'weekly', every: 1 };
      
      if (!classItem.startDate) return true;

      const startDate = typeof classItem.startDate.toDate === 'function' 
        ? classItem.startDate.toDate() 
        : new Date(classItem.startDate as any);
      startDate.setHours(0, 0, 0, 0);

      const weeksBetween = Math.floor((calendarDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));

      if (frequency.type === 'weekly') {
        return weeksBetween % frequency.every === 0;
      } else if (frequency.type === 'biweekly') {
        return weeksBetween % 2 === 0;
      } else if (frequency.type === 'custom') {
        return weeksBetween % frequency.every === 0;
      }

      return true;
    });
    
    const sortedClasses = sortClassesByTime(classes);
    classCache.current.set(cacheKey, sortedClasses);
    return sortedClasses;
  }, [isAdmin, dailyClassMap, upcomingClasses, sortClassesByTime]);

  // Clear caches when month changes
  useEffect(() => {
    dateCache.current.clear();
    classCache.current.clear();
  }, [loadedMonths]);

  const fetchClasses = useCallback(async (targetDate: Date = new Date()) => {
    if (!currentUser || adminLoading) return;

    try {
      const monthsToLoad = getRelevantMonthKeys(targetDate);
      console.log('Months to load:', monthsToLoad);
      
      if (monthsToLoad.length > 0) {
        let transformedClasses: ExtendedClassSession[] = [];
        let userDocs: User[] = [];
        let combinedDailyClassMap: Record<string, any[]> = {};
        
        if (isAdmin) {
          // For admin users, fetch data for all relevant months
          const fetchPromises = monthsToLoad.map(async (monthKey) => {
            const [year, month] = monthKey.split('-').map(Number);
            try {
              const response = await getAllClassesForMonth(month, year, { bypassCache: true });
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
                const monthClasses = response.classes.map((classInfo: any) => {
                  // Ensure dates are Date objects
                  const dates = Array.isArray(classInfo.dates) 
                    ? classInfo.dates.map((d: string | Date) => d instanceof Date ? d : new Date(d))
                    : [];
                  
                  const startDate = classInfo.startDate ? new Date(classInfo.startDate) : null;
                  const endDate = classInfo.endDate ? new Date(classInfo.endDate) : null;
                  
                  return {
                    ...classInfo,
                    dates,
                    startDate,
                    endDate
                  };
                });
                
                transformedClasses = [...transformedClasses, ...monthClasses];
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

        // Batch state updates to reduce re-renders
        const updates = () => {
          setUserNames(newUserNames);
          setUsers(userDocs);
          
          // Update class lists using the updateClassList function
          updateClassList({
            classes: transformedClasses,
            upcomingClasses: [],  // Start with empty arrays to ensure fresh data
            pastClasses: [],
            setUpcomingClasses,
            setPastClasses
          });
          
          // Update loaded months
          setLoadedMonths(new Set(monthsToLoad));  // Only keep the current relevant months
        };

        // Perform all state updates in one go
        updates();

        // Fetch materials for classes
        await fetchMaterialsForClasses({
          classes: transformedClasses,
          state: {
            upcomingClasses: [],  // Start with empty arrays to ensure fresh data
            pastClasses: [],
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
  }, [currentUser, adminLoading, isAdmin, classMaterials, loadedMaterialMonths, selectedDayDetails]);

  // Combined initialization and data fetching effect
  useEffect(() => {
    if (!currentUser || adminLoading || initializationRef.current) return;

    debugLog('Dashboard - Initial data fetch triggered');
    initializationRef.current = true;
    fetchClasses(new Date());
  }, [currentUser, adminLoading, fetchClasses]);

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
    getMonthKey
  };
}; 