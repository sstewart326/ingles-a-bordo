import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthWithMasquerade } from '../hooks/useAuthWithMasquerade';
import { Calendar } from '../components/Calendar';
import { ScheduleCalendarDay } from '../components/ScheduleCalendarDay';
import '../styles/calendar.css';
import { styles } from '../styles/styleUtils';
import { FaFilePdf, FaLink, FaFileAlt, FaTimes } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { getCalendarData, invalidateCalendarCache } from '../services/calendarService';
import { ClassSession } from '../utils/scheduleUtils';
import { getHomeworkForClass, getHomeworkSubmissions, subscribeToHomeworkChanges, clearHomeworkCache } from '../utils/homeworkUtils';
import { Homework, HomeworkSubmission } from '../types/interfaces';
import ScheduleHomeworkView from '../components/ScheduleHomeworkView';
import { formatTimeWithTimezones } from '../utils/dateUtils';
import { formatDateForComparison } from '../utils/dateUtils';
import { formatDateWithShortDay } from '../utils/dateUtils';
import { formatLocalizedDate, parseDateStringInTimezone, formatTimeToAMPM } from '../utils/dateUtils';
import { 
  fetchNotesByMonthTeacherAndClasses, 
  ClassNote, 
  findNoteForClassSession 
} from '../utils/notesUtils';
import { processDailyClassMapEntries } from '../utils/calendarDayUtils';
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
  classSession: {
    id: string;
  };
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
  dailyClassMap?: Record<string, any[]>;
}

