import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAdmin } from '../hooks/useAdmin';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { DayDetails } from '../components/DayDetails';
import '../styles/calendar.css';
import { ClassSession } from '../utils/scheduleUtils';
import { styles } from '../styles/styleUtils';
import { getClassMaterials } from '../utils/classMaterialsUtils';
import { ClassMaterial, Homework } from '../types/interfaces';
import {
  handleDeleteMaterial as deleteMaterial,
  MaterialsState
} from '../utils/materialsUtils';
import {
  handleEditNotes as handleEditNotesUtil,
  handleSaveNotes as handleSaveNotesUtil,
  handleCancelEditNotes as handleCancelEditNotesUtil
} from '../utils/notesUtils';
import { CalendarSection } from '../components/CalendarSection';
import { ClassesSection } from '../components/ClassesSection';
import { useDashboardData } from '../hooks/useDashboardData';
import { debugLog, debugMaterials } from '../utils/debugUtils';
import { getPaymentsDueForDay } from '../utils/paymentUtils';
import { StudentHomework } from '../components/StudentHomework';
import { getHomeworkForClass, subscribeToHomeworkChanges } from '../utils/homeworkUtils';

export const Dashboard = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
  const [editingNotes, setEditingNotes] = useState<{[classId: string]: string}>({});
  const [savingNotes, setSavingNotes] = useState<{[classId: string]: boolean}>({});
  const [editingPrivateNotes, setEditingPrivateNotes] = useState<{[classId: string]: string}>({});
  const [savingPrivateNotes, setSavingPrivateNotes] = useState<{[classId: string]: boolean}>({});
  const [deletingMaterial, setDeletingMaterial] = useState<{[materialId: string]: boolean}>({});
  const [visibleUploadForm, setVisibleUploadForm] = useState<string | null>(null);
  const [upcomingClassesPage, setUpcomingClassesPage] = useState(0);
  const [pastClassesPage, setPastClassesPage] = useState(0);
  const [initialDataFetched, setInitialDataFetched] = useState(false);
  const [lastVisitTimestamp, setLastVisitTimestamp] = useState<number>(Date.now());
  const prevPathRef = useRef<string | null>(null);
  const isFetchingRef = useRef<boolean>(false);
  
  const [homeworkByClassId, setHomeworkByClassId] = useState<Record<string, Homework[]>>({});
  
  const { currentUser, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { language } = useLanguage();
  const t = useTranslation(language);
  const detailsRef = useRef<HTMLDivElement>(null);
  const textareaRefs = useRef<{ [key: string]: HTMLTextAreaElement | null }>({});

  const {
    upcomingClasses,
    pastClasses,
    users,
    userNames,
    classMaterials,
    loadedMonths,
    loadedMaterialMonths,
    selectedDayDetails,
    setUpcomingClasses,
    setPastClasses,
    setLoadedMaterialMonths,
    setSelectedDayDetails,
    setClassMaterials,
    fetchClasses,
    getClassesForDay,
    isDateInRelevantMonthRange,
    getMonthKey,
  } = useDashboardData();

  // Define the internal handleDayClick implementation with the shouldScroll parameter
  const handleDayClickInternal = useCallback((
    date: Date, 
    classes: ClassSession[], 
    paymentsDue: any[], // Use any[] to avoid type errors
    shouldScroll: boolean = true
  ) => {
    // Don't reset selected date if it's the same date
    if (!selectedDayDetails || selectedDayDetails.date.getTime() !== date.getTime()) {
      setSelectedDate(date);
    }
    
    const monthKey = getMonthKey(date);
    const materialsAlreadyLoaded = loadedMaterialMonths.has(monthKey);
    
    // Get birthdays for the selected date
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const dateString = `${month}-${day}`;
    const birthdays = users.filter(user => user.birthdate === dateString);
    
    // Debug log the original classes
    console.log('handleDayClickInternal - Original classes:', classes.map(c => ({ 
      id: c.id, 
      studentEmails: c.studentEmails ? c.studentEmails.length : 0,
      studentEmailsData: c.studentEmails 
    })));
    
    // Ensure that the dayOfWeek property of each class matches the day of the week of the selected date
    const selectedDayOfWeek = date.getDay();
    const updatedClasses = classes.map(classSession => {
      // Create a new object to avoid mutating the original
      const updatedClass = { ...classSession };
      
      // Set the dayOfWeek to match the selected date
      updatedClass.dayOfWeek = selectedDayOfWeek;
      
      // For classes with multiple schedules, find the matching schedule
      if (updatedClass.scheduleType === 'multiple' && Array.isArray(updatedClass.schedules)) {
        const matchingSchedule = updatedClass.schedules.find(schedule => 
          schedule.dayOfWeek === selectedDayOfWeek
        );
        
        // If a matching schedule is found, update the startTime and endTime
        if (matchingSchedule) {
          updatedClass.startTime = matchingSchedule.startTime;
          updatedClass.endTime = matchingSchedule.endTime;
        }
      }
      
      return updatedClass;
    });
    
    const fetchMaterials = async () => {
      const materialsMap: Record<string, ClassMaterial[]> = {};
      
      for (const classSession of updatedClasses) {
        try {
          const materials = await getClassMaterials(classSession.id, date);
          
          if (materials.length > 0) {
            materialsMap[classSession.id] = materials;
          }
        } catch (error) {
          console.error('Error fetching materials for class:', classSession.id, error);
        }
      }
      
      if (!materialsAlreadyLoaded) {
        const updatedLoadedMaterialMonths = new Set(loadedMaterialMonths);
        updatedLoadedMaterialMonths.add(monthKey);
        setLoadedMaterialMonths(updatedLoadedMaterialMonths);
      }
      
      setSelectedDayDetails({
        date,
        classes: updatedClasses,
        paymentsDue: paymentsDue,
        materials: materialsMap,
        birthdays
      });
    };

    // Set initial state immediately with empty materials
    setSelectedDayDetails({
      date,
      classes: updatedClasses,
      paymentsDue: paymentsDue,
      materials: selectedDayDetails?.materials || {},
      birthdays
    });

    // Then fetch materials asynchronously
    fetchMaterials();

    // Only scroll to details section if shouldScroll is true (user clicked on a day)
    if (shouldScroll && detailsRef.current) {
      setTimeout(() => {
        // Calculate the position to scroll to
        const detailsElement = detailsRef.current;
        if (detailsElement) {
          const detailsRect = detailsElement.getBoundingClientRect();
          const detailsBottom = detailsRect.bottom;
          const viewportHeight = window.innerHeight;
          const scrollPosition = window.scrollY + detailsBottom - viewportHeight;
          
          // Scroll to position that aligns the bottom of the details section with the bottom of the viewport
          window.scrollTo({
            top: scrollPosition,
            behavior: 'smooth'
          });
        }
      }, 100);
    }
  }, [
    selectedDayDetails, 
    setSelectedDate, 
    getMonthKey, 
    loadedMaterialMonths, 
    users, 
    upcomingClasses, 
    isDateInRelevantMonthRange, 
    setLoadedMaterialMonths, 
    setSelectedDayDetails
  ]);

  // Create a wrapper function that matches the expected signature for CalendarSection
  const handleDayClick = useCallback((
    date: Date, 
    classes: ClassSession[], 
    paymentsDue: any[] // Use any[] to avoid type errors
  ) => {
    // Debug logging to check the classes data
    console.log('Day clicked - classes:', classes.map(c => ({ 
      id: c.id, 
      studentEmails: c.studentEmails,
      studentIds: c.studentIds,
      students: c.students 
    })));
    
    // Call the internal implementation with shouldScroll=true for user clicks
    handleDayClickInternal(date, classes, paymentsDue, true);
  }, [handleDayClickInternal]);

  // Add a specific effect to handle initial data loading after auth and admin status are determined
  useEffect(() => {
    if (!authLoading && !adminLoading && currentUser && !initialDataFetched && !isFetchingRef.current) {
      debugLog('Dashboard - Initial data fetch triggered');
      isFetchingRef.current = true;
      fetchClasses(new Date(), true).finally(() => {
        isFetchingRef.current = false;
      });
      setInitialDataFetched(true);
    }
  }, [authLoading, adminLoading, currentUser, initialDataFetched, fetchClasses]);

  // Add a new effect to select the current day by default after classes are loaded, but don't scroll
  useEffect(() => {
    // Only proceed if we have loaded classes and no day is currently selected
    if (upcomingClasses.length > 0 && !selectedDayDetails) {
      const today = new Date();
      const todayDayOfWeek = today.getDay();
      
      // Get classes for today
      const classesForToday = getClassesForDay(todayDayOfWeek, today);
      
      // If there are classes for today, select today but don't scroll
      if (classesForToday.length > 0) {
        debugLog('Selecting current day by default without scrolling');
        const paymentsDueForToday = getPaymentsDueForDay(today, upcomingClasses, users, isDateInRelevantMonthRange);
        // Call the internal implementation directly with shouldScroll=false
        handleDayClickInternal(today, classesForToday, paymentsDueForToday, false);
      }
    }
  }, [upcomingClasses, selectedDayDetails, getClassesForDay, handleDayClickInternal, users, isDateInRelevantMonthRange]);

  // Track navigation to/from dashboard
  useEffect(() => {
    const currentPath = location.pathname;
    
    // If we're coming back to the dashboard from another page
    if (currentPath === '/dashboard' && prevPathRef.current && prevPathRef.current !== '/dashboard' && !isFetchingRef.current) {
      debugLog('Returning to dashboard from another page');
      isFetchingRef.current = true;
      fetchClasses(selectedDate, false).finally(() => {
        isFetchingRef.current = false;
      });
      setLastVisitTimestamp(Date.now());
    }
    
    prevPathRef.current = currentPath;
  }, [location.pathname, fetchClasses, selectedDate]);

  // Handle page visibility changes (tab switching, etc.)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isFetchingRef.current) {
        const now = Date.now();
        // If it's been more than 5 minutes since last visit, refresh data
        if (now - lastVisitTimestamp > 5 * 60 * 1000) {
          debugLog('Page became visible after extended absence, refreshing data');
          isFetchingRef.current = true;
          fetchClasses(selectedDate, false).finally(() => {
            isFetchingRef.current = false;
          });
          setLastVisitTimestamp(now);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchClasses, lastVisitTimestamp, selectedDate]);

  // Add resize event listener to update mobile view state
  useEffect(() => {
    const handleResize = () => {
      const newIsMobileView = window.innerWidth < 768;
      
      if (newIsMobileView !== isMobileView) {
        setUpcomingClassesPage(0);
        setPastClassesPage(0);
        setIsMobileView(newIsMobileView);
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isMobileView]);

  const handleMonthChange = (newDate: Date) => {
    // Only update the selected date and fetch classes if the month or year has changed
    const currentMonth = selectedDate.getMonth();
    const currentYear = selectedDate.getFullYear();
    const newMonth = newDate.getMonth();
    const newYear = newDate.getFullYear();
    
    if (currentMonth !== newMonth || currentYear !== newYear) {
      debugLog(`Month changed from ${currentMonth}/${currentYear} to ${newMonth}/${newYear}`);
      setSelectedDate(newDate);
      
      // Check if we've already loaded this month
      const monthKey = getMonthKey(newDate);
      if (!loadedMonths.has(monthKey) && !isFetchingRef.current) {
        debugLog(`Month ${monthKey} not loaded yet, fetching data`);
        isFetchingRef.current = true;
        fetchClasses(newDate, false).finally(() => {
          isFetchingRef.current = false;
        });
      } else {
        debugLog(`Month ${monthKey} already loaded, skipping fetch`);
      }
    } else {
      // If only the day changed, just update the selected date
      setSelectedDate(newDate);
    }
  };

  const handleEditNotes = useCallback((classSession: ClassSession) => {
    handleEditNotesUtil(
      classSession,
      {
        editingNotes,
        savingNotes,
        textareaRefs: textareaRefs.current,
        editingPrivateNotes,
        savingPrivateNotes
      },
      setEditingNotes
    );
  }, [editingNotes, savingNotes, editingPrivateNotes, savingPrivateNotes]);

  const handleEditPrivateNotes = useCallback((classSession: ClassSession) => {
    handleEditNotesUtil(
      classSession,
      {
        editingNotes,
        savingNotes,
        textareaRefs: textareaRefs.current,
        editingPrivateNotes,
        savingPrivateNotes
      },
      setEditingPrivateNotes,
      true
    );
  }, [editingNotes, savingNotes, editingPrivateNotes, savingPrivateNotes]);

  const handleSaveNotes = useCallback(async (classSession: ClassSession) => {
    if (!currentUser) return;
    
    await handleSaveNotesUtil({
      classSession,
      state: {
        editingNotes,
        savingNotes,
        textareaRefs: textareaRefs.current,
        editingPrivateNotes,
        savingPrivateNotes
      },
      setState: (updates) => {
        if ('editingNotes' in updates) {
          setEditingNotes(updates.editingNotes || {});
        }
        if ('savingNotes' in updates) {
          setSavingNotes(updates.savingNotes || {});
        }
      },
      currentUser,
      selectedDayDetails,
      setSelectedDayDetails,
      upcomingClasses,
      pastClasses,
      setUpcomingClasses,
      setPastClasses
    });
  }, [currentUser, editingNotes, savingNotes, editingPrivateNotes, savingPrivateNotes, selectedDayDetails, upcomingClasses, pastClasses, setSelectedDayDetails, setUpcomingClasses, setPastClasses]);

  const handleSavePrivateNotes = useCallback(async (classSession: ClassSession) => {
    if (!currentUser) return;
    
    await handleSaveNotesUtil({
      classSession,
      state: {
        editingNotes,
        savingNotes,
        textareaRefs: textareaRefs.current,
        editingPrivateNotes,
        savingPrivateNotes
      },
      setState: (updates) => {
        if ('editingPrivateNotes' in updates) {
          setEditingPrivateNotes(updates.editingPrivateNotes || {});
        }
        if ('savingPrivateNotes' in updates) {
          setSavingPrivateNotes(updates.savingPrivateNotes || {});
        }
      },
      currentUser,
      selectedDayDetails,
      setSelectedDayDetails,
      upcomingClasses,
      pastClasses,
      setUpcomingClasses,
      setPastClasses,
      isPrivate: true
    });
  }, [currentUser, editingNotes, savingNotes, editingPrivateNotes, savingPrivateNotes, selectedDayDetails, upcomingClasses, pastClasses, setSelectedDayDetails, setUpcomingClasses, setPastClasses]);

  const handleCancelEditNotes = useCallback((classId: string) => {
    handleCancelEditNotesUtil(
      classId,
      {
        editingNotes,
        savingNotes,
        textareaRefs: textareaRefs.current,
        editingPrivateNotes,
        savingPrivateNotes
      },
      setEditingNotes
    );
  }, [editingNotes, savingNotes, editingPrivateNotes, savingPrivateNotes]);

  const handleCancelEditPrivateNotes = useCallback((classId: string) => {
    handleCancelEditNotesUtil(
      classId,
      {
        editingNotes,
        savingNotes,
        textareaRefs: textareaRefs.current,
        editingPrivateNotes,
        savingPrivateNotes
      },
      setEditingPrivateNotes,
      true
    );
  }, [editingNotes, savingNotes, editingPrivateNotes, savingPrivateNotes]);

  const handleDeleteMaterial = async (
    material: ClassMaterial,
    index: number,
    classId: string,
    type: 'slides' | 'link' = 'slides',
    itemIndex?: number
  ) => {
    await deleteMaterial({
      material,
      index,
      classId,
      type,
      itemIndex,
      currentUser,
      isAdmin,
      state: {
        classMaterials,
        deletingMaterial,
        loadedMaterialMonths
      },
      setState: (updates: Partial<MaterialsState>) => {
        if (updates.classMaterials) setClassMaterials(updates.classMaterials);
        if (updates.deletingMaterial) setDeletingMaterial(updates.deletingMaterial);
        if (updates.loadedMaterialMonths) setLoadedMaterialMonths(updates.loadedMaterialMonths);
      },
      selectedDayDetails,
      setSelectedDayDetails,
      upcomingClasses,
      pastClasses,
      setUpcomingClasses,
      setPastClasses
    });
  };

  const handleOpenUploadForm = (classId: string) => {
    setVisibleUploadForm(classId);
  };

  const handleCloseUploadForm = async () => {
    // If we have a visible upload form (meaning a class ID), refresh the materials for that class
    if (visibleUploadForm && selectedDayDetails) {
      try {
        debugLog('closeModal - Starting refresh of materials');
        debugLog('visibleUploadForm: ' + visibleUploadForm);
        
        // Extract the actual class ID from the combined format (classId-timestamp)
        const actualClassId = visibleUploadForm.includes('-') 
          ? visibleUploadForm.split('-')[0] 
          : visibleUploadForm;
        
        // Fetch updated materials for this class without date filtering
        const updatedMaterials = await getClassMaterials(actualClassId);
        debugMaterials(actualClassId, updatedMaterials, 'updatedMaterials');
        
        // Update the materials in the selectedDayDetails
        const updatedMaterialsMap = {
          ...selectedDayDetails.materials,
          [actualClassId]: updatedMaterials
        };
        
        // Update the selected day details with the new materials
        setSelectedDayDetails({
          ...selectedDayDetails,
          materials: updatedMaterialsMap
        });
        
        // Update the class materials state
        setClassMaterials({
          ...classMaterials,
          [actualClassId]: updatedMaterials
        });
        
        // Update the upcoming classes with the new materials
        const updatedUpcomingClasses = upcomingClasses.map(c => 
          c.id === actualClassId 
            ? { ...c, materials: updatedMaterials } 
            : c
        );
        debugLog('Updated upcoming classes with materials');
        setUpcomingClasses(updatedUpcomingClasses);
        
        // Update the past classes with the new materials
        const updatedPastClasses = pastClasses.map(c => 
          c.id === actualClassId 
            ? { ...c, materials: updatedMaterials } 
            : c
        );
        debugLog('Updated past classes with materials');
        setPastClasses(updatedPastClasses);
        
        // Invalidate the loaded material months to force a refresh on next load
        const monthKey = getMonthKey(selectedDayDetails.date);
        const updatedLoadedMaterialMonths = new Set(loadedMaterialMonths);
        updatedLoadedMaterialMonths.delete(monthKey); // Remove this month to force refresh on next load
        setLoadedMaterialMonths(updatedLoadedMaterialMonths);
        
      } catch (error) {
        console.error('Error refreshing materials after upload:', error);
      }
    }
    
    // Close the modal
    setVisibleUploadForm(null);
  };

  const handleUpcomingClassesPagination = (newPage: number) => {
    setUpcomingClassesPage(newPage);
  };

  const handlePastClassesPagination = (newPage: number) => {
    setPastClassesPage(newPage);
  };

  const formatStudentNames = (studentEmails: string[]) => {
    // Return a default if studentEmails is null or empty
    if (!studentEmails || studentEmails.length === 0) {
      return t.class || 'Class';
    }
    
    const names = studentEmails.map(email => userNames[email] || email);

    if (names.length === 1) return names[0];
    if (names.length === 2) return `${t.pair}: ${names.join(' & ')}`;
    return `${t.group}: ${names.join(', ')}`;
  };

  const formatClassTime = (classSession: ClassSession) => {
    // For classes with multiple schedules, find the matching schedule for the day of week
    let startTime = classSession.startTime;
    let endTime = classSession.endTime;
    
    if (classSession.scheduleType === 'multiple' && Array.isArray(classSession.schedules) && classSession.dayOfWeek !== undefined) {
      const matchingSchedule = classSession.schedules.find(schedule => 
        schedule.dayOfWeek === classSession.dayOfWeek
      );
      
      if (matchingSchedule) {
        startTime = matchingSchedule.startTime;
        endTime = matchingSchedule.endTime;
      }
    }
    
    if (classSession.dayOfWeek !== undefined && startTime && endTime) {
      const timezone = new Intl.DateTimeFormat('en', {
        timeZoneName: 'short',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }).formatToParts(new Date())
        .find(part => part.type === 'timeZoneName')?.value || '';

      const formatTimeString = (timeStr: string) => {
        if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
        const [hours, minutes] = timeStr.split(':').map(Number);
        const period = hours >= 12 ? 'PM' : 'AM';
        const hour12 = hours % 12 || 12;
        return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
      };

      const formattedStartTime = formatTimeString(startTime);
      const formattedEndTime = formatTimeString(endTime);

      return `${formattedStartTime} - ${formattedEndTime} ${timezone}`;
    }
    return '';
  };

  const formatClassDate = (date: Date | null): string => {
    if (!date) return '';
    
    return date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  };

  const getNextClassDate = (classSession: ClassSession): Date | null => {
    if (!classSession.dayOfWeek && classSession.dayOfWeek !== 0) return null;
    
    const today = new Date();
    const currentDayOfWeek = today.getDay();
    const targetDayOfWeek = classSession.dayOfWeek;
    
    let daysUntilNext = targetDayOfWeek - currentDayOfWeek;
    if (daysUntilNext <= 0) {
      daysUntilNext += 7;
    }
    
    if (daysUntilNext === 0 && classSession.startTime) {
      const [hours, minutes] = classSession.startTime.split(':');
      let hour = parseInt(hours);
      if (classSession.startTime.toLowerCase().includes('pm') && hour !== 12) {
        hour += 12;
      } else if (classSession.startTime.toLowerCase().includes('am') && hour === 12) {
        hour = 0;
      }
      
      const classTime = new Date();
      classTime.setHours(hour, parseInt(minutes), 0, 0);
      
      if (today > classTime) {
        daysUntilNext = 7;
      }
    }
    
    const nextDate = new Date();
    nextDate.setDate(today.getDate() + daysUntilNext);
    nextDate.setHours(0, 0, 0, 0);
    
    return nextDate;
  };
  
  const getPreviousClassDate = (classSession: ClassSession): Date | null => {
    if (!classSession.dayOfWeek && classSession.dayOfWeek !== 0) return null;
    
    const today = new Date();
    const currentDayOfWeek = today.getDay();
    const targetDayOfWeek = classSession.dayOfWeek;
    
    let daysSinceLast = currentDayOfWeek - targetDayOfWeek;
    if (daysSinceLast < 0) {
      daysSinceLast += 7;
    }
    
    if (daysSinceLast === 0 && classSession.startTime) {
      const [hours, minutes] = classSession.startTime.split(':');
      let hour = parseInt(hours);
      if (classSession.startTime.toLowerCase().includes('pm') && hour !== 12) {
        hour += 12;
      } else if (classSession.startTime.toLowerCase().includes('am') && hour === 12) {
        hour = 0;
      }
      
      const classTime = new Date();
      classTime.setHours(hour, parseInt(minutes), 0, 0);
      
      if (today < classTime) {
        daysSinceLast = 7;
      }
    }
    
    const prevDate = new Date();
    prevDate.setDate(today.getDate() - daysSinceLast);
    prevDate.setHours(0, 0, 0, 0);
    
    return prevDate;
  };

  const handlePaymentStatusChange = useCallback((date: Date) => {
    // Force refresh of the calendar by clearing the previous month reference
    // This will trigger a re-fetch of payments for the current month
    const monthKey = getMonthKey(date);
    const loadedMonthsCopy = new Set(loadedMonths);
    loadedMonthsCopy.delete(monthKey);
    
    // Re-fetch classes and payments for the current month
    fetchClasses(date, false);
    
    // Force a refresh of the calendar by setting a new date object with the same value
    // This will trigger the useEffect in CalendarSection to re-fetch payments
    setSelectedDate(new Date(date));
    
    // If we have selected day details, refresh them too
    if (selectedDayDetails && selectedDayDetails.date.getTime() === date.getTime()) {
      // Get updated payment due information
      const updatedPaymentsDue = getPaymentsDueForDay(date, upcomingClasses, users, isDateInRelevantMonthRange);
      
      // Update the selected day details with the updated payments
      setSelectedDayDetails({
        ...selectedDayDetails,
        paymentsDue: updatedPaymentsDue
      });
    }
  }, [fetchClasses, getMonthKey, loadedMonths, selectedDayDetails, upcomingClasses, users, isDateInRelevantMonthRange, setSelectedDate, setSelectedDayDetails]);

  // Add a function to fetch homework for a class and update the state
  const fetchHomeworkForClass = async (classId: string) => {
    try {
      const baseClassId = classId.split('-')[0]; // Extract base class ID in case we have a dated class ID
      const homework = await getHomeworkForClass(baseClassId);
      
      setHomeworkByClassId(prevState => ({
        ...prevState,
        [baseClassId]: homework
      }));
      
      // Also store it under the original class ID to make lookup easier
      if (baseClassId !== classId) {
        setHomeworkByClassId(prevState => ({
          ...prevState,
          [classId]: homework
        }));
      }
      
      return homework;
    } catch (error) {
      console.error(`Error fetching homework for class ${classId}:`, error);
      return [];
    }
  };
  
  // Function to refresh all homework data
  const refreshAllHomework = async () => {
    console.log('Dashboard: Refreshing all homework data');
    
    try {
      // First, collect all unique class IDs that we need to fetch homework for
      const uniqueClassIds = new Set<string>();
      
      // Add class IDs from upcoming classes
      upcomingClasses.forEach(classSession => {
        uniqueClassIds.add(classSession.id);
      });
      
      // Add class IDs from past classes
      pastClasses.forEach(classSession => {
        uniqueClassIds.add(classSession.id);
      });
      
      // If we have selected day details with classes, add those too
      if (selectedDayDetails && selectedDayDetails.classes) {
        selectedDayDetails.classes.forEach(classSession => {
          uniqueClassIds.add(classSession.id);
        });
      }
      
      // Fetch homework for all unique class IDs
      const fetchPromises = Array.from(uniqueClassIds).map(classId => 
        fetchHomeworkForClass(classId)
      );
      
      await Promise.all(fetchPromises);
      console.log('Dashboard: All homework refreshed successfully');
    } catch (error) {
      console.error('Error refreshing homework:', error);
    }
  };
  
  // Set up homework change listener
  useEffect(() => {
    // Fetch homework data initially
    refreshAllHomework();
    
    // Subscribe to homework changes
    const unsubscribe = subscribeToHomeworkChanges((updatedClassId) => {
      console.log(`Dashboard: Received homework change notification for class ${updatedClassId}`);
      
      if (updatedClassId) {
        // If we have a specific class ID, just refresh that one
        fetchHomeworkForClass(updatedClassId);
      } else {
        // Otherwise refresh all homework
        refreshAllHomework();
      }
    });
    
    // Clean up subscription
    return () => unsubscribe();
  }, [upcomingClasses, pastClasses]); // Re-run when the classes change

  // Show loading state if auth or admin status is still loading
  if (authLoading || adminLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const DashboardContent = () => (
    <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h1 className={styles.headings.h1}>{t.home}</h1>
        </div>
      </div>
      
      {/* Calendar and Day details section - side by side on desktop */}
      <div className="mt-8 lg:grid lg:grid-cols-[2fr,1fr] lg:gap-8">
        {/* Calendar section */}
        <div>
          <CalendarSection
            selectedDate={selectedDate}
            upcomingClasses={upcomingClasses}
            onMonthChange={handleMonthChange}
            onDayClick={handleDayClick}
            isDateInRelevantMonthRange={isDateInRelevantMonthRange}
            getClassesForDay={getClassesForDay}
            users={users}
          />
        </div>
        
        {/* Day details section */}
        <div ref={detailsRef} className="mt-8 lg:mt-0">
          {selectedDayDetails ? (
            <DayDetails
              selectedDayDetails={selectedDayDetails}
              setSelectedDayDetails={setSelectedDayDetails}
              isAdmin={isAdmin}
              editingNotes={editingNotes}
              savingNotes={savingNotes}
              editingPrivateNotes={editingPrivateNotes}
              savingPrivateNotes={savingPrivateNotes}
              deletingMaterial={deletingMaterial}
              formatClassTime={formatClassTime}
              formatStudentNames={formatStudentNames}
              onEditNotes={handleEditNotes}
              onSaveNotes={handleSaveNotes}
              onCancelEditNotes={handleCancelEditNotes}
              onEditPrivateNotes={handleEditPrivateNotes}
              onSavePrivateNotes={handleSavePrivateNotes}
              onCancelEditPrivateNotes={handleCancelEditPrivateNotes}
              onDeleteMaterial={handleDeleteMaterial}
              onOpenUploadForm={handleOpenUploadForm}
              onCloseUploadForm={handleCloseUploadForm}
              visibleUploadForm={visibleUploadForm}
              textareaRefs={textareaRefs.current}
              onPaymentStatusChange={handlePaymentStatusChange}
              homeworkByClassId={homeworkByClassId}
              refreshHomework={refreshAllHomework}
            />
          ) : (
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <h2 className={styles.headings.h2}>{'Select a day'}</h2>
              <p className="text-gray-500 mt-2">{'Click on a day in the calendar to view details'}</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Classes section - at the bottom */}
      <div className="mt-8 pt-8 border-t-4 border-gray-200 lg:grid lg:grid-cols-2 lg:gap-8 lg:border-t-0 lg:pt-0">
        <ClassesSection
          upcomingClasses={upcomingClasses}
          pastClasses={pastClasses}
          classMaterials={classMaterials}
          editingNotes={editingNotes}
          savingNotes={savingNotes}
          editingPrivateNotes={editingPrivateNotes}
          savingPrivateNotes={savingPrivateNotes}
          deletingMaterial={deletingMaterial}
          isAdmin={isAdmin}
          isMobileView={isMobileView}
          upcomingClassesPage={upcomingClassesPage}
          pastClassesPage={pastClassesPage}
          formatClassTime={formatClassTime}
          formatClassDate={formatClassDate}
          formatStudentNames={formatStudentNames}
          getNextClassDate={getNextClassDate}
          getPreviousClassDate={getPreviousClassDate}
          onEditNotes={handleEditNotes}
          onSaveNotes={handleSaveNotes}
          onCancelEditNotes={handleCancelEditNotes}
          onEditPrivateNotes={handleEditPrivateNotes}
          onSavePrivateNotes={handleSavePrivateNotes}
          onCancelEditPrivateNotes={handleCancelEditPrivateNotes}
          onDeleteMaterial={handleDeleteMaterial}
          onOpenUploadForm={handleOpenUploadForm}
          onCloseUploadForm={handleCloseUploadForm}
          visibleUploadForm={visibleUploadForm}
          textareaRefs={textareaRefs.current}
          onUpcomingClassesPageChange={handleUpcomingClassesPagination}
          onPastClassesPageChange={handlePastClassesPagination}
          selectedDate={selectedDate}
          homeworkByClassId={homeworkByClassId}
          refreshHomework={refreshAllHomework}
          t={{
            upcomingClasses: t.upcomingClasses,
            pastClasses: t.pastClasses,
            noUpcomingClasses: t.noUpcomingClasses,
            noPastClasses: t.noPastClasses,
            addNotes: t.edit,
            addPrivateNotes: t.edit,
            materials: t.materials,
            addMaterials: t.addMaterials,
            slides: t.slides,
            link: t.add,
            previous: t.previous,
            next: t.next,
            notes: t.notes,
            notesInfo: t.notesInfo,
            cancel: t.cancel,
            noNotes: t.noNotes,
            edit: t.edit,
            privateNotes: t.privateNotes,
            privateNotesInfo: t.privateNotesInfo
          }}
        />
      </div>
      
      {/* Homework section - only show for non-admin users */}
      {!isAdmin && currentUser && currentUser.email && (
        <div className="mt-8 pt-8 border-t-4 border-gray-200">
          <StudentHomework studentEmail={currentUser.email} />
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-transparent">
      {authLoading || adminLoading ? (
        <div className="flex justify-center items-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <div className="relative z-1">
          <DashboardContent />
        </div>
      )}
    </div>
  );
}; 
