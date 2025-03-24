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
import { ClassMaterial, Homework, User } from '../types/interfaces';
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
import { getPaymentsDueForDay } from '../utils/paymentUtils';
import { StudentHomework } from '../components/StudentHomework';
import { getHomeworkForClass, subscribeToHomeworkChanges } from '../utils/homeworkUtils';
import { getBaseClassId } from '../utils/scheduleUtils';
import { toast } from 'react-hot-toast';
import { formatTimeWithTimezones } from '../utils/dateUtils';

export const Dashboard = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
  const [editingNotes, setEditingNotes] = useState<{ [classId: string]: string }>({});
  const [savingNotes, setSavingNotes] = useState<{ [classId: string]: boolean }>({});
  const [editingPrivateNotes, setEditingPrivateNotes] = useState<{ [classId: string]: string }>({});
  const [savingPrivateNotes, setSavingPrivateNotes] = useState<{ [classId: string]: boolean }>({});
  const [deletingMaterial, setDeletingMaterial] = useState<{ [materialId: string]: boolean }>({});
  const [visibleUploadForm, setVisibleUploadForm] = useState<string | null>(null);
  const [upcomingClassesPage, setUpcomingClassesPage] = useState(0);
  const [pastClassesPage, setPastClassesPage] = useState(0);
  const [initialDataFetched, setInitialDataFetched] = useState(false);
  const [lastVisitTimestamp, setLastVisitTimestamp] = useState<number>(Date.now());
  const prevPathRef = useRef<string | null>(null);
  const isFetchingRef = useRef<boolean>(false);

  const [homeworkByClassId, setHomeworkByClassId] = useState<Record<string, Homework[]>>({});
  const lastHomeworkFetchRef = useRef<number>(0);

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
        // For classes with multiple schedules, use the base class ID to fetch materials
        const baseClassId = getBaseClassId(classSession.id);

        // Fetch materials for this class using the base class ID
        const materials = await getClassMaterials(baseClassId, date);

        if (materials.length > 0) {
          // Store materials by the original class ID for consistency in the UI
          materialsMap[classSession.id] = materials;
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

    // Only scroll to details section if shouldScroll is true (user clicked on a day) AND we're on mobile
    if (shouldScroll && detailsRef.current && window.innerWidth < 768) {
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
    paymentsDue: { user: User; classSession: ClassSession; }[]
  ) => {
    setSelectedDate(date);
    setSelectedDayDetails({
      date,
      classes,
      paymentsDue,
      materials: {},
      birthdays: []
    });

    // Check if screen is in mobile layout (details below calendar)
    if (window.innerWidth < 1280) { // xl breakpoint
      // Scroll the details section into view with smooth behavior
      detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Add a specific effect to handle initial data loading after auth and admin status are determined
  useEffect(() => {
    if (!authLoading && !adminLoading && currentUser && !initialDataFetched && !isFetchingRef.current) {
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
      setSelectedDate(newDate);

      // Check if we've already loaded this month
      const monthKey = getMonthKey(newDate);
      if (!loadedMonths.has(monthKey) && !isFetchingRef.current) {
        isFetchingRef.current = true;
        fetchClasses(newDate, false).finally(() => {
          isFetchingRef.current = false;
        });
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

  // Add a listener for 'materials-updated' events to ensure we catch all materials updates
  useEffect(() => {
    // Use a debounce mechanism to prevent multiple refreshes in quick succession
    let refreshTimeoutId: NodeJS.Timeout | null = null;
    let pendingClassIds = new Set<string>();

    const debounceRefresh = (classId: string) => {
      // Add the classId to the pending set
      pendingClassIds.add(classId);

      // Clear any existing timeout
      if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
      }

      // Set a new timeout to do the actual refresh after a delay
      refreshTimeoutId = setTimeout(() => {

        // If we have any pending classIds, refresh the first one
        // The refresh will capture all related class IDs anyway
        if (pendingClassIds.size > 0) {
          const firstClassId = Array.from(pendingClassIds)[0];

          // Temporarily set the visibleUploadForm to trigger the refresh
          setVisibleUploadForm(firstClassId);

          // Run the refresh after a small delay to ensure state has updated
          setTimeout(() => {
            refreshMaterialsForClass();
            // Clear the pending set after refresh
            pendingClassIds.clear();
          }, 50);
        }
      }, 300); // 300ms debounce time
    };

    const handleMaterialsUpdated = (event: CustomEvent) => {
      const { classId } = event.detail;

      if (!classId) {
        return;
      }

      debounceRefresh(classId);
    };

    // Add the event listener
    window.addEventListener('materials-updated', handleMaterialsUpdated as EventListener);

    // Clean up
    return () => {
      window.removeEventListener('materials-updated', handleMaterialsUpdated as EventListener);
      if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
      }
    };
  }, []);

  // Renamed function to be more accurate about what it does
  const refreshMaterialsForClass = async (retryCount = 0) => {
    // If we have a visible upload form (meaning a class ID), refresh the materials for that class
    if (!visibleUploadForm) {
      return;
    }

    if (!selectedDayDetails) {
      // Close the modal if it's open
      setVisibleUploadForm(null);
      return;
    }

    try {
      // Extract the actual class ID from the combined format (classId-timestamp)
      const classIdWithPossibleTimestamp = visibleUploadForm.includes('-')
        ? visibleUploadForm.split('-')[0]
        : visibleUploadForm;

      // For classes with multiple schedules, the ID might still have a day suffix (e.g., "baseId-1")
      // Extract the base class ID for consistency
      const baseClassId = getBaseClassId(classIdWithPossibleTimestamp);

      // Use the base class ID to fetch materials, but we'll store by the original ID
      const actualClassId = classIdWithPossibleTimestamp;

      // Fetch updated materials for this class without date filtering
      let updatedMaterials;
      try {
        updatedMaterials = await getClassMaterials(baseClassId);
      } catch (fetchError) {

        // If we've had fewer than 2 retries, try again
        if (retryCount < 2) {
          setTimeout(() => refreshMaterialsForClass(retryCount + 1), 500);
          return;
        } else {
          throw new Error(`Failed to fetch materials after ${retryCount + 1} attempts`);
        }
      }

      // Make sure all materials have an id for tracking
      const materialsWithIds = updatedMaterials.map(material =>
        material.id ? material : { ...material, id: Math.random().toString(36).substring(2) }
      );

      // Use batched state updates to reduce the number of renders
      const batchStateUpdates = () => {
        // ============== STEP 1: Find all class IDs that need updates ==============
        // Find all class IDs that should be updated (original and any variants)
        const classIdsToUpdate = [
          actualClassId,
          baseClassId,
          ...upcomingClasses.map(c => c.id).filter(id => id.startsWith(baseClassId)),
          ...pastClasses.map(c => c.id).filter(id => id.startsWith(baseClassId))
        ];

        const uniqueClassIdsToUpdate = [...new Set(classIdsToUpdate)];

        // ============== STEP 2: Update the materials map ==============
        // Create updated materials map for selectedDayDetails
        const updatedMaterialsMap = {
          ...selectedDayDetails.materials
        };

        // Add materials for all relevant class IDs
        uniqueClassIdsToUpdate.forEach(id => {
          updatedMaterialsMap[id] = materialsWithIds;
        });

        // ============== STEP 3: Update class objects with materials ==============
        // Update selectedDayDetails classes with materials
        const updatedSelectedDayClasses = selectedDayDetails.classes.map(c => {
          if (uniqueClassIdsToUpdate.includes(c.id)) {
            return {
              ...c,
              materials: materialsWithIds
            };
          }
          return c;
        });

        // Update upcoming classes with materials
        const updatedUpcomingClasses = upcomingClasses.map(c => {
          if (uniqueClassIdsToUpdate.includes(c.id)) {
            const updatedClass = {
              ...c,
              materials: materialsWithIds
            };
            return updatedClass;
          }
          return c;
        });

        // Update past classes with materials
        const updatedPastClasses = pastClasses.map(c => {
          if (uniqueClassIdsToUpdate.includes(c.id)) {
            const updatedClass = {
              ...c,
              materials: materialsWithIds
            };
            return updatedClass;
          }
          return c;
        });

        // ============== STEP 4: Update global class materials state ==============
        // Update the global classMaterials state
        const updatedClassMaterials = { ...classMaterials };

        // Add materials for all relevant class IDs
        uniqueClassIdsToUpdate.forEach(id => {
          updatedClassMaterials[id] = materialsWithIds;
        });

        // ============== STEP 5: Batch all state updates together ==============
        // Batch all state updates in a single React cycle to minimize renders
        // React will batch these updates when they're called synchronously
        setSelectedDayDetails({
          ...selectedDayDetails,
          materials: updatedMaterialsMap,
          classes: updatedSelectedDayClasses
        });
        setClassMaterials(updatedClassMaterials);
        setUpcomingClasses(updatedUpcomingClasses);
        setPastClasses(updatedPastClasses);

        // ============== STEP 6: Invalidate cache for future loads ==============
        // Invalidate the loaded material months to force a refresh on next load
        const monthKey = getMonthKey(selectedDayDetails.date);
        const updatedLoadedMaterialMonths = new Set(loadedMaterialMonths);
        updatedLoadedMaterialMonths.delete(monthKey); // Remove this month to force refresh on next load
        setLoadedMaterialMonths(updatedLoadedMaterialMonths);
      };

      // Execute the batch update
      batchStateUpdates();

    } catch (error) {
      // Show an error toast to the user
      toast.error('Failed to refresh materials. Please try again.');
    } finally {
      // Close the modal if it's open
      setVisibleUploadForm(null);
    }
  };

  // Simple wrapper for backward compatibility
  const handleCloseUploadForm = () => {
    refreshMaterialsForClass();
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

  // Function to format class time, converting from class timezone to user timezone
  const formatClassTime = (classSession: ClassSession) => {
    if (!classSession) return '';

    let startTime = '';
    let endTime = '';
    let timezone = classSession.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    // For classes with multiple schedules, find the matching schedule for the day of week
    if (classSession.scheduleType === 'multiple' && Array.isArray(classSession.schedules) && classSession.schedules.length > 0) {
      // If dayOfWeek is provided, find the matching schedule
      if (classSession.dayOfWeek !== undefined) {
        const matchingSchedule = classSession.schedules.find(schedule =>
          schedule.dayOfWeek === classSession.dayOfWeek
        );

        if (matchingSchedule) {
          startTime = matchingSchedule.startTime;
          endTime = matchingSchedule.endTime;
          // Use schedule timezone if available
          if (matchingSchedule.timezone) {
            timezone = matchingSchedule.timezone;
          }
        } else {
          // If no matching schedule found, use the first schedule
          startTime = classSession.schedules[0].startTime;
          endTime = classSession.schedules[0].endTime;
          if (classSession.schedules[0].timezone) {
            timezone = classSession.schedules[0].timezone;
          }
        }
      } else {
        // If no dayOfWeek specified, use the first schedule
        startTime = classSession.schedules[0].startTime;
        endTime = classSession.schedules[0].endTime;
        if (classSession.schedules[0].timezone) {
          timezone = classSession.schedules[0].timezone;
        }
      }
    }
    // For single schedule classes
    else if (classSession.scheduleType === 'single' && Array.isArray(classSession.schedules) && classSession.schedules.length > 0) {
      startTime = classSession.schedules[0].startTime;
      endTime = classSession.schedules[0].endTime;
      if (classSession.schedules[0].timezone) {
        timezone = classSession.schedules[0].timezone;
      }
    }
    // Fallback to class-level times if available
    else {
      startTime = classSession.startTime || '';
      endTime = classSession.endTime || '';
    }

    // Early validation of time strings
    if (!startTime || !endTime) return '';

    // Ensure times are in correct format (HH:mm)
    const formatTimeString = (time: string) => {
      // If time already includes AM/PM, convert to 24-hour format
      if (time.toLowerCase().includes('am') || time.toLowerCase().includes('pm')) {
        const [timePart, period] = time.split(/\s+/);
        const [hours, minutes] = timePart.split(':').map(Number);
        const isPM = period.toLowerCase() === 'pm';

        let hour24 = hours;
        if (isPM && hours !== 12) hour24 += 12;
        if (!isPM && hours === 12) hour24 = 0;

        return `${hour24.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      }

      // If time is already in 24-hour format, ensure it's padded correctly
      const [hours, minutes] = time.split(':').map(Number);
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    };

    startTime = formatTimeString(startTime);
    endTime = formatTimeString(endTime);

    // Get the user's local timezone
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Calculate the display date if not provided
    let displayDate = classSession._displayDate;
    if (!displayDate) {
      // For upcoming classes, use the next occurrence
      const nextDate = getNextClassDate(classSession);
      // For past classes, use the previous occurrence
      const prevDate = getPreviousClassDate(classSession);
      // Use the appropriate date based on which is closer to now
      const now = new Date();
      if (nextDate && (!prevDate || Math.abs(nextDate.getTime() - now.getTime()) < Math.abs(prevDate.getTime() - now.getTime()))) {
        displayDate = nextDate;
      } else if (prevDate) {
        displayDate = prevDate;
      }
    }

    // Use our utility function to format the time with both timezones
    return formatTimeWithTimezones(startTime, endTime, timezone, userTimezone, displayDate, true);
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
    const details = classSession;

    if (!details.dayOfWeek && details.dayOfWeek !== 0) return null;

    const today = new Date();
    const currentDayOfWeek = today.getDay();
    const targetDayOfWeek = details.dayOfWeek;

    let daysUntilNext = targetDayOfWeek - currentDayOfWeek;
    if (daysUntilNext <= 0) {
      daysUntilNext += 7;
    }

    if (daysUntilNext === 0 && details.startTime) {
      const [hours, minutes] = details.startTime.split(':');
      let hour = parseInt(hours);
      if (details.startTime.toLowerCase().includes('pm') && hour !== 12) {
        hour += 12;
      } else if (details.startTime.toLowerCase().includes('am') && hour === 12) {
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
    const details = classSession;

    if (!details.dayOfWeek && details.dayOfWeek !== 0) return null;

    const today = new Date();
    const currentDayOfWeek = today.getDay();
    const targetDayOfWeek = details.dayOfWeek;

    let daysSinceLast = currentDayOfWeek - targetDayOfWeek;
    if (daysSinceLast < 0) {
      daysSinceLast += 7;
    }

    if (daysSinceLast === 0 && details.startTime) {
      const [hours, minutes] = details.startTime.split(':');
      let hour = parseInt(hours);
      if (details.startTime.toLowerCase().includes('pm') && hour !== 12) {
        hour += 12;
      } else if (details.startTime.toLowerCase().includes('am') && hour === 12) {
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
      return [];
    }
  };

  // Function to refresh all homework data
  const refreshAllHomework = async () => {
    // Prevent duplicate fetches within 2 seconds
    const now = Date.now();
    if (now - lastHomeworkFetchRef.current < 2000) {
      return;
    }
    lastHomeworkFetchRef.current = now;


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

  };

  // Set up homework change listener
  useEffect(() => {
    // Fetch homework data initially
    refreshAllHomework();

    // Subscribe to homework changes
    const unsubscribe = subscribeToHomeworkChanges((updatedClassId) => {

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
    <div className="py-6 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h1 className={styles.headings.h1}>{t.home}</h1>
        </div>
      </div>

      {/* Calendar and Day details section */}
      <div className="mt-8 grid gap-4 grid-cols-1 xl:grid-cols-[850px,1fr]">
        {/* Calendar section */}
        <div className="w-full min-w-0 overflow-visible">
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
        <div ref={detailsRef} className="w-full min-w-0">
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
