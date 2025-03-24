import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthWithMasquerade } from '../hooks/useAuthWithMasquerade';
import { Calendar } from '../components/Calendar';
import { ScheduleCalendarDay } from '../components/ScheduleCalendarDay';
import '../styles/calendar.css';
import { styles } from '../styles/styleUtils';
import { FaFilePdf, FaLink, FaFileAlt } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { getCalendarData, invalidateCalendarCache } from '../services/calendarService';
import { ClassSession } from '../utils/scheduleUtils';
import { getHomeworkForClass, getHomeworkSubmissions } from '../utils/homeworkUtils';
import { Homework, HomeworkSubmission } from '../types/interfaces';
import ScheduleHomeworkView from '../components/ScheduleHomeworkView';
import { formatTimeWithTimezones } from '../utils/dateUtils';
import { formatDateForComparison } from '../utils/dateUtils';
import { formatDateWithShortDay } from '../utils/dateUtils';

// Define types for the calendar data from the server
interface CalendarClass extends ClassSession {
  dates: string[];
  paymentDueDates: string[];
  frequency: {
    type: 'weekly' | 'biweekly' | 'custom';
    every: number;
  };
}

interface CalendarMaterial {
  id: string;
  createdAt: string;
  classId: string;
  slides: string[];
  classDate: string;
  studentEmails: string[];
  links: string[];
  updatedAt: string;
}

interface PaymentDueDate {
  date: string;
  classId: string;
  paymentLink: string | null;
}

interface CompletedPayment {
  id: string;
  createdAt: string;
  amount: number;
  completedAt: string;
  dueDate: string;
  classSessionId: string;
  currency: string;
  userId: string;
  status: string;
  updatedAt: string;
}

interface Birthday {
  userId: string;
  name: string;
  email: string;
  birthdate: string;
  day: number;
}

interface UserData {
  id: string;
  createdAt: string;
  uid: string;
  teacher: string;
  birthdate: string;
  name: string;
  isAdmin: boolean;
  isTeacher: boolean;
  email: string;
  status: string;
  updatedAt: string;
}

interface CalendarData {
  classes: CalendarClass[];
  materials: Record<string, CalendarMaterial[]>;
  paymentDueDates: PaymentDueDate[];
  completedPayments: CompletedPayment[];
  birthdays: Birthday[];
  userData: UserData;
  month: number;
  year: number;
  homework?: Record<string, Homework[]>;
}

