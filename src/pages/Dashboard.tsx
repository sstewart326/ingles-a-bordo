import { useState, useEffect, useCallback, useRef } from 'react';
import { where } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { useAdmin } from '../hooks/useAdmin';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { getCachedCollection } from '../utils/firebaseUtils';
import { Calendar } from '../components/Calendar';
import '../styles/calendar.css';
import {
  ClassSession,
  User,
  isClassPastToday,
  isClassUpcoming
} from '../utils/scheduleUtils';
import { styles } from '../styles/styleUtils';
import { getClassMaterials, updateClassMaterialItem } from '../utils/classMaterialsUtils';
import { FaFilePdf, FaLink, FaPlus, FaTrash } from 'react-icons/fa';
import { ClassMaterial } from '../types/interfaces';
import { toast } from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';
import { updateCachedDocument } from '../utils/firebaseUtils';
import { PencilIcon } from '@heroicons/react/24/outline';
import { UploadMaterialsForm } from '../components/UploadMaterialsForm';
import Modal from '../components/Modal';

// Add a new interface for the class time modal
interface ClassTimeModal {
  isOpen: boolean;
  position: { x: number, y: number };
  classes: ClassSession[];
  date: Date;
}

export const Dashboard = () => {
  const [upcomingClasses, setUpcomingClasses] = useState<ClassSession[]>([]);
  const [pastClasses, setPastClasses] = useState<ClassSession[]>([]);
  const [upcomingClassesPage, setUpcomingClassesPage] = useState(0);
  const [pastClassesPage, setPastClassesPage] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
  const [selectedDayDetails, setSelectedDayDetails] = useState<{
    date: Date;
    classes: ClassSession[];
    paymentsDue: { user: User; classSession: ClassSession }[];
    materials: Record<string, ClassMaterial[]>;
  } | null>(null);
  const [userNames, setUserNames] = useState<{[email: string]: string}>({});
  const [users, setUsers] = useState<User[]>([]);
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set());
  const [loadedMaterialMonths, setLoadedMaterialMonths] = useState<Set<string>>(new Set());
  const [editingNotes, setEditingNotes] = useState<{[classId: string]: string}>({});
  const [savingNotes, setSavingNotes] = useState<{[classId: string]: boolean}>({});
  const [classMaterials, setClassMaterials] = useState<Record<string, ClassMaterial[]>>({});
  const [deletingMaterial, setDeletingMaterial] = useState<{[materialId: string]: boolean}>({});
  const { currentUser } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { language } = useLanguage();
  const t = useTranslation(language);
  const [hoverData, setHoverData] = useState<{
    classes: ClassSession[];
    position: { x: number; y: number };
  } | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const upcomingClassesSectionRef = useRef<HTMLDivElement>(null);
  const pastClassesSectionRef = useRef<HTMLDivElement>(null);
  const textareaRefs = useRef<{[key: string]: HTMLTextAreaElement | null}>({});
  const [visibleUploadForm, setVisibleUploadForm] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Add state for the class time modal
  const [classTimeModal, setClassTimeModal] = useState<ClassTimeModal>({
    isOpen: false,
    position: { x: 0, y: 0 },
    classes: [],
    date: new Date()
  });
  
  // Add a ref for detecting clicks outside the modal
  const classTimeModalRef = useRef<HTMLDivElement>(null);

  // Add shared utility function at the top of the component
  const parseTimeToMinutes = (time: string): number => {
    if (!time) return 0;
    
    // Remove any AM/PM and spaces
    const cleanTime = time.toLowerCase().replace(/[ap]m\s*/g, '');
    const [hours, minutes] = cleanTime.split(':').map(Number);
    
    let totalMinutes = hours * 60 + minutes;
    
    // Handle AM/PM
    if (time.toLowerCase().includes('pm') && hours !== 12) {
      totalMinutes += 12 * 60;
    } else if (time.toLowerCase().includes('am') && hours === 12) {
      totalMinutes = minutes;
    }
    
    return totalMinutes;
  };

  const sortClassesByTime = (classes: ClassSession[]) => {
    return [...classes].sort((a, b) => {
      // First sort by day of week
      const dayDiff = (a.dayOfWeek || 0) - (b.dayOfWeek || 0);
      if (dayDiff !== 0) return dayDiff;
      
      // Then sort by time
      const timeA = a.startTime || '';
      const timeB = b.startTime || '';
      
      return parseTimeToMinutes(timeA) - parseTimeToMinutes(timeB);
    });
  };

  const formatStudentNames = (studentEmails: string[]) => {
    const names = studentEmails.map(email => userNames[email] || email);

    if (names.length === 0) return t.class;
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${t.pair}: ${names.join(' & ')}`;
    return `${t.group}: ${names.join(', ')}`;
  };

  // Utility function to check if a date is within the relevant month range
  const isDateInRelevantMonthRange = (date: Date): boolean => {
    const dateMonth = date.getMonth();
    const dateYear = date.getFullYear();
    const currentMonth = selectedDate.getMonth();
    const currentYear = selectedDate.getFullYear();
    
    return (
      (dateMonth === currentMonth && dateYear === currentYear) || // Current month
      (dateMonth === currentMonth - 1 && dateYear === currentYear) || // Previous month
      (dateMonth === currentMonth + 1 && dateYear === currentYear) || // Next month
      // Handle year boundary cases
      (dateMonth === 11 && currentMonth === 0 && dateYear === currentYear - 1) || // December of previous year
      (dateMonth === 0 && currentMonth === 11 && dateYear === currentYear + 1)    // January of next year
    );
  };

  // Utility function to generate month keys for tracking loaded data
  const getMonthKey = (date: Date, offset: number = 0): string => {
    const year = date.getFullYear();
    const month = date.getMonth() + offset;
    
    // Handle year boundaries
    if (month < 0) {
      return `${year - 1}-${11}`; // December of previous year
    } else if (month > 11) {
      return `${year + 1}-${0}`; // January of next year
    }
    
    return `${year}-${month}`;
  };

  // Utility function to get the three relevant month keys (previous, current, next)
  const getRelevantMonthKeys = (date: Date): string[] => {
    return [
      getMonthKey(date, -1), // Previous month
      getMonthKey(date, 0),  // Current month
      getMonthKey(date, 1)   // Next month
    ];
  };

  const fetchClasses = useCallback(async (targetDate: Date = selectedDate) => {
    if (!currentUser || adminLoading) return;

    try {
      // Get the current month and adjacent months
      const monthsToLoad = getRelevantMonthKeys(targetDate);
      
      // Check if we've already loaded these months
      const newMonthsToLoad = monthsToLoad.filter(monthKey => !loadedMonths.has(monthKey));
      
      // Initialize empty arrays instead of spreading existing arrays
      let upcoming: ClassSession[] = [];
      let past: ClassSession[] = [];
      
      if (newMonthsToLoad.length === 0) {
        // Even if months are loaded, we still need to fetch materials
      } else {
        const queryConstraints = isAdmin 
          ? [] 
          : [where('studentEmails', 'array-contains', currentUser.email)];

        const allClasses = await getCachedCollection<ClassSession>(
          'classes',
          queryConstraints,
          { userId: currentUser.uid }
        );

        // Transform the classes to include the required fields
        const transformedClasses: ClassSession[] = allClasses.map(classDoc => ({
          ...classDoc,
          paymentConfig: classDoc.paymentConfig || {
            type: 'monthly',
            monthlyOption: 'first',
            startDate: classDoc.startDate?.toDate().toISOString().split('T')[0] || new Date().toISOString().split('T')[0]
          }
        }));

        // Fetch all unique student emails
        const uniqueEmails = new Set<string>();
        transformedClasses.forEach(classSession => {
          classSession.studentEmails.forEach(email => uniqueEmails.add(email));
        });

        // Fetch user data for all students
        const userDocs = await getCachedCollection<User>('users', [
          where('email', 'in', Array.from(uniqueEmails))
        ], { userId: currentUser.uid });

        // Create a map of email to user data
        const userMap = new Map<string, User>();
        userDocs.forEach(user => {
          userMap.set(user.email, user);
          userNames[user.email] = user.name;
        });
        setUserNames(userNames);
        setUsers(userDocs);

        transformedClasses.forEach(classSession => {
          if (isClassPastToday(classSession.dayOfWeek || 0, classSession.startTime)) {
            past.push(classSession);
          } else if (isClassUpcoming(classSession.dayOfWeek || 0, classSession.startTime)) {
            upcoming.push(classSession);
          }
        });

        // Sort both arrays using the shared function
        upcoming = sortClassesByTime(upcoming);
        past = sortClassesByTime(past);

        setUpcomingClasses(upcoming);
        setPastClasses(past);
        
        // Reset pagination when fetching new data
        setUpcomingClassesPage(0);
        setPastClassesPage(0);
        
        // Update loaded months
        const updatedLoadedMonths = new Set(loadedMonths);
        newMonthsToLoad.forEach(month => updatedLoadedMonths.add(month));
        setLoadedMonths(updatedLoadedMonths);
      }
      
      // Always fetch materials, regardless of whether new months were loaded
      const fetchMaterialsForClasses = async () => {
        // Create a new materials map instead of spreading the existing one
        const materialsMap: Record<string, ClassMaterial[]> = {};
        
        // Fetch materials for upcoming classes
        for (const classSession of upcoming) {
          try {
            const nextDate = getNextClassDate(classSession);
            if (nextDate) {
              const materials = await getClassMaterials(classSession.id, nextDate);
              if (materials.length > 0) {
                materialsMap[classSession.id] = materials;
              }
            }
          } catch (error) {
            console.error('Error fetching materials for upcoming class:', classSession.id, error);
          }
        }
        
        // Fetch materials for past classes
        for (const classSession of past) {
          try {
            const prevDate = getPreviousClassDate(classSession);
            if (prevDate) {
              const materials = await getClassMaterials(classSession.id, prevDate);
              if (materials.length > 0) {
                materialsMap[classSession.id] = materials;
              }
            }
          } catch (error) {
            console.error('Error fetching materials for past class:', classSession.id, error);
          }
        }
        
        setClassMaterials(materialsMap);
      };
      
      fetchMaterialsForClasses();
      
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  }, [currentUser, adminLoading, isAdmin, loadedMonths, selectedDate]);

  useEffect(() => {
    fetchClasses();
    
    // Add resize event listener to update mobile view state
    const handleResize = () => {
      const newIsMobileView = window.innerWidth < 768;
      
      // If view mode changed (mobile to desktop or desktop to mobile)
      if (newIsMobileView !== isMobileView) {
        // Reset pagination to avoid showing empty pages
        setUpcomingClassesPage(0);
        setPastClassesPage(0);
        setIsMobileView(newIsMobileView);
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Clean up event listener on component unmount
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [fetchClasses, isMobileView]);
  
  // Add an effect to fetch classes when the month changes
  useEffect(() => {
    fetchClasses(selectedDate);
  }, [selectedDate.getMonth(), selectedDate.getFullYear()]);

  useEffect(() => {
    const handleMouseMove = () => {
      if (hoverData) {
        setHoverData(null);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      if (hoverTimeoutRef.current) {
        window.clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [hoverData]);

  const formatClassTime = (classSession: ClassSession) => {
    if (classSession.dayOfWeek !== undefined && classSession.startTime && classSession.endTime) {
      // Get timezone abbreviation
      const timezone = new Intl.DateTimeFormat('en', {
        timeZoneName: 'short',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }).formatToParts(new Date())
        .find(part => part.type === 'timeZoneName')?.value || '';

      // Format times to ensure they have AM/PM if not present
      const formatTimeString = (timeStr: string) => {
        if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
        const [hours, minutes] = timeStr.split(':').map(Number);
        const period = hours >= 12 ? 'PM' : 'AM';
        const hour12 = hours % 12 || 12;
        return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
      };

      const formattedStartTime = formatTimeString(classSession.startTime);
      const formattedEndTime = formatTimeString(classSession.endTime);

      return `${formattedStartTime} - ${formattedEndTime} ${timezone}`;
    }
    return '';
  };

  const getNextPaymentDates = (paymentConfig: User['paymentConfig'], classSession: ClassSession, selectedDate: Date) => {
    if (!paymentConfig || !classSession.startDate) {
      return [];
    }
    
    const dates: Date[] = [];
    const startDate = classSession.startDate.toDate();
    startDate.setHours(0, 0, 0, 0);
    
    // Parse the payment start date in local timezone
    const paymentStartDate = paymentConfig.startDate ? 
      new Date(paymentConfig.startDate + 'T00:00:00') : 
      startDate;
    paymentStartDate.setHours(0, 0, 0, 0);
    
    // Get the first and last day of the currently viewed month
    const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);
    
    // If class has ended, no payments
    if (classSession.endDate) {
      const endDate = classSession.endDate.toDate();
      endDate.setHours(23, 59, 59, 999);
      if (endDate < monthStart) {
        return [];
      }
    }

    if (paymentConfig.type === 'weekly') {
      const interval = paymentConfig.weeklyInterval || 1;
      let currentPaymentDate = new Date(paymentStartDate);

      while (currentPaymentDate <= monthEnd) {
        if (currentPaymentDate >= monthStart) {
          dates.push(new Date(currentPaymentDate));
        }
        currentPaymentDate.setDate(currentPaymentDate.getDate() + (7 * interval));
      }
    } else if (paymentConfig.type === 'monthly') {
      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth();

      let paymentDate: Date;
      switch (paymentConfig.monthlyOption) {
        case 'first':
          paymentDate = new Date(year, month, 1);
          break;
        case 'fifteen':
          paymentDate = new Date(year, month, 15);
          break;
        case 'last':
          paymentDate = new Date(year, month + 1, 0);
          break;
        default:
          return dates;
      }
      
      if (paymentDate >= paymentStartDate && 
          (!classSession.endDate || paymentDate <= classSession.endDate.toDate())) {
        dates.push(paymentDate);
      }
    }
    
    return dates;
  };

  const handleDayClick = (date: Date, classes: ClassSession[], paymentsDue: { user: User; classSession: ClassSession }[]) => {
    // Update the selected date
    setSelectedDate(date);
    
    // Check if we've already loaded materials for this month
    const monthKey = getMonthKey(date);
    const materialsAlreadyLoaded = loadedMaterialMonths.has(monthKey);
    
    // Fetch materials for each class on this date
    const fetchMaterials = async () => {
      const materialsMap: Record<string, ClassMaterial[]> = {};
      
      for (const classSession of classes) {
        try {
          // Only fetch if we haven't loaded materials for this month yet
          if (!materialsAlreadyLoaded) {
            const materials = await getClassMaterials(classSession.id, date);
            if (materials.length > 0) {
              materialsMap[classSession.id] = materials;
            }
          } else {
            // If we've already loaded materials for this month, use cached data
            // This is handled by the getClassMaterials function which checks the cache
            const materials = await getClassMaterials(classSession.id, date);
            if (materials.length > 0) {
              materialsMap[classSession.id] = materials;
            }
          }
        } catch (error) {
          console.error('Error fetching materials for class:', classSession.id, error);
        }
      }
      
      // If we've loaded materials for this month before, use the existing data
      if (materialsAlreadyLoaded) {
        console.log('Using cached materials for month:', monthKey);
      } else {
        // Update the set of months for which we've loaded materials
        const updatedLoadedMaterialMonths = new Set(loadedMaterialMonths);
        updatedLoadedMaterialMonths.add(monthKey);
        setLoadedMaterialMonths(updatedLoadedMaterialMonths);
      }
      
      setSelectedDayDetails({
        date,
        classes,
        paymentsDue,
        materials: materialsMap
      });
    };

    // Initialize with empty materials while fetching
    setSelectedDayDetails({
      date,
      classes,
      paymentsDue,
      materials: {}
    });

    fetchMaterials();

    // Check if we're on mobile (screen width less than 1024px - lg breakpoint in Tailwind)
    if (window.innerWidth < 1024 && detailsRef.current) {
      // Add a small delay to ensure the details content is rendered
      setTimeout(() => {
        detailsRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  const getClassesForDay = (dayOfWeek: number, date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const calendarDate = new Date(date);
    calendarDate.setHours(0, 0, 0, 0);
    
    // Check if the date is within the current month or adjacent months
    if (!isDateInRelevantMonthRange(date)) {
      return [];
    }
    
    const classes = upcomingClasses.filter(classItem => {
      if (classItem.dayOfWeek !== dayOfWeek) return false;
      
      // Check if the class has started (startDate has passed)
      if (classItem.startDate) {
        const startDate = classItem.startDate.toDate();
        startDate.setHours(0, 0, 0, 0);
        if (startDate > calendarDate) return false;
      }

      // If class has no end date, it's recurring
      if (!classItem.endDate) return true;
      
      // Check if the class hasn't ended yet
      const endDate = classItem.endDate.toDate();
      endDate.setHours(0, 0, 0, 0);
      return endDate >= calendarDate;
    });

    // Use the shared sorting function
    return sortClassesByTime(classes);
  };

  // Function to get the next occurrence date of a class
  const getNextClassDate = (classSession: ClassSession): Date | null => {
    if (!classSession.dayOfWeek && classSession.dayOfWeek !== 0) return null;
    
    const today = new Date();
    const currentDayOfWeek = today.getDay();
    const targetDayOfWeek = classSession.dayOfWeek;
    
    // Calculate days until next occurrence
    let daysUntilNext = targetDayOfWeek - currentDayOfWeek;
    if (daysUntilNext <= 0) {
      // If today or earlier in the week, move to next week
      daysUntilNext += 7;
    }
    
    // If it's the same day, check if the class has already passed
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
      
      // If the class time has passed, move to next week
      if (today > classTime) {
        daysUntilNext = 7;
      }
    }
    
    // Create the next class date
    const nextDate = new Date();
    nextDate.setDate(today.getDate() + daysUntilNext);
    nextDate.setHours(0, 0, 0, 0);
    
    return nextDate;
  };
  
  // Function to get the previous occurrence date of a class
  const getPreviousClassDate = (classSession: ClassSession): Date | null => {
    if (!classSession.dayOfWeek && classSession.dayOfWeek !== 0) return null;
    
    const today = new Date();
    const currentDayOfWeek = today.getDay();
    const targetDayOfWeek = classSession.dayOfWeek;
    
    // Calculate days since last occurrence
    let daysSinceLast = currentDayOfWeek - targetDayOfWeek;
    if (daysSinceLast < 0) {
      // If later in the week, get from previous week
      daysSinceLast += 7;
    }
    
    // If it's the same day, check if the class has already passed
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
      
      // If the class time hasn't passed yet, get from previous week
      if (today < classTime) {
        daysSinceLast = 7;
      }
    }
    
    // Create the previous class date
    const prevDate = new Date();
    prevDate.setDate(today.getDate() - daysSinceLast);
    prevDate.setHours(0, 0, 0, 0);
    
    return prevDate;
  };

  // Function to format date based on language
  const formatClassDate = (date: Date | null): string => {
    if (!date) return '';
    
    return date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  };

  const openModal = (classId: string) => {
    setVisibleUploadForm(classId);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setVisibleUploadForm(null);
  };

  const renderUploadMaterialsSection = (classSession: ClassSession, date: Date) => (
    <Modal isOpen={isModalOpen && visibleUploadForm === classSession.id} onClose={closeModal}>
      <UploadMaterialsForm
        classId={classSession.id}
        classDate={date}
        studentEmails={classSession.studentEmails}
        onUploadSuccess={async () => {
          // First close the modal
          closeModal();
          
          // Then fetch the updated materials specifically for this class
          try {
            const materials = await getClassMaterials(classSession.id, date);
            
            // Update the materials state for all relevant sections
            setClassMaterials(prevMaterials => ({
              ...prevMaterials,
              [classSession.id]: materials
            }));

            // Update selected day details if they exist and match the current class
            if (selectedDayDetails && selectedDayDetails.classes.some(c => c.id === classSession.id)) {
              setSelectedDayDetails({
                ...selectedDayDetails,
                materials: {
                  ...selectedDayDetails.materials,
                  [classSession.id]: materials
                }
              });
            }

            // Update upcoming and past classes to include the new materials
            setUpcomingClasses(prevClasses => 
              prevClasses.map(c => 
                c.id === classSession.id 
                  ? { ...c, materials } 
                  : c
              )
            );

            setPastClasses(prevClasses => 
              prevClasses.map(c => 
                c.id === classSession.id 
                  ? { ...c, materials } 
                  : c
              )
            );

            // Update the loaded material months to ensure we don't reload unnecessarily
            const monthKey = getMonthKey(date);
            setLoadedMaterialMonths(prev => new Set([...prev, monthKey]));
            
            toast.success('Materials uploaded successfully');
          } catch (error) {
            console.error('Error fetching updated materials:', error);
            toast.error('Error updating materials');
          }
        }}
      />
    </Modal>
  );

  const handleUpcomingClassesPagination = (newPage: number) => {
    setUpcomingClassesPage(newPage);
    // Add a small delay to ensure the state is updated before scrolling
    setTimeout(() => {
      upcomingClassesSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handlePastClassesPagination = (newPage: number) => {
    setPastClassesPage(newPage);
    // Add a small delay to ensure the state is updated before scrolling
    setTimeout(() => {
      pastClassesSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const renderUpcomingClassesSection = () => {
    const pageSize = isMobileView ? 2 : 3; // Show 2 classes on mobile, 5 on desktop
    const startIndex = upcomingClassesPage * pageSize;
    const displayedClasses = upcomingClasses.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < upcomingClasses.length;
    
    return (
      <div className="max-w-2xl" ref={upcomingClassesSectionRef}>
        <h2 className={styles.headings.h2}>{t.upcomingClasses}</h2>
        <div className="mt-4 space-y-4">
          {displayedClasses.length === 0 ? (
            <p className="text-gray-500">{t.noUpcomingClasses}</p>
          ) : (
            <>
              {displayedClasses.map((classSession) => (
                <div key={classSession.id} className={styles.card.container}>
                  <div className="flex justify-between items-start w-full">
                    <div className="w-full">
                      <div className="text-sm font-bold text-black mb-2">
                        {formatClassDate(getNextClassDate(classSession))}
                      </div>
                      <div className={styles.card.title}>
                        {formatStudentNames(classSession.studentEmails)}
                      </div>
                      <div className={styles.card.subtitle}>
                        {formatClassTime(classSession)}
                      </div>
                      
                      {/* Notes section */}
                      <div className="mt-2 w-full">
                        <div className={styles.card.label}>{t.notes || 'Notes'}</div>
                        
                        {editingNotes[classSession.id] !== undefined ? (
                          <div className="mt-1 w-full">
                            <textarea
                              ref={(el) => { textareaRefs.current[classSession.id] = el; }}
                              defaultValue={editingNotes[classSession.id]}
                              className="w-full p-2 border border-gray-300 rounded text-sm"
                              rows={3}
                            />
                            <div className="flex justify-end mt-2 space-x-2">
                              <button
                                onClick={() => handleCancelEditNotes(classSession.id)}
                                className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                disabled={savingNotes[classSession.id]}
                              >
                                {t.cancel || 'Cancel'}
                              </button>
                              <button
                                onClick={() => handleSaveNotes(classSession)}
                                className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                                disabled={savingNotes[classSession.id]}
                              >
                                {savingNotes[classSession.id] 
                                  ? 'Saving...' 
                                  : 'Save'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-gray-700 text-sm mt-1 flex items-center">
                            <span>{classSession.notes || (t.noNotes || 'No notes available')}</span>
                            {!editingNotes[classSession.id] && (
                              <PencilIcon
                                onClick={() => handleEditNotes(classSession)}
                                className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer ml-1 flex-shrink-0"
                                title={t.edit || 'Edit'}
                              />
                            )}
                          </div>
                        )}
                      </div>
                      
                      {/* Materials Section */}
                      {classMaterials[classSession.id] && classMaterials[classSession.id].length > 0 && (
                        <div className="mt-3">
                          <div className="flex justify-between items-center">
                            <div className={styles.card.label}>{t.materials || "Materials"}</div>
                            {isAdmin && (
                              <a 
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  openModal(classSession.id);
                                }}
                                className="text-sm text-blue-600 hover:text-blue-800"
                              >
                                {t.addMaterials}
                              </a>
                            )}
                          </div>
                          <div className="mt-1 space-y-2">
                            {classMaterials[classSession.id].map((material, index) => (
                              <div key={index} className="flex flex-col space-y-2">
                                {material.slides && material.slides.length > 0 && (
                                  <div className="space-y-1">
                                    {material.slides.map((slideUrl, slideIndex) => (
                                      <a 
                                        key={slideIndex}
                                        href={slideUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex items-center text-blue-600 hover:text-blue-800 group"
                                      >
                                        <FaFilePdf className="mr-2" />
                                        <span className="text-sm">{t.slides || "Slides"} {material.slides && material.slides.length > 1 ? `(${slideIndex + 1}/${material.slides.length})` : ''}</span>
                                        {isAdmin && (
                                          <button
                                            onClick={(e) => {
                                              e.preventDefault();
                                              handleDeleteMaterial(material, index, classSession.id, 'slides', slideIndex);
                                            }}
                                            disabled={deletingMaterial[material.classId + index + '_slide_' + slideIndex]}
                                            className="ml-2 text-red-500 hover:text-red-700 transition-colors duration-200 bg-transparent border-0 p-0"
                                            title="Delete material"
                                          >
                                            <FaTrash className="h-2.5 w-2.5" />
                                          </button>
                                        )}
                                      </a>
                                    ))}
                                  </div>
                                )}
                                
                                {material.links && material.links.length > 0 && (
                                  <div className="space-y-1">
                                    {material.links.map((link, linkIndex) => (
                                      <a 
                                        key={linkIndex}
                                        href={link} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex items-center text-blue-600 hover:text-blue-800 group"
                                      >
                                        <FaLink className="mr-2" />
                                        <span className="text-sm truncate">{link}</span>
                                        {isAdmin && (
                                          <button
                                            onClick={(e) => {
                                              e.preventDefault();
                                              handleDeleteMaterial(material, index, classSession.id, 'link', linkIndex);
                                            }}
                                            disabled={deletingMaterial[material.classId + index + '_link_' + linkIndex]}
                                            className="ml-2 text-red-500 hover:text-red-700 transition-colors duration-200 bg-transparent border-0 p-0"
                                            title="Delete link"
                                          >
                                            <FaTrash className="h-2.5 w-2.5" />
                                          </button>
                                        )}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Add Materials Link */}
                      {isAdmin && (!classMaterials[classSession.id] || classMaterials[classSession.id].length === 0) && (
                        <div className="mt-3">
                          <a 
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              openModal(classSession.id);
                            }}
                            className="flex items-center text-blue-600 hover:text-blue-800"
                          >
                            <FaPlus className="mr-2" />
                            <span className="text-sm">{t.addMaterials || 'Add Materials'}</span>
                          </a>
                        </div>
                      )}
                      {isAdmin && renderUploadMaterialsSection(classSession, getNextClassDate(classSession) || new Date())}
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Pagination controls */}
              <div className="flex justify-between items-center mt-4">
                <button
                  onClick={() => handleUpcomingClassesPagination(Math.max(0, upcomingClassesPage - 1))}
                  disabled={upcomingClassesPage === 0}
                  className={`px-3 py-1 rounded ${
                    upcomingClassesPage === 0
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  {t.previous || 'Previous'}
                </button>
                
                <span className="text-sm text-gray-600">
                  {startIndex + 1}-{Math.min(startIndex + pageSize, upcomingClasses.length)} {t.of} {upcomingClasses.length}
                </span>
                
                <button
                  onClick={() => handleUpcomingClassesPagination(upcomingClassesPage + 1)}
                  disabled={!hasMore}
                  className={`px-3 py-1 rounded ${
                    !hasMore
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  {t.next || 'Next'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderPastClassesSection = () => {
    const pageSize = isMobileView ? 2 : 3; // Show 2 classes on mobile, 5 on desktop
    const startIndex = pastClassesPage * pageSize;
    const displayedClasses = pastClasses.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < pastClasses.length;
    
    return (
      <div className="max-w-2xl" ref={pastClassesSectionRef}>
        <h2 className={styles.headings.h2}>{t.pastClasses}</h2>
        <div className="mt-4 space-y-4">
          {displayedClasses.length === 0 ? (
            <p className="text-gray-500">{t.noPastClasses}</p>
          ) : (
            <>
              {displayedClasses.map((classSession) => (
                <div key={classSession.id} className={styles.card.container}>
                  <div className="flex justify-between items-start w-full">
                    <div className="w-full">
                      <div className="text-sm font-bold text-black mb-2">
                        {formatClassDate(getPreviousClassDate(classSession))}
                      </div>
                      <div className={styles.card.title}>
                        {formatStudentNames(classSession.studentEmails)}
                      </div>
                      <div className={styles.card.subtitle}>
                        {formatClassTime(classSession)}
                      </div>
                      
                      {/* Notes section */}
                      <div className="mt-2 w-full">
                        <div className={styles.card.label}>{t.notes || 'Notes'}</div>
                        
                        {editingNotes[classSession.id] !== undefined ? (
                          <div className="mt-1 w-full">
                            <textarea
                              ref={(el) => { textareaRefs.current[classSession.id] = el; }}
                              defaultValue={editingNotes[classSession.id]}
                              className="w-full p-2 border border-gray-300 rounded text-sm"
                              rows={3}
                            />
                            <div className="flex justify-end mt-2 space-x-2">
                              <button
                                onClick={() => handleCancelEditNotes(classSession.id)}
                                className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                disabled={savingNotes[classSession.id]}
                              >
                                {t.cancel || 'Cancel'}
                              </button>
                              <button
                                onClick={() => handleSaveNotes(classSession)}
                                className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                                disabled={savingNotes[classSession.id]}
                              >
                                {savingNotes[classSession.id] 
                                  ? 'Saving...' 
                                  : 'Save'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-gray-700 text-sm mt-1 flex items-center">
                            <span>{classSession.notes || (t.noNotes || 'No notes available')}</span>
                            {!editingNotes[classSession.id] && (
                              <PencilIcon
                                onClick={() => handleEditNotes(classSession)}
                                className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer ml-1 flex-shrink-0"
                                title={t.edit || 'Edit'}
                              />
                            )}
                          </div>
                        )}
                      </div>
                      
                      {/* Materials Section */}
                      {classMaterials[classSession.id] && classMaterials[classSession.id].length > 0 && (
                        <div className="mt-3">
                          <div className="flex justify-between items-center">
                            <div className={styles.card.label}>{t.materials || "Materials"}</div>
                            {isAdmin && (
                              <a 
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  openModal(classSession.id);
                                }}
                                className="text-sm text-blue-600 hover:text-blue-800"
                              >
                                {t.addMaterials}
                              </a>
                            )}
                          </div>
                          <div className="mt-1 space-y-2">
                            {classMaterials[classSession.id].map((material, index) => (
                              <div key={index} className="flex flex-col space-y-2">
                                {material.slides && material.slides.length > 0 && (
                                  <div className="space-y-1">
                                    {material.slides.map((slideUrl, slideIndex) => (
                                      <a 
                                        key={slideIndex}
                                        href={slideUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex items-center text-blue-600 hover:text-blue-800 group"
                                      >
                                        <FaFilePdf className="mr-2" />
                                        <span className="text-sm">{t.slides || "Slides"} {material.slides && material.slides.length > 1 ? `(${slideIndex + 1}/${material.slides.length})` : ''}</span>
                                        {isAdmin && (
                                          <button
                                            onClick={(e) => {
                                              e.preventDefault();
                                              handleDeleteMaterial(material, index, classSession.id, 'slides', slideIndex);
                                            }}
                                            disabled={deletingMaterial[material.classId + index + '_slide_' + slideIndex]}
                                            className="ml-2 text-red-500 hover:text-red-700 transition-colors duration-200 bg-transparent border-0 p-0"
                                            title="Delete material"
                                          >
                                            <FaTrash className="h-2.5 w-2.5" />
                                          </button>
                                        )}
                                      </a>
                                    ))}
                                  </div>
                                )}
                                
                                {material.links && material.links.length > 0 && (
                                  <div className="space-y-1">
                                    {material.links.map((link, linkIndex) => (
                                      <a 
                                        key={linkIndex}
                                        href={link} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex items-center text-blue-600 hover:text-blue-800 group"
                                      >
                                        <FaLink className="mr-2" />
                                        <span className="text-sm truncate">{link}</span>
                                        {isAdmin && (
                                          <button
                                            onClick={(e) => {
                                              e.preventDefault();
                                              handleDeleteMaterial(material, index, classSession.id, 'link', linkIndex);
                                            }}
                                            disabled={deletingMaterial[material.classId + index + '_link_' + linkIndex]}
                                            className="ml-2 text-red-500 hover:text-red-700 transition-colors duration-200 bg-transparent border-0 p-0"
                                            title="Delete link"
                                          >
                                            <FaTrash className="h-2.5 w-2.5" />
                                          </button>
                                        )}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Add Materials Link */}
                      {isAdmin && (!classMaterials[classSession.id] || classMaterials[classSession.id].length === 0) && (
                        <div className="mt-3">
                          <a 
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              openModal(classSession.id);
                            }}
                            className="flex items-center text-blue-600 hover:text-blue-800"
                          >
                            <FaPlus className="mr-2" />
                            <span className="text-sm">{t.addMaterials || 'Add Materials'}</span>
                          </a>
                        </div>
                      )}
                      {isAdmin && renderUploadMaterialsSection(classSession, getPreviousClassDate(classSession) || new Date())}
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Pagination controls */}
              <div className="flex justify-between items-center mt-4">
                <button
                  onClick={() => handlePastClassesPagination(Math.max(0, pastClassesPage - 1))}
                  disabled={pastClassesPage === 0}
                  className={`px-3 py-1 rounded ${
                    pastClassesPage === 0
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  {t.previous || 'Previous'}
                </button>
                
                <span className="text-sm text-gray-600">
                  {startIndex + 1}-{Math.min(startIndex + pageSize, pastClasses.length)} {t.of} {pastClasses.length}
                </span>
                
                <button
                  onClick={() => handlePastClassesPagination(pastClassesPage + 1)}
                  disabled={!hasMore}
                  className={`px-3 py-1 rounded ${
                    !hasMore
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  {t.next || 'Next'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderCalendarDay = (date: Date, isToday: boolean) => {
    const dayOfWeek = date.getDay();
    const dayClasses = getClassesForDay(dayOfWeek, date);
    const paymentsDue = getPaymentsDueForDay(date);
    const isPaymentDay = paymentsDue.length > 0;
    const daysUntilPayment = isPaymentDay ? 
      Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
    const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

    // Function to handle click on the class count pill
    const handleClassCountClick = (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent triggering the calendar day click
      
      // Calculate position for the modal - now using viewport-relative positioning
      const rect = e.currentTarget.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Calculate position to keep modal within viewport
      let x = rect.left + (rect.width / 2);
      let y = rect.bottom + 5;
      
      // Adjust x position if modal would go off screen
      const modalWidth = 300; // maxWidth of modal
      if (x + (modalWidth / 2) > viewportWidth) {
        x = viewportWidth - (modalWidth / 2);
      } else if (x - (modalWidth / 2) < 0) {
        x = modalWidth / 2;
      }
      
      // Adjust y position if modal would go off screen
      const modalHeight = 200; // approximate height
      if (y + modalHeight > viewportHeight) {
        y = rect.top - modalHeight - 5; // position above the pill
      }
      
      setClassTimeModal({
        isOpen: true,
        position: { x, y },
        classes: dayClasses,
        date: date
      });

      // Also open the details section
      handleDayClick(date, dayClasses, paymentsDue);
    };

    // Function to handle click on the payment due pill
    const handlePaymentPillClick = (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent triggering the calendar day click
      
      // Open the details section
      handleDayClick(date, dayClasses, paymentsDue);
    };

    return (
      <div className="h-full flex flex-col">
        {/* Indicators */}
        <div className="calendar-day-indicators">
          {dayClasses.length > 0 && (
            <div className="indicator class-indicator" title="Has classes" />
          )}
          {isPaymentDay && (
            <div 
              className={`indicator ${isPaymentSoon ? 'payment-soon-indicator' : 'payment-indicator'}`}
              title={isPaymentSoon ? 'Payment due soon' : 'Payment due'}
            />
          )}
        </div>

        {/* Date */}
        <div className="flex flex-col items-center">
          <div className={`date-number ${isToday ? 'text-[#6366f1]' : ''} ${isPaymentDay ? (isPaymentSoon ? 'text-[#ef4444]' : 'text-[#f59e0b]') : ''}`}>
            {date.getDate()}
          </div>
        </div>

        {/* Class count and payment pills */}
        <div className="class-details">
          <div className="flex flex-col items-center gap-2">
            {dayClasses.length > 0 && (
              <div 
                className="calendar-pill class-count-pill"
                onClick={handleClassCountClick}
              >
                {dayClasses.length} {dayClasses.length === 1 ? t.class || 'class' : t.class || 'classes'}
              </div>
            )}
            
            {isPaymentDay && (
              <div 
                className={`calendar-pill payment-pill ${isPaymentSoon ? 'soon' : 'normal'}`}
                onClick={handlePaymentPillClick}
              >
                {paymentsDue.length} {paymentsDue.length === 1 ? t.paymentDue || 'payment' : t.paymentDue || 'payments'}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const getPaymentsDueForDay = (date: Date): { user: User; classSession: ClassSession }[] => {
    // Check if the date is within the current month or adjacent months
    if (!isDateInRelevantMonthRange(date)) {
      return [];
    }
    
    const paymentsDue: { user: User; classSession: ClassSession }[] = [];
    
    upcomingClasses.forEach(classSession => {
      if (classSession.paymentConfig) {
        const paymentDates = getNextPaymentDates(classSession.paymentConfig, classSession, selectedDate);
        const isPaymentDue = paymentDates.some(paymentDate => 
          paymentDate.getFullYear() === date.getFullYear() &&
          paymentDate.getMonth() === date.getMonth() &&
          paymentDate.getDate() === date.getDate()
        );
        
        if (isPaymentDue) {
          classSession.studentEmails.forEach(email => {
            const user = users.find(u => u.email === email);
            if (user) {
              paymentsDue.push({ user, classSession });
            }
          });
        }
      }
    });
    
    return paymentsDue;
  };

  const handleMonthChange = (newDate: Date) => {
    setSelectedDate(newDate);
    
    // Check if we need to load data for the new month and adjacent months
    const monthsToCheck = getRelevantMonthKeys(newDate);
    
    const needToLoadNewMonths = monthsToCheck.some(monthKey => !loadedMonths.has(monthKey));
    
    if (needToLoadNewMonths) {
      fetchClasses(newDate);
    }
  };

  // Function to handle editing notes
  const handleEditNotes = useCallback((classSession: ClassSession) => {
    setEditingNotes(prev => ({
      ...prev,
      [classSession.id]: classSession.notes || ''
    }));
  }, []);

  // Function to save notes
  const handleSaveNotes = useCallback(async (classSession: ClassSession) => {
    try {
      setSavingNotes(prev => ({ ...prev, [classSession.id]: true }));
      
      // Get the value directly from the textarea ref
      const textareaValue = textareaRefs.current[classSession.id]?.value || '';
      
      // Update in Firebase
      await updateCachedDocument('classes', classSession.id, {
        notes: textareaValue,
        updatedAt: Timestamp.now()
      }, { userId: currentUser?.uid });
      
      // Update local state
      const updateClassList = (classes: ClassSession[]) => 
        classes.map(c => 
          c.id === classSession.id 
            ? { ...c, notes: textareaValue } 
            : c
        );
      
      setUpcomingClasses(updateClassList);
      setPastClasses(updateClassList);
      
      if (selectedDayDetails && selectedDayDetails.classes) {
        setSelectedDayDetails({
          ...selectedDayDetails,
          classes: updateClassList(selectedDayDetails.classes)
        });
      }
      
      // Clear editing state for this class
      setEditingNotes(prev => {
        const newState = { ...prev };
        delete newState[classSession.id];
        return newState;
      });
      
      toast.success('Notes saved successfully');
    } catch (error) {
      console.error('Error in handleSaveNotes:', error);
      toast.error('Error saving notes');
    } finally {
      setSavingNotes(prev => {
        const newState = { ...prev };
        delete newState[classSession.id];
        return newState;
      });
    }
  }, [selectedDayDetails, t, currentUser]);

  // Function to cancel editing notes
  const handleCancelEditNotes = useCallback((classId: string) => {
    setEditingNotes(prev => {
      const newState = { ...prev };
      delete newState[classId];
      return newState;
    });
  }, []);

  // Function to handle material deletion
  const handleDeleteMaterial = useCallback(async (material: ClassMaterial, index: number, classId: string, type: 'slides' | 'link' = 'slides', itemIndex?: number) => {
    if (!currentUser || !isAdmin) {
      toast.error('Not authorized');
      return;
    }

    try {
      // Set deleting state
      if (type === 'slides') {
        setDeletingMaterial(prev => ({ ...prev, [material.classId + index + '_slide_' + itemIndex]: true }));
      } else if (type === 'link') {
        setDeletingMaterial(prev => ({ ...prev, [material.classId + index + '_link_' + itemIndex]: true }));
      }

      // Call the utility function to update the material
      if (type === 'slides' && typeof itemIndex === 'number') {
        await updateClassMaterialItem(material.classId, material.classDate, 'removeSlides', undefined, itemIndex);
      } else if (type === 'link' && typeof itemIndex === 'number') {
        await updateClassMaterialItem(material.classId, material.classDate, 'removeLink', itemIndex);
      }
      
      // Update local state
      const updatedMaterials = { ...classMaterials };
      
      // Check if we need to update or remove the material from local state
      if (updatedMaterials[classId]) {
        // If we're removing slides, update the material
        if (type === 'slides' && typeof itemIndex === 'number' && material.slides) {
          updatedMaterials[classId] = updatedMaterials[classId].map((m, i) => {
            if (i === index && m.slides) {
              const updatedSlides = [...m.slides];
              updatedSlides.splice(itemIndex, 1);
              return { ...m, slides: updatedSlides };
            }
            return m;
          });
          
          // If this material now has no slides and no links, remove it
          const materialToCheck = updatedMaterials[classId][index];
          if ((!materialToCheck.slides || materialToCheck.slides.length === 0) && 
              (!materialToCheck.links || materialToCheck.links.length === 0)) {
            updatedMaterials[classId] = updatedMaterials[classId].filter((_, i) => i !== index);
          }
        } 
        // If we're removing a link, update the material
        else if (type === 'link' && typeof itemIndex === 'number') {
          updatedMaterials[classId] = updatedMaterials[classId].map((m, i) => {
            if (i === index && m.links) {
              const updatedLinks = [...m.links];
              updatedLinks.splice(itemIndex, 1);
              return { ...m, links: updatedLinks };
            }
            return m;
          });
          
          // If this material now has no slides and no links, remove it
          const materialToCheck = updatedMaterials[classId][index];
          if ((!materialToCheck.slides || materialToCheck.slides.length === 0) && 
              (!materialToCheck.links || materialToCheck.links.length === 0)) {
            updatedMaterials[classId] = updatedMaterials[classId].filter((_, i) => i !== index);
          }
        }
        
        // If no materials left, remove the entry
        if (updatedMaterials[classId].length === 0) {
          delete updatedMaterials[classId];
        }
      }
      
      setClassMaterials(updatedMaterials);
      
      // Update selected day details if needed
      if (selectedDayDetails && selectedDayDetails.materials[classId]) {
        const updatedDayDetails = { ...selectedDayDetails };
        
        // Apply the same logic to selectedDayDetails
        if (type === 'slides' && typeof itemIndex === 'number' && material.slides) {
          updatedDayDetails.materials[classId] = updatedDayDetails.materials[classId].map((m, i) => {
            if (i === index && m.slides) {
              const updatedSlides = [...m.slides];
              updatedSlides.splice(itemIndex, 1);
              return { ...m, slides: updatedSlides };
            }
            return m;
          });
          
          // If this material now has no slides and no links, remove it
          const materialToCheck = updatedDayDetails.materials[classId][index];
          if ((!materialToCheck.slides || materialToCheck.slides.length === 0) && 
              (!materialToCheck.links || materialToCheck.links.length === 0)) {
            updatedDayDetails.materials[classId] = updatedDayDetails.materials[classId].filter((_, i) => i !== index);
          }
        } 
        else if (type === 'link' && typeof itemIndex === 'number') {
          updatedDayDetails.materials[classId] = updatedDayDetails.materials[classId].map((m, i) => {
            if (i === index && m.links) {
              const updatedLinks = [...m.links];
              updatedLinks.splice(itemIndex, 1);
              return { ...m, links: updatedLinks };
            }
            return m;
          });
          
          // If this material now has no slides and no links, remove it
          const materialToCheck = updatedDayDetails.materials[classId][index];
          if ((!materialToCheck.slides || materialToCheck.slides.length === 0) && 
              (!materialToCheck.links || materialToCheck.links.length === 0)) {
            updatedDayDetails.materials[classId] = updatedDayDetails.materials[classId].filter((_, i) => i !== index);
          }
        }
        
        // If no materials left, remove the entry
        if (updatedDayDetails.materials[classId].length === 0) {
          delete updatedDayDetails.materials[classId];
        }
        
        setSelectedDayDetails(updatedDayDetails);
      }
      
      toast.success('Material updated successfully');
    } catch (error) {
      console.error('Error updating material:', error);
      toast.error('Error updating material');
    } finally {
      // Clear deleting state
      if (type === 'slides') {
        setDeletingMaterial(prev => {
          const newState = { ...prev };
          delete newState[material.classId + index + '_slide_' + itemIndex];
          return newState;
        });
      } else if (type === 'link') {
        setDeletingMaterial(prev => {
          const newState = { ...prev };
          delete newState[material.classId + index + '_link_' + itemIndex];
          return newState;
        });
      }
    }
  }, [currentUser, isAdmin, classMaterials, selectedDayDetails]);

  // Add a useEffect to handle clicks outside the modal and scroll events
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (classTimeModalRef.current && !classTimeModalRef.current.contains(event.target as Node)) {
        setClassTimeModal(prev => ({ ...prev, isOpen: false }));
      }
    };
    
    const handleScroll = () => {
      setClassTimeModal(prev => ({ ...prev, isOpen: false }));
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('scroll', handleScroll);
    };
  }, []);

  if (adminLoading) {
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
          <h1 className={styles.headings.h1}>{t.dashboard}</h1>
        </div>
      </div>

      {/* Classes sections - grid layout on desktop */}
      <div className="mt-8 lg:grid lg:grid-cols-2 lg:gap-8">
        {/* Upcoming Classes section */}
        <div>
          {renderUpcomingClassesSection()}
        </div>

        {/* Past Classes section */}
        <div className="mt-8 lg:mt-0">
          {renderPastClassesSection()}
        </div>
      </div>

      <div className="mt-8 lg:grid lg:grid-cols-[2fr,1fr] lg:gap-8">
        {/* Calendar section */}
        <div className="relative">
          <Calendar
            selectedDate={selectedDate}
            onDateSelect={(date) => handleDayClick(date, getClassesForDay(date.getDay(), date), getPaymentsDueForDay(date))}
            onMonthChange={handleMonthChange}
            renderDay={renderCalendarDay}
          />
          
          {/* Class Time Modal */}
          {classTimeModal.isOpen && (
            <div 
              ref={classTimeModalRef}
              className="class-time-modal"
              style={{
                position: 'fixed',
                left: `${classTimeModal.position.x}px`,
                top: `${classTimeModal.position.y}px`,
                transform: 'translateX(-50%)',
                zIndex: 50,
                backgroundColor: 'white',
                borderRadius: '0.5rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                padding: '0.75rem',
                minWidth: '200px',
                maxWidth: '300px',
                maxHeight: '80vh',
                overflowY: 'auto',
                pointerEvents: 'auto'
              }}
            >
              <div className="text-sm font-medium mb-2">
                {classTimeModal.date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </div>
              <div className="space-y-2">
                {classTimeModal.classes.map((classItem) => {
                  return (
                    <div 
                      key={classItem.id}
                      className="time-pill"
                      style={{
                        backgroundColor: '#6366f1',
                        color: 'white',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem'
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <span>{classItem.startTime}</span>
                        <span className="text-xs">{formatStudentNames(classItem.studentEmails)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Details section */}
        <div className="lg:col-span-1" ref={detailsRef}>
          {selectedDayDetails ? (
            <div className="bg-white shadow-md rounded-lg p-4 max-w-md">
              <h2 className={`${styles.headings.h2} text-black mb-4`}>
                {t.dayDetails || 'Day Details'}
              </h2>
              <h3 className={`${styles.headings.h3} text-black`}>
                {selectedDayDetails.date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en', { 
                  weekday: 'long', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </h3>
              
              {selectedDayDetails.classes.length > 0 ? (
                <div className="mt-4 space-y-4">
                  {selectedDayDetails.classes.map((classSession) => (
                    <div key={classSession.id} className={styles.card.container}>
                      <div className="flex justify-between items-start w-full">
                        <div className="w-full">
                          <div className="text-sm font-bold text-black mb-2">
                            {selectedDayDetails.date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en', { 
                              weekday: 'long', 
                              month: 'long', 
                              day: 'numeric' 
                            })}
                          </div>
                          <div className={styles.card.title}>
                            {formatStudentNames(classSession.studentEmails)}
                          </div>
                          <div className={styles.card.subtitle}>
                            {formatClassTime(classSession)}
                          </div>
                          
                          {/* Notes section */}
                          <div className="mt-2 w-full">
                            <div className={styles.card.label}>{t.notes || 'Notes'}</div>
                            
                            {editingNotes[classSession.id] !== undefined ? (
                              <div className="mt-1 w-full">
                                <textarea
                                  ref={(el) => { textareaRefs.current[classSession.id] = el; }}
                                  defaultValue={editingNotes[classSession.id]}
                                  className="w-full p-2 border border-gray-300 rounded text-sm"
                                  rows={3}
                                />
                                <div className="flex justify-end mt-2 space-x-2">
                                  <button
                                    onClick={() => handleCancelEditNotes(classSession.id)}
                                    className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                    disabled={savingNotes[classSession.id]}
                                  >
                                    {t.cancel || 'Cancel'}
                                  </button>
                                  <button
                                    onClick={() => handleSaveNotes(classSession)}
                                    className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                                    disabled={savingNotes[classSession.id]}
                                  >
                                    {savingNotes[classSession.id] 
                                      ? 'Saving...' 
                                      : 'Save'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="text-gray-700 text-sm mt-1 flex items-center">                                <span>{classSession.notes || (t.noNotes || 'No notes available')}</span>
                                {!editingNotes[classSession.id] && (
                                  <PencilIcon
                                    onClick={() => handleEditNotes(classSession)}
                                    className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer ml-1 flex-shrink-0"
                                    title={t.edit || 'Edit'}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                          
                          {/* Materials Section */}
                          {selectedDayDetails.materials[classSession.id] && selectedDayDetails.materials[classSession.id].length > 0 && (
                            <div className="mt-3">
                              <div className="flex justify-between items-center">
                                <div className={styles.card.label}>{t.materials || "Materials"}</div>
                                {isAdmin && (
                                  <a 
                                    href="#"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      openModal(classSession.id);
                                    }}
                                    className="text-sm text-blue-600 hover:text-blue-800"
                                  >
                                    {t.addMaterials}
                                  </a>
                                )}
                              </div>
                              <div className="mt-1 space-y-2">
                                {selectedDayDetails.materials[classSession.id].map((material, index) => (
                                  <div key={index} className="flex flex-col space-y-2">
                                    {material.slides && material.slides.length > 0 && (
                                      <div className="space-y-1">
                                        {material.slides.map((slideUrl, slideIndex) => (
                                          <a 
                                            key={slideIndex}
                                            href={slideUrl} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="flex items-center text-blue-600 hover:text-blue-800 group"
                                          >
                                            <FaFilePdf className="mr-2" />
                                            <span className="text-sm">{t.slides || "Slides"} {material.slides && material.slides.length > 1 ? `(${slideIndex + 1}/${material.slides.length})` : ''}</span>
                                            {isAdmin && (
                                              <button
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  handleDeleteMaterial(material, index, classSession.id, 'slides', slideIndex);
                                                }}
                                                disabled={deletingMaterial[material.classId + index + '_slide_' + slideIndex]}
                                                className="ml-2 text-red-500 hover:text-red-700 transition-colors duration-200 bg-transparent border-0 p-0"
                                                title="Delete material"
                                              >
                                                <FaTrash className="h-2.5 w-2.5" />
                                              </button>
                                            )}
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                    
                                    {material.links && material.links.length > 0 && (
                                      <div className="space-y-1">
                                        {material.links.map((link, linkIndex) => (
                                          <a 
                                            key={linkIndex}
                                            href={link} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="flex items-center text-blue-600 hover:text-blue-800 group"
                                          >
                                            <FaLink className="mr-2" />
                                            <span className="text-sm truncate">{link}</span>
                                            {isAdmin && (
                                              <button
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  handleDeleteMaterial(material, index, classSession.id, 'link', linkIndex);
                                                }}
                                                disabled={deletingMaterial[material.classId + index + '_link_' + linkIndex]}
                                                className="ml-2 text-red-500 hover:text-red-700 transition-colors duration-200 bg-transparent border-0 p-0"
                                                title="Delete link"
                                              >
                                                <FaTrash className="h-2.5 w-2.5" />
                                              </button>
                                            )}
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Add materials link when no materials exist */}
                          {isAdmin && (!selectedDayDetails.materials[classSession.id] || selectedDayDetails.materials[classSession.id].length === 0) && (
                            <div className="mt-3">
                              <a 
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  openModal(classSession.id);
                                }}
                                className="flex items-center text-blue-600 hover:text-blue-800"
                              >
                                <FaPlus className="mr-2" />
                                <span className="text-sm">{t.addMaterials}</span>
                              </a>
                            </div>
                          )}
                          {isAdmin && renderUploadMaterialsSection(classSession, selectedDayDetails.date)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-gray-500">{t.noClassesScheduled}</p>
              )}
              
              {selectedDayDetails.paymentsDue.length > 0 && (
                <div className="mt-6">
                  <h3 className={styles.headings.h3}>{t.paymentsDue}</h3>
                  <div className="mt-2 space-y-2">
                    {selectedDayDetails.paymentsDue.map(({ user, classSession }) => (
                      <div key={`${user.id}-${classSession.id}`} className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                        <div className="font-medium text-yellow-800">{user.name}</div>
                        <div className="text-sm text-yellow-700">
                          {t.classOn} {formatClassTime(classSession)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white shadow-md rounded-lg p-4">
              <p className="text-gray-500 text-center py-8">{t.selectDayToViewDetails}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <DashboardContent />
    </div>
  );
}; 