// Add MaterialsModal component at the top level
const MaterialsModal = ({
  isOpen,
  onClose,
  material,
  loading
}: {
  isOpen: boolean;
  onClose: () => void;
  material: CalendarMaterial | null;
  loading: boolean;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              onClick={onClose}
              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
            >
              <FaTimes className="h-6 w-6" />
            </button>
          </div>

          <div className="sm:flex sm:items-start">
            <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
              <h3 className={styles.headings.h3}>Class Materials</h3>

              {loading ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
              ) : material ? (
                <div className="mt-4 space-y-6">
                  {/* Slides */}
                  {material.slides && material.slides.length > 0 && (
                    <div>
                      {material.slides.map((slide, index) => (
                        <a
                          key={index}
                          href={slide}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 mr-2 mb-2"
                        >
                          <FaFilePdf className="mr-2" />
                          Document {index + 1}
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Links */}
                  {material.links && material.links.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-lg font-medium mb-2">Useful Links</h4>
                      <ul className="space-y-2">
                        {material.links.map((link, index) => (
                          <li key={index}>
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:text-indigo-900 flex items-center"
                            >
                              <FaLink className="mr-2" />
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
                  No materials found
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Schedule = () => {
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);
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
  const currentRequestRef = useRef<{ month: number, year: number } | null>(null);

  // Class Materials Modal State
  const [selectedMaterial, setSelectedMaterial] = useState<CalendarMaterial | null>(null);
  const [loadingMaterial, setLoadingMaterial] = useState(false);

  // Homework State
  const [homeworkByClass, setHomeworkByClass] = useState<Record<string, Homework[]>>({});
  const [selectedHomeworkDate, setSelectedHomeworkDate] = useState<Date | null>(null);
  const [homeworkFeedbackByClass, setHomeworkFeedbackByClass] = useState<Record<string, Map<string, boolean>>>({});

  // Add a refresh counter to force updates
  const [homeworkRefreshCounter, setHomeworkRefreshCounter] = useState(0);
  
  // Notes State
  const [prefetchedNotes, setPrefetchedNotes] = useState<ClassNote[]>([]);

  // Add a new useEffect to set the initial day details for the current day
  useEffect(() => {
    // Only proceed if calendar data is loaded, not loading anymore, and we haven't initialized yet
    if (!calendarData || loading || hasInitializedDayDetailsRef.current) return;

    const today = new Date();

    // Check if the loaded calendar data contains the current month/year
    if (calendarData.month === today.getMonth() && calendarData.year === today.getFullYear()) {

      // Set up the day details
      const todayClasses = getClassesForDate(today);

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
    if (!calendarData?.dailyClassMap) return [];

    const dateStr = formatDateForComparison(date);

    // Check if this date exists in dailyClassMap (which excludes cancelled dates)
    if (!calendarData.dailyClassMap[dateStr]) {
      // Date is not in dailyClassMap, which means it has no classes (or all are cancelled)
      return [];
    }

    const classesForDate = calendarData.dailyClassMap[dateStr];
    
    // Create a map of full class info for efficient lookup
    // Support both exact classId match and baseId match (for classes with day suffixes)
    const fullClassInfoMap = new Map<string, CalendarClass>();
    if (calendarData.classes) {
      calendarData.classes.forEach((c: CalendarClass) => {
        const cId = c.id || '';
        const baseId = cId.split('-')[0];
        // Store by both exact ID and base ID for flexible lookup
        fullClassInfoMap.set(cId, c);
        if (baseId !== cId) {
          // Only set baseId if it's not already set (prefer exact match)
          if (!fullClassInfoMap.has(baseId)) {
            fullClassInfoMap.set(baseId, c);
          }
        }
      });
    }
    
    // Use shared utility to process entries without deduplication
    // This allows multiple entries for the same class (e.g., rescheduled + regular)
    return processDailyClassMapEntries<CalendarClass>(classesForDate, fullClassInfoMap);
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
  const getPaymentStatus = (date: Date): { isCompleted: boolean; completedAt?: string; amount?: number; currency?: string } => {
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

    // Find the associated class for this payment due date to get amount and currency
    const associatedClass = calendarData.classes.find(cls => cls.id === paymentDue.classSession.id);
    
    const amount = completedPayment?.amount || associatedClass?.paymentConfig?.amount;
    const currency = completedPayment?.currency || associatedClass?.paymentConfig?.currency;

    return {
      isCompleted: !!completedPayment,
      completedAt: completedPayment?.completedAt,
      amount,
      currency
    };
  };

  // Modify handleClassClick to open modal instead
  const handleClassClick = async (classItem: CalendarClass, date: Date) => {
    if (!calendarData?.materials) return;

    const classId = classItem.id;
    if (!calendarData.materials[classId]) return;

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
        setIsModalOpen(true);
      } else {
        setSelectedMaterial(null);
      }
    } catch (error) {
      toast.error(t.failedToLoad);
    } finally {
      setLoadingMaterial(false);
    }
  };

  const handleDayClick = (date: Date, isPaymentDay: boolean, isPaymentSoon: boolean, shouldScroll: boolean = true) => {
    // Get deduplicated classes using the getClassesForDate function
    const uniqueClasses = getClassesForDate(date);

    // Update the selectedDate to match the clicked date
    setSelectedDate(date);

    // Also update the selectedHomeworkDate to match the clicked date
    // This ensures the homework section is displayed
    setSelectedHomeworkDate(date);

    // Add notes data to classes if available
    const classesWithNotes = uniqueClasses.map(classItem => {
      // Create a copy to avoid mutating the original
      const updatedClass = { ...classItem };
      
      // Set the _displayDate property required by findNoteForClassSession
      updatedClass._displayDate = new Date(date);
      
      // dailyClassMap already provides startTime, endTime, and timezone - trust the backend data
      // Ensure we have a startTime before looking for matching notes
      if (updatedClass.startTime) {
        // Find matching note in the prefetched notes
        const matchingNote = findNoteForClassSession(updatedClass, prefetchedNotes);
        
        // If we found a note, add its data to the class
        if (matchingNote) {
          updatedClass.notes = matchingNote.notes || '';
          updatedClass.privateNotes = matchingNote.privateNotes || '';
        }
      }
      
      return updatedClass;
    });

    // Update the day details
    setSelectedDayDetails({
      date,
      classes: classesWithNotes,
      isPaymentDay,
      isPaymentSoon
    });

    // When a day is clicked, we want to make sure we have the latest homework data
    // This is especially important for days where homework was just added
    if (calendarData) {
      console.log(`Schedule: Day clicked (${date.toISOString().split('T')[0]}), refreshing homework data`);
      // Force a refresh for the selected day
      setHomeworkRefreshCounter(prev => prev + 1);
    }

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
        onDayClick={(date) => {
          setSelectedDate(date);
          handleDayClick(date, isPaymentDay, isPaymentSoon, true);
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
  const handleHomeworkPillClick = (e: React.MouseEvent, date: Date) => {
    e.stopPropagation();
    
    // Update the selectedDate to match the clicked date
    setSelectedDate(date);

    // Set selected date for homework and show day details
    setSelectedHomeworkDate(date);
    
    // Get day details
    const isPaymentDay = isPaymentDueOnDate(date);
    const isPaymentSoon = isPaymentDay ? 
      Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) <= 3 : false;
    
    // Set the day details first
    handleDayClick(date, isPaymentDay, isPaymentSoon, true);
    
    // Force a homework refresh to ensure we have the latest data
    console.log(`Schedule: Homework pill clicked for ${date.toISOString().split('T')[0]}, refreshing homework data`);
    setHomeworkRefreshCounter(prev => prev + 1);
  };

  // Handle class count click
  const handleClassCountClick = (e: React.MouseEvent, date: Date) => {
    e.stopPropagation();
    setSelectedDate(date);
    const isPaymentDay = isPaymentDueOnDate(date);

    // Calculate if payment is soon (within 3 days)
    const daysUntilPayment = isPaymentDay ?
      Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
    const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

    handleDayClick(date, isPaymentDay, isPaymentSoon, true);
  };

  // Handle payment pill click
  const handlePaymentPillClick = (e: React.MouseEvent, date: Date) => {
    e.stopPropagation();
    setSelectedDate(date);
    const isPaymentDay = isPaymentDueOnDate(date);

    // Calculate if payment is soon (within 3 days)
    const daysUntilPayment = isPaymentDay ?
      Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
    const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

    handleDayClick(date, isPaymentDay, isPaymentSoon, true);
  };

  // Add a debug function to window to manually set homework class and date
  useEffect(() => {
    // Only add in development mode
    if (process.env.NODE_ENV !== 'production') {

      // @ts-ignore - Adding to window for debugging
      window.debugHomework = {
        setHomeworkClass: (classId: string, date: string) => {
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

            return true;
          } else {
            return false;
          }
        },
        showHomeworkForDate: (date: string) => {
          const allHomework: { classId: string, homework: Homework[] }[] = [];

          // Check all class IDs for homework on this date
          Object.entries(homeworkByClass).forEach(([classId, homeworkList]) => {
            const homeworkForDate = homeworkList.filter(hw => {
              const hwDateStr = hw.classDate.toISOString().split('T')[0];
              return hwDateStr === date;
            });

            if (homeworkForDate.length > 0) {
              allHomework.push({ classId, homework: homeworkForDate });
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

    // dailyClassMap already provides startTime, endTime, and timezone - trust the backend data
    const startTime = classSession.startTime || '';
    const endTime = classSession.endTime || '';
    const timezone = classSession.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Early validation of time strings
    if (!startTime || !endTime) {
      return '';
    }

    // Get the user's local timezone
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Use our utility function to format the time with both timezones
    // Always show source time (true) to display both original and converted times
    return formatTimeWithTimezones(startTime, endTime, timezone, userTimezone, classSession._displayDate, true);
  };

  const [isModalOpen, setIsModalOpen] = useState(false);

  // Add back the hasInitializedDayDetailsRef
  const hasInitializedDayDetailsRef = useRef<boolean>(false);

  // Add back fetchCalendarDataSafely
  const fetchCalendarDataSafely = useCallback(async (month: number, year: number, isInitialLoad = false) => {
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
      if (isInitialLoad) {
        setLoading(false);
      } else {
        setCalendarLoading(false);
      }
      currentRequestRef.current = null;
      return;
    }

    try {
      // Use different loading state based on whether this is initial load or month change
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setCalendarLoading(true);
      }
      
      const data = await getCalendarData(month, year);
      setCalendarData(data);
    } catch (error) {
      toast.error(t.failedToLoad);
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      } else {
        setCalendarLoading(false);
      }
      currentRequestRef.current = null;
    }
  }, [currentUser, t]);

  // Move fetchHomeworkForAllClasses to before its usage and update it to use refresh counter
  const fetchHomeworkForAllClasses = useCallback(async (forceRefresh = false) => {
    if (!calendarData?.classes || calendarData.classes.length === 0) {
      setHomeworkByClass({});
      return;
    }

    console.log(`Schedule: Fetching homework for all classes, forceRefresh: ${forceRefresh}`);

    // Clear the homework cache if forcing a refresh
    if (forceRefresh) {
      clearHomeworkCache();
    }

    const newHomeworkByClass: Record<string, Homework[]> = {};
    const newHomeworkFeedbackByClass: Record<string, Map<string, boolean>> = {};

    // Get unique class IDs (base IDs)
    const uniqueClassIds = Array.from(new Set(
      calendarData.classes
        .map(classItem => classItem)
        .filter(classItem => classItem.id) // Filter out entries without an id
        .map(classItem => classItem.id ? classItem.id.split('-')[0] : '')
    ));

    // If there are no unique class IDs, just update the state and return early
    if (uniqueClassIds.length === 0) {
      setHomeworkByClass({});
      return;
    }
    
    // Create a date object for the currently displayed month/year
    const displayedDate = new Date(calendarData.year, calendarData.month, 1);

    // Step 1: Fetch all homework for each class
    const homeworkFetchPromises = uniqueClassIds.map(async (classId) => {
      try {
        const homework = await getHomeworkForClass(classId, displayedDate);
        return { classId, homework };
      } catch (error) {
        console.error(`Error fetching homework for class ${classId}:`, error);
        return { classId, homework: [] };
      }
    });

    const homeworkResults = await Promise.all(homeworkFetchPromises);
    
    // Process homework results
    homeworkResults.forEach(({ classId, homework }) => {
      newHomeworkByClass[classId] = homework;
    });
    
    // Step 2: Collect all homework IDs that need feedback checks
    const allHomework: { homeworkId: string, classId: string, dateStr: string }[] = [];
    
    Object.entries(newHomeworkByClass).forEach(([classId, homeworkList]) => {
      homeworkList.forEach(hw => {
        if (hw.id) {
          const dateStr = hw.classDate ? hw.classDate.toISOString().split('T')[0] : '';
          allHomework.push({ 
            homeworkId: hw.id, 
            classId, 
            dateStr 
          });
        }
      });
    });
    
    // Step 3: Fetch feedback status for all homework in batches
    const BATCH_SIZE = 5; // Process 5 homework items at a time to prevent too many parallel requests
    
    for (let i = 0; i < allHomework.length; i += BATCH_SIZE) {
      const batch = allHomework.slice(i, i + BATCH_SIZE);
      
      // Process each batch in parallel
      const batchPromises = batch.map(async ({ homeworkId, classId, dateStr }) => {
        try {
          const submissions = await getHomeworkSubmissions(homeworkId);
          const hasFeedback = submissions.some((sub: HomeworkSubmission) =>
            sub.status === 'graded' && sub.feedback && sub.feedback.trim() !== ''
          );
          
          return { homeworkId, classId, dateStr, hasFeedback };
        } catch (error) {
          console.error(`Error checking feedback for homework ${homeworkId}:`, error);
          return { homeworkId, classId, dateStr, hasFeedback: false };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      // Process batch results
      batchResults.forEach(({ homeworkId, classId, dateStr, hasFeedback }) => {
        if (hasFeedback) {
          if (!newHomeworkFeedbackByClass[classId]) {
            newHomeworkFeedbackByClass[classId] = new Map<string, boolean>();
          }
          
          newHomeworkFeedbackByClass[classId].set(`${homeworkId}_${dateStr}`, true);
        }
      });
    }

    console.log(`Schedule: Finished fetching homework for all classes, found: ${Object.values(newHomeworkByClass).flat().length} assignments`);
    setHomeworkByClass(newHomeworkByClass);
    setHomeworkFeedbackByClass(newHomeworkFeedbackByClass);

  }, [calendarData?.classes, calendarData?.year, calendarData?.month]);

  // Add back the initial homework fetching effect with refresh counter
  useEffect(() => {
    // Skip if we have no data or are loading
    if (!calendarData || loading) return;

    console.log("Schedule: Loading initial homework data");
    fetchHomeworkForAllClasses(homeworkRefreshCounter > 0);
  }, [calendarData, loading, fetchHomeworkForAllClasses, homeworkRefreshCounter]);

  // Set up the homework change subscription
  useEffect(() => {
    // Only subscribe when we have calendar data
    if (!calendarData) return;

    console.log("Schedule: Setting up homework change subscription");
    
    // Subscribe to homework changes to update calendar
    const unsubscribe = subscribeToHomeworkChanges((changedClassId) => {
      console.log(`Schedule: Received homework change notification for class ${changedClassId}`);
      
      // For more reliable updates, especially for first-time submissions:
      // 1. Clear the cache
      clearHomeworkCache();
      
      // 2. Force a refresh of the homework data for all classes
      fetchHomeworkForAllClasses(true);
      
      // 3. Force a refresh by incrementing the counter
      setHomeworkRefreshCounter(prev => prev + 1);
    });
    
    // Cleanup subscription on unmount or when calendarData changes
    return () => {
      console.log("Schedule: Cleaning up homework change subscription");
      unsubscribe();
    };
  }, [calendarData, fetchHomeworkForAllClasses]);

  // Add effect to fetch notes when calendar data changes
  useEffect(() => {
    const fetchNotesForCurrentMonth = async () => {
      // Skip if we have no data, are loading, or don't have calendar data with userData
      if (!calendarData || loading || !calendarData.userData?.teacher) return;
      
      try {        
        // Use the teacher ID from userData, not the current user's ID
        const teacherId = calendarData.userData.teacher;
        
        // Check if user is admin (used for authorization optimization)
        const isAdmin = calendarData.userData.isAdmin || false;
        
        // Get unique class IDs from calendar data to comply with security rules
        const uniqueClassIds = Array.from(new Set(
          calendarData.classes
            .map(classItem => classItem.id)
            .filter(Boolean) // Remove undefined/null values
        ));
        
        if (uniqueClassIds.length === 0) {
          setPrefetchedNotes([]);
          return;
        }
        
        // Use the new function to fetch notes for all classes at once
        const allNotes = await fetchNotesByMonthTeacherAndClasses(
          calendarData.month + 1, // Convert from 0-indexed to 1-indexed month
          calendarData.year,
          teacherId,
          uniqueClassIds,
          isAdmin
        );
        
        setPrefetchedNotes(allNotes);
      } catch (error) {
        console.error('Error fetching notes:', error);
      }
    };
    
    fetchNotesForCurrentMonth();
  }, [calendarData, loading]);

  // Add a ref to track if we've handled masquerade change
  const hasMasqueradeChangeRef = useRef(false);

  // Modify the masquerade effect to prevent infinite loops
  useEffect(() => {
    // Skip if we've already handled this masquerade change
    if (hasMasqueradeChangeRef.current) return;

    // Skip if not masquerading and no masquerade user
    if (!isMasquerading && !masqueradingAs) return;

    // Clear the calendar cache when masquerading status changes
    invalidateCalendarCache();

    // Reset the initial load flag to force a new data fetch
    isInitialLoadRef.current = true;
    hasInitializedDayDetailsRef.current = false;

    // Clear homework cache and state
    setHomeworkByClass({});
    setHomeworkFeedbackByClass({});

    // If we have a current user, fetch the data again
    if (currentUser) {
      const month = selectedDate.getMonth();
      const year = selectedDate.getFullYear();
      fetchCalendarDataSafely(month, year, true).then(() => {
        // After calendar data is loaded, set initial load to false
        isInitialLoadRef.current = false;
      });
    }

    // Mark that we've handled this masquerade change
    hasMasqueradeChangeRef.current = true;
  }, [isMasquerading, masqueradingAs, currentUser, selectedDate, fetchCalendarDataSafely]);

  // Modify the initial data loading effect
  useEffect(() => {
    // Only proceed if we have a user and haven't loaded data yet
    if (!currentUser || !isInitialLoadRef.current) return;

    const month = selectedDate.getMonth();
    const year = selectedDate.getFullYear();

    fetchCalendarDataSafely(month, year, true).then(() => {
      // After initial calendar data is loaded, set initial load to false
      isInitialLoadRef.current = false;
    });
  }, [currentUser, selectedDate, fetchCalendarDataSafely]);

  // Add cleanup effect for masquerade handling
  useEffect(() => {
    return () => {
      hasMasqueradeChangeRef.current = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative min-h-screen bg-transparent" style={{
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
              isLoading={calendarLoading}
              onMonthChange={(date) => {
                // Update selected date
                setSelectedDate(date);
                // Fetch data for the new month
                const newMonth = date.getMonth();
                const newYear = date.getFullYear();
                fetchCalendarDataSafely(newMonth, newYear, false);
                
                // Also fetch notes for the new month
                if (calendarData?.userData?.teacher) {
                  // Clear existing notes
                  setPrefetchedNotes([]);
                  
                  // Use the teacher ID from userData, not the current user's ID
                  const teacherId = calendarData.userData.teacher;
                  
                  // Check if user is admin (used for authorization optimization)
                  const isAdmin = calendarData.userData.isAdmin || false;
                  
                  // Get unique class IDs from calendar data to comply with security rules
                  const uniqueClassIds = Array.from(new Set(
                    calendarData.classes
                      .map(classItem => classItem.id)
                      .filter(Boolean) // Remove undefined/null values
                  ));
                  
                  if (uniqueClassIds.length === 0) {
                    setPrefetchedNotes([]);
                    return;
                  }
                  
                  // Use the new function to fetch notes for all classes at once
                  fetchNotesByMonthTeacherAndClasses(
                    newMonth + 1, 
                    newYear, 
                    teacherId,
                    uniqueClassIds,
                    isAdmin
                  )
                    .then(allNotes => {
                      setPrefetchedNotes(allNotes);
                    })
                    .catch(error => console.error('Error fetching notes:', error));
                }
              }}
              onDayClick={(date: Date) => {
                // Update selectedDate
                setSelectedDate(date);

                const isPaymentDay = isPaymentDueOnDate(date);

                const daysUntilPayment = isPaymentDay ?
                  Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
                const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

                handleDayClick(date, isPaymentDay, isPaymentSoon, true);
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
                  <div className={`flex flex-col p-3 rounded-lg mb-4 ${getPaymentStatus(selectedDayDetails.date).isCompleted
                    ? 'bg-[#f0fdf4]'  // Light green background for completed payments
                    : 'bg-[#fffbeb]'  // Original yellow background for pending payments
                    }`}>
                    <div className="flex items-center gap-2">
                      <div className={`${getPaymentStatus(selectedDayDetails.date).isCompleted
                        ? 'bg-[#22c55e]'
                        : selectedDayDetails.isPaymentSoon
                          ? 'bg-[#ef4444]'
                          : 'bg-[#f59e0b]'
                        }`} />
                      <div>
                        <span className={`text-sm font-medium ${getPaymentStatus(selectedDayDetails.date).isCompleted
                          ? 'text-[#22c55e]'
                          : 'text-[#f59e0b]'
                          }`}>
                          {getPaymentStatus(selectedDayDetails.date).isCompleted
                            ? t.paymentCompleted
                            : t.paymentDue}
                        </span>
                        {selectedDayDetails.isPaymentSoon && !getPaymentStatus(selectedDayDetails.date).isCompleted && (
                          <span className="text-xs ml-2 text-[#ef4444]">Due soon</span>
                        )}
                      </div>
                    </div>

                    {/* Show payment amount if available */}
                    {getPaymentStatus(selectedDayDetails.date).amount && (
                      <div className="mt-3 ml-4">
                        <div className="flex items-baseline">
                          <span className="text-md font-medium text-gray-500 mr-2">{t.amount || 'Amount'}:</span>
                          <span className={`text-xl font-bold ${getPaymentStatus(selectedDayDetails.date).isCompleted
                            ? 'text-[#22c55e]'  // Green for completed payments
                            : selectedDayDetails.isPaymentSoon
                              ? 'text-[#ef4444]' // Red for payments due soon
                              : 'text-[#f59e0b]' // Orange/yellow for regular pending payments
                            }`}>
                            {getPaymentStatus(selectedDayDetails.date).currency === 'USD' ? '$' : 
                             getPaymentStatus(selectedDayDetails.date).currency === 'EUR' ? '€' : 
                             getPaymentStatus(selectedDayDetails.date).currency || '$'}
                            {getPaymentStatus(selectedDayDetails.date).amount?.toLocaleString(
                              language === 'pt-BR' ? 'pt-BR' : 'en-US',
                              { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                            )}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Show completion date if payment is completed */}
                    {getPaymentStatus(selectedDayDetails.date).isCompleted && getPaymentStatus(selectedDayDetails.date).completedAt && (
                      <div className="mt-2 ml-4 text-sm text-[#22c55e]">
                        {t.completedOn}: {formatLocalizedDate(new Date(getPaymentStatus(selectedDayDetails.date).completedAt!), language)}
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

                    // dailyClassMap already provides startTime, endTime, and timezone - trust the backend data
                    let updatedClass = { ...classItem };
                    
                    // Check if this is a rescheduled class
                    const isRescheduled = (updatedClass as any).isRescheduled || updatedClass.isRescheduledTo;
                    const originalDate = (updatedClass as any).originalDate || updatedClass.originalDate;
                    const originalStartTime = (updatedClass as any).originalStartTime || updatedClass.originalStartTime;
                    const originalEndTime = (updatedClass as any).originalEndTime || updatedClass.originalEndTime;
                    
                    // Convert originalDate to Date if it's a string, using timezone-aware parsing
                    let originalDateObj: Date | null = null;
                    if (originalDate) {
                      if (originalDate instanceof Date) {
                        // Legacy: Date object (shouldn't happen with new backend, but handle for backward compatibility)
                        originalDateObj = originalDate;
                      } else if (typeof originalDate === 'string') {
                        // Parse date string in the class's timezone to avoid timezone conversion issues
                        try {
                          const classTimezone = updatedClass.timezone || 'UTC';
                          originalDateObj = parseDateStringInTimezone(originalDate, classTimezone);
                        } catch (error) {
                          console.error('Error parsing originalDate:', error, originalDate);
                          // Fallback to simple parsing if helper fails
                          originalDateObj = new Date(originalDate);
                        }
                      }
                    }

                    return (
                      <div
                        key={classItem.id}
                        onClick={() => hasMaterials && handleClassClick(classItem, selectedDayDetails.date)}
                        className={`p-4 rounded-xl mb-4 last:mb-0 border ${hasMaterials
                          ? 'border-[#e0e7ff] bg-[#f5f7ff] hover:border-[#c7d2fe] hover:bg-[#eef2ff] cursor-pointer'
                          : 'border-[#f0f0f0] bg-[#f8f8f8]'
                          } transition-colors`}
                      >
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-2 h-2 rounded-full bg-[#6366f1]" />
                          <span className="text-sm font-medium text-[#1a1a1a]">
                            {isRescheduled ? (t.exceptions?.rescheduledClass || 'Rescheduled Class') : t.class}
                          </span>
                        </div>
                        
                        {isRescheduled && originalDateObj && !isNaN(originalDateObj.getTime()) && (
                          <div className="text-xs text-[#6b7280] mb-3">
                            {t.exceptions?.rescheduledFrom || 'Rescheduled from'}: {formatLocalizedDate(originalDateObj, language)}
                            {originalStartTime && originalEndTime && (
                              <span> at {formatTimeToAMPM(originalStartTime)} - {formatTimeToAMPM(originalEndTime)}</span>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2">
                          <span className="text-sm font-medium text-[#4b5563]">{t.dayOfWeek}</span>
                          <span className="text-sm text-[#1a1a1a]">{formatLocalizedDate(selectedDayDetails.date, language)}</span>

                          <span className="text-sm font-medium text-[#4b5563]">{t.time}</span>
                          <span className="text-sm text-[#1a1a1a]">
                            {formatClassTime(updatedClass)}
                          </span>

                          
                        </div>

                        {/* Notes section with enhanced styling that pops out */}
                        {updatedClass.notes && (
                          <div className="mt-3 p-3 bg-gradient-to-r from-amber-50 to-amber-100 border-l-3 border-amber-500 rounded-md shadow-sm transform transition-all duration-200 hover:scale-[1.01]">
                            <div className="flex items-start">
                              <div className="bg-amber-500 p-1.5 rounded-full mr-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                                </svg>
                              </div>
                              <div>
                                <h4 className="text-sm font-semibold text-amber-800 mb-0.5">{t.notes || 'Class Notes'}</h4>
                                <div className="text-xs leading-relaxed text-amber-900">{updatedClass.notes}</div>
                              </div>
                            </div>
                          </div>
                        )}

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
                          <div 
                            className="mt-4 pt-4 border-t border-[#e5e7eb]" 
                            onClick={(e) => e.stopPropagation()}
                          >
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

        {/* Add Modal */}
        <MaterialsModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedMaterial(null);
          }}
          material={selectedMaterial}
          loading={loadingMaterial}
        />
      </div>
    </div>
  ); 
} 