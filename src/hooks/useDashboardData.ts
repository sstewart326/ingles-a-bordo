import { useState, useEffect, useCallback } from 'react';
import { where } from 'firebase/firestore';
import { useAuth } from './useAuth';
import { useAdmin } from './useAdmin';
import { getCachedCollection } from '../utils/firebaseUtils';
import { ClassSession, User } from '../utils/scheduleUtils';
import { ClassMaterial } from '../types/interfaces';
import { updateClassList, fetchMaterialsForClasses } from '../utils/classUtils';

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
  const [upcomingClasses, setUpcomingClasses] = useState<ClassSession[]>([]);
  const [pastClasses, setPastClasses] = useState<ClassSession[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userNames, setUserNames] = useState<{[email: string]: string}>({});
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set());
  const [loadedMaterialMonths, setLoadedMaterialMonths] = useState<Set<string>>(new Set());
  const [classMaterials, setClassMaterials] = useState<Record<string, ClassMaterial[]>>({});
  const [selectedDayDetails, setSelectedDayDetails] = useState<{
    date: Date;
    classes: ClassSession[];
    paymentsDue: { user: User; classSession: ClassSession }[];
    materials: Record<string, ClassMaterial[]>;
    birthdays?: User[];
  } | null>(null);

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
    
    return (
      (dateMonth === currentMonth && dateYear === currentYear) ||
      (dateMonth === currentMonth - 1 && dateYear === currentYear) ||
      (dateMonth === currentMonth + 1 && dateYear === currentYear) ||
      (dateMonth === 11 && currentMonth === 0 && dateYear === currentYear - 1) ||
      (dateMonth === 0 && currentMonth === 11 && dateYear === currentYear + 1)
    );
  };

  const getClassesForDay = (dayOfWeek: number, date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const calendarDate = new Date(date);
    calendarDate.setHours(0, 0, 0, 0);
    
    if (!isDateInRelevantMonthRange(date)) {
      return [];
    }
    
    const classes = upcomingClasses.filter(classItem => {
      if (classItem.dayOfWeek !== dayOfWeek) return false;
      
      if (classItem.startDate) {
        const startDate = classItem.startDate.toDate();
        startDate.setHours(0, 0, 0, 0);
        if (startDate > calendarDate) return false;
      }

      if (!classItem.endDate) return true;
      
      const endDate = classItem.endDate.toDate();
      endDate.setHours(0, 0, 0, 0);
      return endDate >= calendarDate;
    });

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
  };

  const fetchClasses = useCallback(async (targetDate: Date = new Date()) => {
    if (!currentUser || adminLoading) return;

    try {
      const monthsToLoad = getRelevantMonthKeys(targetDate);
      const newMonthsToLoad = monthsToLoad.filter(monthKey => !loadedMonths.has(monthKey));
      
      if (newMonthsToLoad.length > 0) {
        const queryConstraints = isAdmin 
          ? [] 
          : [where('studentEmails', 'array-contains', currentUser.email)];

        const allClasses = await getCachedCollection<ClassSession>(
          'classes',
          queryConstraints,
          { userId: currentUser.uid }
        );

        const transformedClasses: ClassSession[] = allClasses.map(classDoc => ({
          ...classDoc,
          paymentConfig: classDoc.paymentConfig || {
            type: 'monthly',
            monthlyOption: 'first',
            startDate: classDoc.startDate?.toDate().toISOString().split('T')[0] || new Date().toISOString().split('T')[0]
          }
        }));

        const uniqueEmails = new Set<string>();
        transformedClasses.forEach(classSession => {
          classSession.studentEmails.forEach(email => uniqueEmails.add(email));
        });

        const userDocs = await getCachedCollection<User>('users', [
          where('email', 'in', Array.from(uniqueEmails))
        ], { userId: currentUser.uid });

        const userMap = new Map<string, User>();
        userDocs.forEach(user => {
          userMap.set(user.email, user);
          userNames[user.email] = user.name;
        });
        setUserNames(userNames);
        setUsers(userDocs);

        updateClassList({
          classes: transformedClasses,
          upcomingClasses,
          pastClasses,
          setUpcomingClasses,
          setPastClasses
        });
        
        const updatedLoadedMonths = new Set(loadedMonths);
        newMonthsToLoad.forEach(month => updatedLoadedMonths.add(month));
        setLoadedMonths(updatedLoadedMonths);

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
  }, [currentUser, adminLoading, isAdmin, loadedMonths, upcomingClasses, pastClasses, classMaterials, loadedMaterialMonths, selectedDayDetails]);

  // Initial data fetch
  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

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