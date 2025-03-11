import { useState, useEffect, useCallback } from 'react';
import { where } from 'firebase/firestore';
import { useAuth } from './useAuth';
import { useAdmin } from './useAdmin';
import { getCachedCollection } from '../utils/firebaseUtils';
import { ClassSession, User } from '../utils/scheduleUtils';
import { ClassMaterial } from '../types/interfaces';
import { updateClassList, fetchMaterialsForClasses } from '../utils/classUtils';
import { getAllClassesForMonth } from '../services/calendarService';

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
  const sortClassesByTime = (classes: ClassSession[]): ClassSession[] => {
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

  const getClassesForDay = useCallback((dayOfWeek: number, date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const calendarDate = new Date(date);
    calendarDate.setHours(0, 0, 0, 0);
    
    if (!isDateInRelevantMonthRange(date)) {
      return [];
    }
    
    console.log(`Getting classes for day: ${date.toISOString()}, day of week: ${dayOfWeek}`);
    console.log('Available classes (state):', upcomingClasses);
    
    const classes = upcomingClasses.filter(classItem => {
      // If the class has specific dates, check if this date is in the list
      const extendedClass = classItem as ExtendedClassSession;
      if (extendedClass.dates && extendedClass.dates.length > 0) {
        console.log(`Class ${classItem.id} has specific dates:`, extendedClass.dates);
        // Check if any of the dates match the calendar date
        const matchingDate = extendedClass.dates.some(classDate => {
          const dateToCheck = new Date(classDate);
          dateToCheck.setHours(0, 0, 0, 0);
          const matches = dateToCheck.getTime() === calendarDate.getTime();
          if (matches) {
            console.log(`Found matching date for class ${classItem.id}:`, dateToCheck);
          }
          return matches;
        });
        
        return matchingDate;
      }
      
      // If no specific dates, use the traditional day of week check
      // First check if this class is scheduled for this day of the week
      if (classItem.dayOfWeek !== dayOfWeek) return false;
      
      // Check if the class has a start date and it's after the calendar date
      if (classItem.startDate) {
        const startDate = typeof classItem.startDate.toDate === 'function' 
          ? classItem.startDate.toDate() 
          : new Date(classItem.startDate as any);
        startDate.setHours(0, 0, 0, 0);
        if (startDate > calendarDate) return false;
      }

      // Check if the class has an end date and it's before the calendar date
      if (classItem.endDate) {
        const endDate = typeof classItem.endDate.toDate === 'function' 
          ? classItem.endDate.toDate() 
          : new Date(classItem.endDate as any);
        endDate.setHours(0, 0, 0, 0);
        if (endDate < calendarDate) return false;
      }

      return true;
    });
    
    const sortedClasses = sortClassesByTime(classes);
    console.log(`Found ${sortedClasses.length} classes for ${date.toISOString()}:`, sortedClasses);
    return sortedClasses;
  }, [upcomingClasses]);

  const fetchClasses = useCallback(async (targetDate: Date = new Date()) => {
    if (!currentUser || adminLoading) return;

    try {
      const monthsToLoad = getRelevantMonthKeys(targetDate);
      const newMonthsToLoad = monthsToLoad.filter(monthKey => !loadedMonths.has(monthKey));
      
      if (newMonthsToLoad.length > 0) {
        let transformedClasses: ExtendedClassSession[] = [];
        let userDocs: User[] = [];
        
        if (isAdmin) {
          // For admin users, use the getAllClassesForMonth API
          const month = targetDate.getMonth();
          const year = targetDate.getFullYear();
          
          try {
            const response = await getAllClassesForMonth(month, year);
            console.log('API Response:', response);
            
            if (response && response.classes) {
              // The API now returns data in a format that's compatible with the frontend
              // We just need to ensure dates are properly handled
              transformedClasses = response.classes.map((classInfo: any) => {
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
              
              // Get users from the response
              if (response.users && Array.isArray(response.users)) {
                userDocs = response.users;
              }
              
              // Process birthdays if available
              if (response.birthdays && response.birthdays.length > 0) {
                // Add birthdays to user data if needed
                response.birthdays.forEach((birthday: any) => {
                  const existingUserIndex = userDocs.findIndex(user => user.email === birthday.email);
                  if (existingUserIndex >= 0) {
                    userDocs[existingUserIndex].birthdate = birthday.birthdate;
                  } else {
                    userDocs.push({
                      id: birthday.userId,
                      name: birthday.name,
                      email: birthday.email,
                      birthdate: birthday.birthdate
                    } as User);
                  }
                });
              }
            }
          } catch (error) {
            console.error('Error fetching classes from API:', error);
            
            // Fallback to the original implementation if API call fails
            const allClasses = await getCachedCollection<ClassSession>(
              'classes',
              [],
              { userId: currentUser.uid }
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
        } else {
          // For non-admin users, use the original implementation
          const allClasses = await getCachedCollection<ClassSession>(
            'classes',
            [where('studentEmails', 'array-contains', currentUser.email)],
            { userId: currentUser.uid }
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
        const userMap = new Map<string, User>();
        userDocs.forEach(user => {
          userMap.set(user.email, user);
          userNames[user.email] = user.name;
        });
        setUserNames(userNames);
        setUsers(userDocs);

        console.log('Transformed Classes:', transformedClasses);
        
        // Create local copies of the current state
        const currentUpcomingClasses = [...upcomingClasses];
        const currentPastClasses = [...pastClasses];
        
        // Update class lists using the updateClassList function
        // This will modify the local copies
        updateClassList({
          classes: transformedClasses,
          upcomingClasses: currentUpcomingClasses,
          pastClasses: currentPastClasses,
          setUpcomingClasses,
          setPastClasses
        });
        
        // Log the updated upcomingClasses
        setTimeout(() => {
          console.log('Updated upcomingClasses from state:', upcomingClasses);
          console.log('Local updated upcomingClasses:', currentUpcomingClasses);
          
          // Test getClassesForDay with a specific date from the API response
          if (transformedClasses.length > 0 && transformedClasses[0].dates && transformedClasses[0].dates.length > 0) {
            const testDate = transformedClasses[0].dates[0];
            console.log(`Testing getClassesForDay with date: ${testDate.toISOString()}`);
            
            // Create a modified version of getClassesForDay that uses our local copy
            const testGetClassesForDay = (dayOfWeek: number, date: Date) => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const calendarDate = new Date(date);
              calendarDate.setHours(0, 0, 0, 0);
              
              if (!isDateInRelevantMonthRange(date)) {
                return [];
              }
              
              console.log(`Getting classes for day: ${date.toISOString()}, day of week: ${dayOfWeek}`);
              console.log('Available classes (local):', currentUpcomingClasses);
              
              const classes = currentUpcomingClasses.filter(classItem => {
                // If the class has specific dates, check if this date is in the list
                const extendedClass = classItem as ExtendedClassSession;
                if (extendedClass.dates && extendedClass.dates.length > 0) {
                  console.log(`Class ${classItem.id} has specific dates:`, extendedClass.dates);
                  // Check if any of the dates match the calendar date
                  const matchingDate = extendedClass.dates.some(classDate => {
                    const dateToCheck = new Date(classDate);
                    dateToCheck.setHours(0, 0, 0, 0);
                    const matches = dateToCheck.getTime() === calendarDate.getTime();
                    if (matches) {
                      console.log(`Found matching date for class ${classItem.id}:`, dateToCheck);
                    }
                    return matches;
                  });
                  
                  return matchingDate;
                }
                
                // If no specific dates, use the traditional day of week check
                // First check if this class is scheduled for this day of the week
                if (classItem.dayOfWeek !== dayOfWeek) return false;
                
                // Check if the class has a start date and it's after the calendar date
                if (classItem.startDate) {
                  const startDate = typeof classItem.startDate.toDate === 'function' 
                    ? classItem.startDate.toDate() 
                    : new Date(classItem.startDate as any);
                  startDate.setHours(0, 0, 0, 0);
                  if (startDate > calendarDate) return false;
                }

                // Check if the class has an end date and it's before the calendar date
                if (classItem.endDate) {
                  const endDate = typeof classItem.endDate.toDate === 'function' 
                    ? classItem.endDate.toDate() 
                    : new Date(classItem.endDate as any);
                  endDate.setHours(0, 0, 0, 0);
                  if (endDate < calendarDate) return false;
                }

                return true;
              });
              
              const sortedClasses = sortClassesByTime(classes);
              console.log(`Found ${sortedClasses.length} classes for ${date.toISOString()} (local):`, sortedClasses);
              return sortedClasses;
            };
            
            const classesForDay = testGetClassesForDay(testDate.getDay(), testDate);
            console.log('Classes for test date (local):', classesForDay);
            
            // If we found classes using our local copy but not with the state,
            // it means the state hasn't been updated yet
            if (classesForDay.length > 0) {
              console.log('Classes found in local copy but not in state. Forcing update...');
              // Force update the state
              setUpcomingClasses([...currentUpcomingClasses]);
              setPastClasses([...currentPastClasses]);
            }
          }
        }, 500);
        
        // Update loaded months
        const updatedLoadedMonths = new Set(loadedMonths);
        newMonthsToLoad.forEach(month => updatedLoadedMonths.add(month));
        setLoadedMonths(updatedLoadedMonths);

        // Fetch materials for classes
        await fetchMaterialsForClasses({
          classes: transformedClasses,
          state: {
            upcomingClasses: currentUpcomingClasses, // Use local copy
            pastClasses: currentPastClasses, // Use local copy
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
  }, [currentUser, adminLoading, isAdmin, loadedMonths, upcomingClasses, pastClasses, classMaterials, loadedMaterialMonths, selectedDayDetails, userNames]);

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