export const Schedule = () => {
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedDayDetails, setSelectedDayDetails] = useState<{
    date: Date;
    classes: CalendarClass[];
    isPaymentDay: boolean;
    isPaymentSoon: boolean;
  } | null>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const { currentUser, isMasquerading, masqueradingAs } = useAuthWithMasquerade();
  const { language } = useLanguage();
  const t = useTranslation(language);
  
  // Add a ref to track if we're handling the initial load
  const isInitialLoadRef = useRef(true);
  // Add a ref to track the current request parameters to avoid duplicate requests
  const currentRequestRef = useRef<{month: number, year: number} | null>(null);

  // Class Materials Modal State
  const [selectedClass, setSelectedClass] = useState<CalendarClass | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<CalendarMaterial | null>(null);
  const [loadingMaterial, setLoadingMaterial] = useState(false);
  const [slidesUrl, setSlidesUrl] = useState<string | null>(null);
  
  // Homework State
  const [homeworkByClass, setHomeworkByClass] = useState<Record<string, Homework[]>>({});
  const [selectedHomeworkDate, setSelectedHomeworkDate] = useState<Date | null>(null);
  const [homeworkFeedbackByClass, setHomeworkFeedbackByClass] = useState<Record<string, Map<string, boolean>>>({});

  // Create an array of short day names using formatDateWithShortDay
  const DAYS_OF_WEEK_FULL = [
    formatDateWithShortDay(new Date(2024, 0, 7), language), // Sunday
    formatDateWithShortDay(new Date(2024, 0, 8), language), // Monday
    formatDateWithShortDay(new Date(2024, 0, 9), language), // Tuesday
    formatDateWithShortDay(new Date(2024, 0, 10), language), // Wednesday
    formatDateWithShortDay(new Date(2024, 0, 11), language), // Thursday
    formatDateWithShortDay(new Date(2024, 0, 12), language), // Friday
    formatDateWithShortDay(new Date(2024, 0, 13), language)  // Saturday
  ];

  // Create a memoized fetch function to avoid duplicate requests
  const fetchCalendarDataSafely = useCallback(async (month: number, year: number) => {
    // Check if we're already fetching this exact data
    if (currentRequestRef.current && 
        currentRequestRef.current.month === month && 
        currentRequestRef.current.year === year) {
      return;
    }

    // Set the current request parameters
    currentRequestRef.current = { month, year };
    
    if (!currentUser) {
      setCalendarData(null);
      setLoading(false);
      currentRequestRef.current = null;
      return;
    }

    try {
      setLoading(true);
      const data = await getCalendarData(month, year);
      setCalendarData(data);
    } catch (error) {
      console.error('Error fetching calendar data:', error);
      toast.error(t.failedToLoad);
    } finally {
      setLoading(false);
      currentRequestRef.current = null;
    }
  }, [currentUser, t]);

  // Function to fetch homework for all classes
  const fetchHomeworkForAllClasses = useCallback(async () => {
    if (!calendarData?.classes || calendarData.classes.length === 0) {
      console.log('No classes found, returning empty homework');
      setHomeworkByClass({});
      return Promise.resolve(); // Make sure we return a Promise
    }
    
    console.log('Fetching homework for all classes...');
    const newHomeworkByClass: Record<string, Homework[]> = {};
    const newHomeworkFeedbackByClass: Record<string, Map<string, boolean>> = {};
    
    // Get unique class IDs (base IDs)
    const uniqueClassIds = Array.from(new Set(
      calendarData.classes
        .map(classItem => classItem)
        .filter(classItem => classItem.id) // Filter out entries without an id
        .map(classItem => classItem.id ? classItem.id.split('-')[0] : '')
    ));
    
    console.log(`Found ${uniqueClassIds.length} unique class IDs`);
    
    // If there are no unique class IDs, just update the state and return early
    if (uniqueClassIds.length === 0) {
      console.log('No classes with IDs found, skipping homework fetch');
      setHomeworkByClass({});
      return Promise.resolve(); // Make sure we return a Promise
    }
    
    // Fetch homework for each class
    const fetchPromises = uniqueClassIds.map(async (classId) => {
      try {
        console.log(`Fetching homework for class ${classId}...`);
        const homework = await getHomeworkForClass(classId);
        console.log(`Found ${homework.length} homework assignments for class ${classId}`);

        // For each homework, check for submissions with feedback
        const feedbackMap = new Map<string, boolean>();
        for (const hw of homework) {
          if (hw.id) {
            try {
              const submissions = await getHomeworkSubmissions(hw.id);
              const hasFeedback = submissions.some((sub: HomeworkSubmission) => 
                sub.status === 'graded' && sub.feedback && sub.feedback.trim() !== ''
              );
              
              if (hasFeedback) {
                // Key is homeworkId_dateStr
                const dateStr = hw.classDate ? hw.classDate.toISOString().split('T')[0] : '';
                feedbackMap.set(`${hw.id}_${dateStr}`, true);
                console.log(`Homework ${hw.id} for date ${dateStr} has feedback`);
              }
            } catch (error) {
              console.error(`Error fetching submissions for homework ${hw.id}:`, error);
            }
          }
        }
        
        if (feedbackMap.size > 0) {
          newHomeworkFeedbackByClass[classId] = feedbackMap;
        }
        
        return { classId, homework };
      } catch (error) {
        console.error(`Error fetching homework for class ${classId}:`, error);
        return { classId, homework: [] };
      }
    });
    
    try {
      const results = await Promise.all(fetchPromises);
      
      // Process results
      results.forEach(({ classId, homework }) => {
        newHomeworkByClass[classId] = homework;
      });
      
      console.log('Setting homework by class state');
      setHomeworkByClass(newHomeworkByClass);
      setHomeworkFeedbackByClass(newHomeworkFeedbackByClass);
      return Promise.resolve(); // Make sure we return a Promise
    } catch (error) {
      console.error('Error fetching homework:', error);
      return Promise.reject(error); // Return rejected promise on error
    }
  }, [calendarData?.classes, setHomeworkByClass, setHomeworkFeedbackByClass]);

  // Add a ref to track if we've initialized the current day details
  const hasInitializedDayDetailsRef = useRef<boolean>(false);
  
  // Use useState to track which calendar data we've already fetched homework for
  const [fetchedDataKeys, setFetchedDataKeys] = useState<Set<string>>(new Set());
  
  // Modify the homework fetching effect to work better with initialization
  useEffect(() => {
    // Skip if we have no data or are loading
    if (!calendarData || loading) return;
    
    // Skip if we've already fetched for this month/year
    const key = `${calendarData.month}_${calendarData.year}`;
    if (fetchedDataKeys.has(key)) {
      console.log(`Already fetched homework for ${key}`);
      return;
    }
    
    // Don't skip homework fetch on page reload when masquerading
    // Only skip if we're actively changing masquerade state
    if (isMasquerading && !hasInitializedDayDetailsRef.current && isInitialLoadRef.current) {
      console.log('Skipping homework fetch during masquerade transition');
      return;
    }
    
    console.log(`Fetching homework for ${key} (month=${calendarData.month}, year=${calendarData.year})`);
    console.log('Current state:', { isMasquerading, masqueradingAs: masqueradingAs?.id, isInitialLoad: isInitialLoadRef.current });
    
    fetchHomeworkForAllClasses()
      .then(() => {
        // Mark this data key as fetched using a callback to avoid dependency
        setFetchedDataKeys(prev => {
          const newSet = new Set(prev);
          newSet.add(key);
          return newSet;
        });
        console.log(`Marked ${key} as fetched for homework`);
      });
      
  }, [calendarData?.month, calendarData?.year, loading, isMasquerading, fetchHomeworkForAllClasses]);

  // Clear calendar cache when masquerading status changes
  useEffect(() => {
    // Skip if not masquerading and no masquerade user
    if (!isMasquerading && !masqueradingAs) return;
    
    console.log('Masquerade status changed, clearing caches');
    // Clear the calendar cache when masquerading status changes
    invalidateCalendarCache();
    
    // Reset the initial load flag to force a new data fetch
    isInitialLoadRef.current = true;
    hasInitializedDayDetailsRef.current = false;
    
    // Clear homework cache and state
    setHomeworkByClass({});
    setHomeworkFeedbackByClass({});
    setFetchedDataKeys(new Set()); // Clear the fetched keys to allow re-fetching
    
    // If we have a current user, fetch the data again
    if (currentUser) {
      const month = selectedDate.getMonth();
      const year = selectedDate.getFullYear();
      fetchCalendarDataSafely(month, year).then(() => {
        // After calendar data is loaded, set initial load to false
        isInitialLoadRef.current = false;
      });
    }
  }, [isMasquerading, masqueradingAs]);

  // Handle initial data loading
  useEffect(() => {
    if (currentUser) {
      const month = selectedDate.getMonth();
      const year = selectedDate.getFullYear();
      
      // Always fetch if we're masquerading or it's the initial load
      if (isInitialLoadRef.current || isMasquerading) {
        console.log('Initial load or masquerading, fetching calendar data');
        fetchCalendarDataSafely(month, year).then(() => {
          // After initial calendar data is loaded, set initial load to false
          isInitialLoadRef.current = false;
        });
      }
    }
  }, [currentUser, selectedDate, fetchCalendarDataSafely, isMasquerading]);

  // Add a new useEffect to set the initial day details for the current day
  useEffect(() => {
    // Only proceed if calendar data is loaded, not loading anymore, and we haven't initialized yet
    if (!calendarData || loading || hasInitializedDayDetailsRef.current) return;

    const today = new Date();
    
    // Check if the loaded calendar data contains the current month/year
    if (calendarData.month === today.getMonth() && calendarData.year === today.getFullYear()) {
      console.log('Initializing day details for the current day');
      
      // Set up the day details
      const todayClasses = getClassesForDate(today);
      console.log(`Found ${todayClasses.length} classes for today`);
      
      const isPaymentDay = isPaymentDueOnDate(today);
      
      // Calculate if payment is soon (within 3 days)
      const daysUntilPayment = isPaymentDay ? 
        Math.ceil((today.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
      const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;
      
      // Update the day details
      setSelectedDate(today);
      setSelectedHomeworkDate(today);
      
      setSelectedDayDetails({
        date: today,
        classes: todayClasses,
        isPaymentDay,
        isPaymentSoon
      });
      
      // Mark as initialized
      hasInitializedDayDetailsRef.current = true;
    }
  }, [calendarData, loading]);

  const getClassesForDate = (date: Date): CalendarClass[] => {
    if (!calendarData?.classes) return [];
    
    const dateStr = formatDateForComparison(date);
    
    // Get all classes for this date
    const allClassesForDate = calendarData.classes.filter(classItem => 
      classItem.dates.some(classDate => {
        const classDateStr = classDate?.split('T')[0] || '';
        return classDateStr === dateStr;
      })
    );
    
    // Use a map to deduplicate classes based on their base class ID
    const uniqueClasses = new Map<string, CalendarClass>();
    
    allClassesForDate.forEach(classItem => {
      const fullId = classItem.id;
      // Extract the base ID (without any day suffix like -1, -2)
      const baseId = fullId.split('-')[0];
      
      // If we already have this base ID, keep the first instance
      if (!uniqueClasses.has(baseId)) {
        uniqueClasses.set(baseId, classItem);
      }
    });
    
    // Return the deduplicated classes as an array
    return Array.from(uniqueClasses.values());
  };

  const isPaymentDueOnDate = (date: Date): boolean => {
    if (!calendarData?.paymentDueDates) return false;
    
    const dateStr = formatDateForComparison(date);
    
    return calendarData.paymentDueDates.some(payment => {
      const paymentDateStr = payment.date?.split('T')[0] || '';
      return paymentDateStr === dateStr;
    });
  };

  // Add function to check if payment is completed
  const getPaymentStatus = (date: Date): { isCompleted: boolean; completedAt?: string } => {
    if (!calendarData?.completedPayments || !calendarData?.paymentDueDates) {
      return { isCompleted: false };
    }

    const dateStr = formatDateForComparison(date);
    
    // Find the payment due date entry
    const paymentDue = calendarData.paymentDueDates.find(payment => {
      const paymentDateStr = payment.date?.split('T')[0] || '';
      return paymentDateStr === dateStr;
    });

    if (!paymentDue) return { isCompleted: false };

    // Find if there's a completed payment for this due date
    const completedPayment = calendarData.completedPayments.find(payment => {
      const paymentDueDateStr = payment.dueDate?.split('T')[0] || '';
      return paymentDueDateStr === dateStr;
    });

    return {
      isCompleted: !!completedPayment,
      completedAt: completedPayment?.completedAt
    };
  };

  const handleClassClick = async (classItem: CalendarClass, date: Date) => {
    if (!calendarData?.materials) return;
    
    const classId = classItem.id;
    if (!calendarData.materials[classId]) return;
    
    setSelectedClass(classItem);
    setLoadingMaterial(true);

    try {
      const dateStr = formatDateForComparison(date);
      
      // Find material for this specific class and date
      const material = calendarData.materials[classId].find(m => {
        const materialDateStr = m.classDate?.split('T')[0] || '';
        return materialDateStr === dateStr;
      });

      if (material) {
        setSelectedMaterial(material);
        if (material.slides && material.slides.length > 0) {
          setSlidesUrl(material.slides[0]);
        }
      } else {
        setSelectedMaterial(null);
        setSlidesUrl(null);
      }
    } catch (error) {
      console.error('Error handling class materials:', error);
      toast.error(t.failedToLoad);
    } finally {
      setLoadingMaterial(false);
    }
  };

  const handleDayClick = (date: Date, classes: CalendarClass[], isPaymentDay: boolean, isPaymentSoon: boolean, shouldScroll: boolean = true) => {
    const dateString = date.toISOString().split('T')[0];
    console.log(`Day clicked: ${dateString} with ${classes.length} classes`);
    
    // Get deduplicated classes using the getClassesForDate function
    const uniqueClasses = getClassesForDate(date);
    console.log(`After deduplication: ${uniqueClasses.length} unique classes`);
    
    // Update the selectedDate to match the clicked date
    setSelectedDate(date);
    
    // Also update the selectedHomeworkDate to match the clicked date
    // This ensures the homework section is displayed
    setSelectedHomeworkDate(date);
    
    // Check for homework on this date
    uniqueClasses.forEach(classItem => {
      // Safely handle potential undefined id
      const id = classItem.id || '';
      const baseClassId = id ? id.split('-')[0] : '';
      console.log(`Checking for homework on class ${baseClassId} (original: ${id})`);
      
      if (homeworkByClass[baseClassId]) {
        const homeworkForDate = homeworkByClass[baseClassId].filter(hw => {
          const hwDateStr = hw.classDate.toISOString().split('T')[0];
          return hwDateStr === dateString;
        });
        
        console.log(`Found ${homeworkForDate.length} homework assignments for class ${baseClassId} on ${dateString}`);
        if (homeworkForDate.length > 0) {
          console.log(`Homework titles: ${homeworkForDate.map(hw => hw.title).join(', ')}`);
        }
      } else {
        console.log(`No homework found in state for class ${baseClassId}`);
      }
    });
    
    setSelectedDayDetails({
      date,
      classes: uniqueClasses,
      isPaymentDay,
      isPaymentSoon
    });
    
    // Only scroll if explicitly requested
    if (shouldScroll) {
      // Scroll to details section with smooth behavior
      setTimeout(() => {
        detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  const renderCalendarDay = (date: Date, isToday: boolean) => {
    const dayClasses = getClassesForDate(date);
    const isPaymentDay = isPaymentDueOnDate(date);
    const paymentStatus = getPaymentStatus(date);
    
    // Calculate if payment is soon (within 3 days)
    const daysUntilPayment = isPaymentDay && !paymentStatus.isCompleted ? 
      Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
    const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

    // For each class, ensure we get the correct schedule for this specific date
    const processedClasses = dayClasses.map(classItem => {
      let updatedClass = { ...classItem };
      const currentDayOfWeek = date.getDay();

      // If it's a multiple schedule class, find the right schedule for this day
      if (updatedClass.scheduleType === 'multiple' && Array.isArray(updatedClass.schedules)) {
        const matchingSchedule = updatedClass.schedules.find(
          (s: { dayOfWeek: number; timezone?: string }) => s.dayOfWeek === currentDayOfWeek
        );

        if (matchingSchedule) {
          // Update the class details with the current day's schedule
          updatedClass = {
            ...updatedClass,
            startTime: matchingSchedule.startTime,
            endTime: matchingSchedule.endTime,
            timezone: matchingSchedule.timezone || updatedClass.timezone
          };
        }
      } else if (updatedClass.scheduleType === 'single' && Array.isArray(updatedClass.schedules) && updatedClass.schedules[0]) {
        // For single schedule type, use the first schedule
        const schedule = updatedClass.schedules[0];
        updatedClass = {
          ...updatedClass,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          timezone: schedule.timezone || updatedClass.timezone
        };
      }

      return updatedClass;
    });

    // Create materials info map for the ScheduleCalendarDay component
    const materialsInfo = new Map<string, { hasSlides: boolean; hasLinks: boolean }>();
    
    if (calendarData?.materials) {
      processedClasses.forEach(classItem => {
        const dateStr = formatDateForComparison(date);
        const key = `${classItem.id}_${dateStr}`;
        
        if (calendarData.materials[classItem.id]) {
          const material = calendarData.materials[classItem.id].find(m => {
            const materialDateStr = m.classDate?.split('T')[0] || '';
            return materialDateStr === dateStr;
          });
          
          if (material) {
            materialsInfo.set(key, {
              hasSlides: Array.isArray(material.slides) && material.slides.length > 0,
              hasLinks: Array.isArray(material.links) && material.links.length > 0
            });
          }
        }
      });
    }

    // Create homework info map for the ScheduleCalendarDay component
    const homeworkInfo = new Map<string, number>();
    
    // Check for homework for each class on this day
    processedClasses.forEach(classItem => {
      const dateStr = formatDateForComparison(date);
      // Safely handle potential undefined id
      const id = classItem.id || '';
      
      // Important: This key must match the format used in ScheduleCalendarDay component
      const key = `${id}_${dateStr}`;
      
      const baseClassId = id ? id.split('-')[0] : '';
      
      if (homeworkByClass[baseClassId]) {
        // Filter homework by date
        const homeworksForDate = homeworkByClass[baseClassId].filter(hw => {
          const hwDateStr = formatDateForComparison(hw.classDate);
          return hwDateStr === dateStr;
        });
        
        if (homeworksForDate.length > 0) {
          homeworkInfo.set(key, homeworksForDate.length);
        }
      }
    });
    
    // Create feedback info map for the ScheduleCalendarDay component
    const homeworkFeedbackInfo = new Map<string, boolean>();
    
    // Check for homework feedback for each class on this day
    processedClasses.forEach(classItem => {
      const dateStr = formatDateForComparison(date);
      // Safely handle potential undefined id
      const id = classItem.id || '';
      const key = `${id}_${dateStr}`;
      const baseClassId = id ? id.split('-')[0] : '';
      
      if (homeworkFeedbackByClass[baseClassId]) {
        // Check if any homework for this class on this date has feedback
        const feedbackMap = homeworkFeedbackByClass[baseClassId];
        
        // Get all homework for this class on this date
        const homeworksForDate = homeworkByClass[baseClassId]?.filter(hw => {
          const hwDateStr = formatDateForComparison(hw.classDate);
          return hwDateStr === dateStr;
        }) || [];
        
        // Check if any of these homework assignments have feedback
        const hasAnyFeedback = homeworksForDate.some(hw => {
          const hwId = hw.id;
          const hwDateStr = formatDateForComparison(hw.classDate);
          return feedbackMap.has(`${hwId}_${hwDateStr}`);
        });
        
        if (hasAnyFeedback) {
          homeworkFeedbackInfo.set(key, true);
        }
      }
    });
    
    // Map the calendar classes to include required ClassSession properties
    const mappedClasses = processedClasses.map(classItem => ({
      ...classItem,
      id: classItem.id,
      name: classItem.courseType || 'Class',
      studentEmails: classItem.studentEmails,
      dayOfWeek: classItem.dayOfWeek,
      startTime: classItem.startTime,
      endTime: classItem.endTime,
      timezone: classItem.timezone,
      courseType: classItem.courseType,
      notes: classItem.notes,
      paymentConfig: classItem.paymentConfig ? {
        type: classItem.paymentConfig.type as 'weekly' | 'monthly',
        weeklyInterval: classItem.paymentConfig.weeklyInterval || undefined,
        monthlyOption: classItem.paymentConfig.monthlyOption as 'first' | 'fifteen' | 'last' | undefined,
        startDate: classItem.paymentConfig.startDate,
        paymentLink: classItem.paymentConfig.paymentLink,
        amount: classItem.paymentConfig.amount,
        currency: classItem.paymentConfig.currency
      } : undefined
    }));

    return (
      <ScheduleCalendarDay<CalendarClass>
        date={date}
        isToday={isToday}
        classes={mappedClasses}
        paymentsDue={isPaymentDay}
        onClassCountClick={handleClassCountClick}
        onPaymentPillClick={handlePaymentPillClick}
        onDayClick={(date, classes) => {
          setSelectedDate(date);
          handleDayClick(date, classes, isPaymentDay, isPaymentSoon, true);
        }}
        materialsInfo={materialsInfo}
        homeworkInfo={homeworkInfo}
        homeworkFeedbackInfo={homeworkFeedbackInfo}
        onHomeworkPillClick={handleHomeworkPillClick}
        paymentStatus={paymentStatus}
      />
    );
  };

  // Handle homework pill click
  const handleHomeworkPillClick = (e: React.MouseEvent, date: Date, classes: CalendarClass[]) => {
    e.stopPropagation();
    
    const dateStr = date.toISOString().split('T')[0];
    console.log(`Homework pill clicked for date: ${dateStr} with ${classes.length} classes`);
    console.log(`Date details - year: ${date.getFullYear()}, month: ${date.getMonth()}, day: ${date.getDate()}`);
    
    // Update the selectedDate to match the clicked date
    setSelectedDate(date);
    
    // Check for homework on this date
    classes.forEach(classItem => {
      // Safely handle potential undefined id
      const id = classItem.id || '';
      const baseClassId = id ? id.split('-')[0] : '';
      console.log(`Class in pill: ${baseClassId} (original: ${id})`);
      
      if (homeworkByClass[baseClassId]) {
        const homeworkForDate = homeworkByClass[baseClassId].filter(hw => {
          const hwDateStr = hw.classDate.toISOString().split('T')[0];
          return hwDateStr === dateStr;
        });
        
        console.log(`Found ${homeworkForDate.length} homework assignments for class ${baseClassId} on ${dateStr}`);
        if (homeworkForDate.length > 0) {
          homeworkForDate.forEach(hw => {
            console.log(`Homework: ${hw.title}, ID: ${hw.id}, Date: ${hw.classDate.toISOString().split('T')[0]}`);
          });
        }
      }
    });
    
    // Set selected date for homework and show day details
    setSelectedHomeworkDate(date);
    handleDayClick(date, classes, isPaymentDueOnDate(date), false, true);
  };

  // Handle class count click
  const handleClassCountClick = (e: React.MouseEvent, classes: CalendarClass[], date: Date) => {
    e.stopPropagation();
    setSelectedDate(date);
    const isPaymentDay = isPaymentDueOnDate(date);
    
    // Calculate if payment is soon (within 3 days)
    const daysUntilPayment = isPaymentDay ? 
      Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
    const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;
    
    handleDayClick(date, classes, isPaymentDay, isPaymentSoon, true);
  };

  // Handle payment pill click
  const handlePaymentPillClick = (e: React.MouseEvent, date: Date, classes: CalendarClass[]) => {
    e.stopPropagation();
    setSelectedDate(date);
    const isPaymentDay = isPaymentDueOnDate(date);
    
    // Calculate if payment is soon (within 3 days)
    const daysUntilPayment = isPaymentDay ? 
      Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
    const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;
    
    handleDayClick(date, classes, isPaymentDay, isPaymentSoon, true);
  };

  // Add a debug function to window to manually set homework class and date
  useEffect(() => {
    // Only add in development mode
    if (process.env.NODE_ENV !== 'production') {
      console.log('Adding debug functions for homework selection');
      
      // @ts-ignore - Adding to window for debugging
      window.debugHomework = {
        setHomeworkClass: (classId: string, date: string) => {
          console.log(`Debug: Setting homework class to ${classId} for date ${date}`);
          
          // Find the class with this ID
          const matchingClass = calendarData?.classes.find(c => {
            const cId = c.id || '';
            return cId === classId || (cId ? cId.split('-')[0] === classId : false);
          });
          
          if (matchingClass) {
            const newDate = new Date(date);
            setSelectedHomeworkDate(newDate);
            
            // Set selected day details if needed
            const dayClasses = getClassesForDate(newDate);
            setSelectedDayDetails({
              date: newDate,
              classes: dayClasses,
              isPaymentDay: isPaymentDueOnDate(newDate),
              isPaymentSoon: false
            });
            
            console.log(`Debug: Set homework class to ${matchingClass.id} and date to ${newDate.toISOString()}`);
            return true;
          } else {
            console.log(`Debug: Could not find class with ID ${classId}`);
            return false;
          }
        },
        showHomeworkForDate: (date: string) => {
          console.log(`Debug: Finding homework for date ${date}`);
          const allHomework: {classId: string, homework: Homework[]}[] = [];
          
          // Check all class IDs for homework on this date
          Object.entries(homeworkByClass).forEach(([classId, homeworkList]) => {
            const homeworkForDate = homeworkList.filter(hw => {
              const hwDateStr = hw.classDate.toISOString().split('T')[0];
              return hwDateStr === date;
            });
            
            if (homeworkForDate.length > 0) {
              allHomework.push({classId, homework: homeworkForDate});
              console.log(`Debug: Found ${homeworkForDate.length} homework assignments for class ${classId} on ${date}`);
              homeworkForDate.forEach(hw => {
                console.log(`- ${hw.title} (ID: ${hw.id}), Date: ${hw.classDate.toISOString().split('T')[0]}`);
              });
            }
          });
          
          return allHomework;
        }
      };
    }
    
    return () => {
      // @ts-ignore - Cleanup
      if (window.debugHomework) {
        // @ts-ignore
        delete window.debugHomework;
      }
    };
  }, [calendarData?.classes, getClassesForDate, homeworkByClass, isPaymentDueOnDate]);

  // Function to format class time, converting from class timezone to user timezone
  const formatClassTime = (classSession: ClassSession): string => {
    if (!classSession) return '';
    
    let startTime = classSession.startTime || '';
    let endTime = classSession.endTime || '';
    let timezone = classSession.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Early validation of time strings
    if (!startTime || !endTime) {
      console.warn("Missing start or end time:", { startTime, endTime, classId: classSession.id });
      return '';
    }
    
    // For classes with multiple schedules, find the matching schedule for the day of week
    if (classSession.scheduleType === 'multiple' && Array.isArray(classSession.schedules) && classSession.dayOfWeek !== undefined) {
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
      }
    }
    
    // Get the user's local timezone
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Use our utility function to format the time with both timezones
    // Always show source time (true) to display both original and converted times
    return formatTimeWithTimezones(startTime, endTime, timezone, userTimezone, classSession._displayDate, true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative min-h-screen bg-[#fafafa]" style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E")`,
      backgroundAttachment: 'fixed'
    }}>
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="md:flex md:items-center md:justify-between">
          <div className="flex-1 min-w-0">
            <h1 className={styles.headings.h1}>{t.courseSchedule}</h1>
            <p className="mt-2 text-sm text-black">
            </p>
          </div>
        </div>

        {/* New responsive layout container */}
        <div className="mt-8 lg:grid lg:grid-cols-[2fr,1fr] lg:gap-8">
          {/* Calendar section */}
          <div>
            <Calendar
              selectedDate={selectedDate}
              onMonthChange={(date) => {
                // Update selected date
                setSelectedDate(date);
                // Fetch data for the new month
                const newMonth = date.getMonth();
                const newYear = date.getFullYear();
                fetchCalendarDataSafely(newMonth, newYear);
              }}
              onDayClick={(date: Date) => {
                // Update selectedDate
                setSelectedDate(date);
                
                const dayClasses = getClassesForDate(date);
                const isPaymentDay = isPaymentDueOnDate(date);
                
                const daysUntilPayment = isPaymentDay ? 
                  Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
                const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

                handleDayClick(date, dayClasses, isPaymentDay, isPaymentSoon, true);
              }}
              renderDay={(date: Date, isToday: boolean) => (
                renderCalendarDay(date, isToday)
              )}
            />
          </div>

          {/* Details section */}
          <div ref={detailsRef}>
            {selectedDayDetails ? (
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h2 className="text-xl font-semibold mb-6">
                  {formatDateWithShortDay(selectedDayDetails.date, language)}, {selectedDayDetails.date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </h2>

                {selectedDayDetails.isPaymentDay && (
                  <div className={`flex flex-col p-3 rounded-lg mb-4 ${
                    getPaymentStatus(selectedDayDetails.date).isCompleted
                      ? 'bg-[#f0fdf4]'  // Light green background for completed payments
                      : 'bg-[#fffbeb]'  // Original yellow background for pending payments
                  }`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        getPaymentStatus(selectedDayDetails.date).isCompleted
                          ? 'bg-[#22c55e]'
                          : selectedDayDetails.isPaymentSoon
                          ? 'bg-[#ef4444]'
                          : 'bg-[#f59e0b]'
                      }`} />
                      <div>
                        <span className={`text-sm font-medium ${
                          getPaymentStatus(selectedDayDetails.date).isCompleted
                            ? 'text-[#22c55e]'
                            : 'text-[#f59e0b]'
                        }`}>
                          {getPaymentStatus(selectedDayDetails.date).isCompleted
                            ? t.paymentCompleted
                            : t.paymentDue} ({formatDateWithShortDay(selectedDayDetails.date, language)})
                        </span>
                        {selectedDayDetails.isPaymentSoon && !getPaymentStatus(selectedDayDetails.date).isCompleted && (
                          <span className="text-xs ml-2 text-[#ef4444]">Due soon</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Show completion date if payment is completed */}
                    {getPaymentStatus(selectedDayDetails.date).isCompleted && getPaymentStatus(selectedDayDetails.date).completedAt && (
                      <div className="mt-2 ml-4 text-sm text-[#22c55e]">
                        {t.completedOn}: {formatDateWithShortDay(new Date(getPaymentStatus(selectedDayDetails.date).completedAt!), language)}
                      </div>
                    )}
                    
                    {/* Payment Link Section */}
                    {calendarData?.paymentDueDates && calendarData.paymentDueDates.some(payment => {
                      const paymentDateStr = payment.date?.split('T')[0] || '';
                      const selectedDateStr = formatDateForComparison(selectedDayDetails.date);
                      return paymentDateStr === selectedDateStr && payment.paymentLink;
                    }) && (
                      <div className="mt-2 ml-4">
                        {calendarData.paymentDueDates
                          .filter(payment => {
                            const paymentDateStr = payment.date?.split('T')[0] || '';
                            const selectedDateStr = formatDateForComparison(selectedDayDetails.date);
                            return paymentDateStr === selectedDateStr && payment.paymentLink;
                          })
                          .map((payment, index) => (
                            <a 
                              key={index}
                              href={payment.paymentLink || '#'} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 flex items-center text-sm"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              {t.paymentLink || 'Payment Link'}
                            </a>
                          ))
                        }
                      </div>
                    )}
                  </div>
                )}

                {selectedDayDetails.classes.length > 0 ? (
                  selectedDayDetails.classes.map(classItem => {
                    const dateStr = formatDateForComparison(selectedDayDetails.date);
                    const id = classItem.id || '';
                    const classBaseId = id ? id.split('-')[0] : '';
                    
                    // Check if this class has materials
                    let hasMaterials = false;
                    if (calendarData?.materials && calendarData.materials[id]) {
                      hasMaterials = calendarData.materials[id].some(m => {
                        const materialDateStr = m.classDate?.split('T')[0] || '';
                        return materialDateStr === dateStr;
                      });
                    }

                    // Get material info for display
                    let materialInfo = { hasSlides: false, hasLinks: false };
                    if (hasMaterials && calendarData?.materials) {
                      const material = calendarData.materials[id].find(m => {
                        const materialDateStr = m.classDate?.split('T')[0] || '';
                        return materialDateStr === dateStr;
                      });
                      
                      if (material) {
                        materialInfo = {
                          hasSlides: Array.isArray(material.slides) && material.slides.length > 0,
                          hasLinks: Array.isArray(material.links) && material.links.length > 0
                        };
                      }
                    }
                    
                    // Check if this class has homework
                    const hasHomework = homeworkByClass[classBaseId] && homeworkByClass[classBaseId].some(hw => {
                      const hwDateStr = hw.classDate.toISOString().split('T')[0];
                      return hwDateStr === dateStr;
                    });

                    // Map the class to include required ClassSession properties
                    let updatedClass = { ...classItem };
                    const currentDayOfWeek = selectedDayDetails.date.getDay();
                    
                    // If it's a multiple schedule class, find the right schedule for this day
                    if (updatedClass.scheduleType === 'multiple' && 
                        Array.isArray(updatedClass.schedules)) {
                      
                      const matchingSchedule = updatedClass.schedules.find(
                        (s: { dayOfWeek: number; timezone?: string }) => s.dayOfWeek === currentDayOfWeek
                      );
                      
                      if (matchingSchedule) {
                        // Update the class details with the current day's schedule
                        updatedClass = {
                          ...updatedClass,
                          startTime: matchingSchedule.startTime,
                          endTime: matchingSchedule.endTime,
                          timezone: matchingSchedule.timezone || updatedClass.timezone
                        };
                      }
                    }

                    return (
                      <div
                        key={classItem.id}
                        onClick={() => hasMaterials && handleClassClick(classItem, selectedDayDetails.date)}
                        className={`p-4 rounded-xl mb-4 last:mb-0 border ${
                          hasMaterials 
                            ? 'border-[#e0e7ff] bg-[#f5f7ff] hover:border-[#c7d2fe] hover:bg-[#eef2ff] cursor-pointer' 
                            : 'border-[#f0f0f0] bg-[#f8f8f8]'
                        } transition-colors`}
                      >
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-2 h-2 rounded-full bg-[#6366f1]" />
                          <span className="text-sm font-medium text-[#1a1a1a]">{t.class}</span>
                        </div>

                        <div className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2">
                          <span className="text-sm font-medium text-[#4b5563]">{t.dayOfWeek}</span>
                          <span className="text-sm text-[#1a1a1a]">{formatDateWithShortDay(selectedDayDetails.date, language)}</span>
                          
                          <span className="text-sm font-medium text-[#4b5563]">{t.time}</span>
                          <span className="text-sm text-[#1a1a1a]">
                            {formatClassTime(updatedClass)}
                          </span>

                          <span className="text-sm font-medium text-[#4b5563]">{t.class}</span>
                          <span className="text-sm text-[#1a1a1a]">{updatedClass.courseType || t.class}</span>

                          {updatedClass.notes && (
                            <>
                              <span className="text-sm font-medium text-[#4b5563]">{t.notes}</span>
                              <span className="text-sm text-[#1a1a1a]">{updatedClass.notes}</span>
                            </>
                          )}
                        </div>

                        {hasMaterials && (
                          <div className="mt-4 pt-4 border-t border-[#e5e7eb] flex gap-2">
                            {materialInfo.hasSlides && (
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-[#e0e7ff] text-[#4f46e5]">
                                <FaFileAlt className="w-3 h-3 mr-1" />
                                Doc
                              </span>
                            )}
                            {materialInfo.hasLinks && (
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-[#e0e7ff] text-[#4f46e5]">
                                <FaLink className="w-3 h-3 mr-1" />
                                Links
                              </span>
                            )}
                          </div>
                        )}
                        
                        {/* Show homework for this class if available */}
                        {hasHomework && selectedHomeworkDate && (
                          <div className="mt-4 pt-4 border-t border-[#e5e7eb]">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-2 h-2 rounded-full bg-[#6366f1]" />
                              <h4 className="text-sm font-medium text-[#1a1a1a]">Homework</h4>
                            </div>
                            <ScheduleHomeworkView 
                              classId={classBaseId}
                              classDate={selectedDayDetails.date}
                              studentEmail={currentUser?.email || null}
                              isOpen={true}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : !selectedDayDetails.isPaymentDay ? (
                  <div className="text-sm text-[#6b7280] text-center">
                    {t.noClassesScheduled}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-md p-6 mb-6 text-center text-gray-500">
                {t.selectDayToViewDetails}
              </div>
            )}
          </div>
        </div>

        {/* Class Materials Section */}
        {selectedClass && (
          <div className="bg-white rounded-lg shadow-md p-6 mt-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className={styles.headings.h3}>{t.classMaterials}</h3>
              <button
                onClick={() => {
                  setSelectedClass(null);
                  setSelectedMaterial(null);
                  setSlidesUrl(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            </div>

            {loadingMaterial ? (
              <div className="flex justify-center items-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : selectedMaterial ? (
              <div className="space-y-6">
                {/* Slides */}
                {selectedMaterial.slides && selectedMaterial.slides.length > 0 && (
                  <div>
                    {slidesUrl && (
                      <a
                        href={slidesUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        <FaFilePdf className="mr-2" />
                        {t.downloadSlides}
                      </a>
                    )}
                  </div>
                )}

                {/* Links */}
                {selectedMaterial.links && selectedMaterial.links.length > 0 && (
                  <div className="mt-6">
                    <h3 className={styles.headings.h3}>{t.usefulLinks}</h3>
                    <ul className="mt-2 space-y-2">
                      {selectedMaterial.links.map((link, index) => (
                        <li key={index}>
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            {link}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                {t.noMaterialsFound}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}; 