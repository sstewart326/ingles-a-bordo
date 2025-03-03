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
import { getClassMaterials } from '../utils/classMaterialsUtils';
import { FaFilePdf, FaLink } from 'react-icons/fa';
import { ClassMaterial } from '../types/interfaces';

interface TimeDisplay {
  timeStr: string;
  position: number;
}

export const Dashboard = () => {
  const [upcomingClasses, setUpcomingClasses] = useState<ClassSession[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
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
      
      if (newMonthsToLoad.length === 0) {
        console.log('All required months already loaded');
        return;
      }
      
      console.log('Loading classes for months:', newMonthsToLoad);

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

      console.log('Fetched classes:', transformedClasses);

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

      const upcoming: ClassSession[] = [];
      const past: ClassSession[] = [];

      transformedClasses.forEach(classSession => {
        console.log('Processing class:', {
          id: classSession.id,
          dayOfWeek: classSession.dayOfWeek,
          startTime: classSession.startTime,
          endTime: classSession.endTime,
          startDate: classSession.startDate?.toDate().toISOString(),
          endDate: classSession.endDate?.toDate().toISOString(),
          paymentConfig: classSession.paymentConfig
        });

        if (isClassPastToday(classSession.dayOfWeek || 0, classSession.startTime)) {
          past.push(classSession);
        } else if (isClassUpcoming(classSession.dayOfWeek || 0, classSession.startTime)) {
          upcoming.push(classSession);
        }
      });

      setUpcomingClasses(upcoming);
      
      // Update loaded months
      const updatedLoadedMonths = new Set(loadedMonths);
      newMonthsToLoad.forEach(month => updatedLoadedMonths.add(month));
      setLoadedMonths(updatedLoadedMonths);
      
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  }, [currentUser, adminLoading, isAdmin, loadedMonths, selectedDate]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);
  
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
    console.log('Calculating payment dates:', {
      paymentConfig,
      classSession: {
        id: classSession.id,
        startDate: classSession.startDate?.toDate(),
        endDate: classSession.endDate?.toDate()
      }
    });

    if (!paymentConfig || !classSession.startDate) {
      console.log('No payment config or start date, returning empty array');
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

    console.log('Date ranges:', {
      paymentStartDate: paymentStartDate.toISOString().split('T')[0],
      monthStart: monthStart.toISOString().split('T')[0],
      monthEnd: monthEnd.toISOString().split('T')[0]
    });
    
    // If class has ended, no payments
    if (classSession.endDate) {
      const endDate = classSession.endDate.toDate();
      endDate.setHours(23, 59, 59, 999);
      if (endDate < monthStart) {
        console.log('Class has ended before month start, returning empty array');
        return [];
      }
    }

    if (paymentConfig.type === 'weekly') {
      const interval = paymentConfig.weeklyInterval || 1;
      let currentPaymentDate = new Date(paymentStartDate);
      
      console.log('Processing weekly payments:', {
        interval,
        startingFrom: currentPaymentDate.toISOString()
      });

      while (currentPaymentDate <= monthEnd) {
        if (currentPaymentDate >= monthStart) {
          dates.push(new Date(currentPaymentDate));
          console.log('Added weekly payment date:', currentPaymentDate.toISOString());
        }
        currentPaymentDate.setDate(currentPaymentDate.getDate() + (7 * interval));
      }
    } else if (paymentConfig.type === 'monthly') {
      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth();
      
      console.log('Processing monthly payment:', {
        option: paymentConfig.monthlyOption,
        year,
        month
      });

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
          console.log('Invalid monthly option:', paymentConfig.monthlyOption);
          return dates;
      }
      
      if (paymentDate >= paymentStartDate && 
          (!classSession.endDate || paymentDate <= classSession.endDate.toDate())) {
        dates.push(paymentDate);
        console.log('Added monthly payment date:', paymentDate.toISOString());
      }
    }
    
    console.log('Final payment dates:', dates.map(d => d.toISOString()));
    return dates;
  };

  const handleDayClick = (date: Date, classes: ClassSession[], paymentsDue: { user: User; classSession: ClassSession }[]) => {
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
      console.log(`Skipping classes for date outside relevant range: ${date.toISOString()}`);
      return [];
    }
    
    return upcomingClasses.filter(classItem => {
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
  };

  const renderUpcomingClassesSection = () => (
    <div>
      <h2 className={styles.headings.h2}>{t.upcomingClasses}</h2>
      <div className="mt-4 space-y-4">
        {upcomingClasses.length === 0 ? (
          <p className="text-gray-500">{t.noUpcomingClasses}</p>
        ) : (
          upcomingClasses.map((classSession) => (
            <div key={classSession.id} className={styles.card.container}>
              <div className="flex justify-between items-start">
                <div>
                  <div className={styles.card.title}>
                    {formatStudentNames(classSession.studentEmails)}
                  </div>
                  <div className={styles.card.subtitle}>
                    {formatClassTime(classSession)}
                  </div>
                  {classSession.notes && (
                    <div className="mt-2">
                      <div className={styles.card.label}>{t.notes}</div>
                      <div className="text-gray-700 text-sm mt-1">{classSession.notes}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderCalendarDay = (date: Date, isToday: boolean) => {
    const dayOfWeek = date.getDay();
    const dayClasses = getClassesForDay(dayOfWeek, date);
    const paymentsDue = getPaymentsDueForDay(date);
    const isPaymentDay = paymentsDue.length > 0;
    const daysUntilPayment = isPaymentDay ? 
      Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
    const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

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

        {/* Date and Payment Label */}
        <div className="flex flex-col items-center">
          <div className={`date-number ${isToday ? 'text-[#6366f1]' : ''} ${isPaymentDay ? (isPaymentSoon ? 'text-[#ef4444]' : 'text-[#f59e0b]') : ''}`}>
            {date.getDate()}
          </div>
          {isPaymentDay && (
            <div className={`payment-due-label ${isPaymentSoon ? 'soon' : 'normal'}`}>
              {t.paymentDue}
            </div>
          )}
        </div>

        {/* Class details */}
        {dayClasses.length > 0 && (
          <div className="class-details">
            <div className="time-slots-container">
              <div className="time-slots">
                {dayClasses.slice(0, 3).map((classItem) => {
                  const timeDisplay = formatTimeDisplay(classItem);
                  return timeDisplay ? (
                    <div
                      key={classItem.id}
                      className="time-slot"
                      style={{ top: `${timeDisplay.position}%` }}
                    >
                      {timeDisplay.timeStr}
                    </div>
                  ) : null;
                })}
                {dayClasses.length > 3 && (
                  <div className="time-slot more">
                    +{dayClasses.length - 3} more
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const formatTimeDisplay = (classItem: ClassSession): TimeDisplay | null => {
    if (!classItem.startTime) return null;
    
    const [hours, minutes] = classItem.startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    const position = ((totalMinutes - 8 * 60) / (14 * 60)) * 100; // Assuming 8 AM to 10 PM range
    
    return {
      timeStr: classItem.startTime,
      position: Math.max(0, Math.min(100, position))
    };
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

      {/* Upcoming Classes section */}
      <div className="mt-8">
        {renderUpcomingClassesSection()}
      </div>

      <div className="mt-8 lg:grid lg:grid-cols-[2fr,1fr] lg:gap-8">
        {/* Calendar section */}
        <div>
          <Calendar
            selectedDate={selectedDate}
            onDateSelect={(date) => handleDayClick(date, getClassesForDay(date.getDay(), date), getPaymentsDueForDay(date))}
            onMonthChange={handleMonthChange}
            renderDay={renderCalendarDay}
          />
        </div>

        {/* Details section */}
        <div className="lg:col-span-1" ref={detailsRef}>
          {selectedDayDetails && (
            <div className="bg-white shadow-md rounded-lg p-4">
              <h2 className={styles.headings.h2}>
                {selectedDayDetails.date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en', { 
                  weekday: 'long', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </h2>
              
              {selectedDayDetails.classes.length > 0 ? (
                <div className="mt-4 space-y-4">
                  {selectedDayDetails.classes.map((classSession) => (
                    <div key={classSession.id} className={styles.card.container}>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className={styles.card.title}>
                            {formatStudentNames(classSession.studentEmails)}
                          </div>
                          <div className={styles.card.subtitle}>
                            {formatClassTime(classSession)}
                          </div>
                          {classSession.notes && (
                            <div className="mt-2">
                              <div className={styles.card.label}>{t.notes}</div>
                              <div className="text-gray-700 text-sm mt-1">{classSession.notes}</div>
                            </div>
                          )}
                          
                          {/* Materials Section */}
                          {selectedDayDetails.materials[classSession.id] && selectedDayDetails.materials[classSession.id].length > 0 && (
                            <div className="mt-3">
                              <div className={styles.card.label}>{t.materials || "Materials"}</div>
                              <div className="mt-1 space-y-2">
                                {selectedDayDetails.materials[classSession.id].map((material, index) => (
                                  <div key={index} className="flex flex-col space-y-2">
                                    {material.slides && (
                                      <a 
                                        href={material.slides} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex items-center text-blue-600 hover:text-blue-800"
                                      >
                                        <FaFilePdf className="mr-2" />
                                        <span className="text-sm">{t.slides || "Slides"}</span>
                                      </a>
                                    )}
                                    
                                    {material.links && material.links.length > 0 && (
                                      <div className="space-y-1">
                                        {material.links.map((link, linkIndex) => (
                                          <a 
                                            key={linkIndex}
                                            href={link} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="flex items-center text-blue-600 hover:text-blue-800"
                                          >
                                            <FaLink className="mr-2" />
                                            <span className="text-sm truncate">{link}</span>
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
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