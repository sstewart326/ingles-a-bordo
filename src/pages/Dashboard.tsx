import { useState, useEffect, useCallback, useRef } from 'react';
import { where } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { useAdmin } from '../hooks/useAdmin';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { getCachedCollection } from '../utils/firebaseUtils';
import { getDaysInMonth } from '../utils/dateUtils';
import {
  ClassSession,
  User,
  isClassPastToday,
  isClassUpcoming,
  sortClassesByTime
} from '../utils/scheduleUtils';

export const Dashboard = () => {
  const [upcomingClasses, setUpcomingClasses] = useState<ClassSession[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedDayDetails, setSelectedDayDetails] = useState<{
    date: Date;
    classes: ClassSession[];
    paymentsDue: { user: User; classSession: ClassSession }[];
  } | null>(null);
  const [userNames, setUserNames] = useState<{[email: string]: string}>({});
  const [users, setUsers] = useState<User[]>([]);
  const { currentUser } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { language } = useLanguage();
  const t = useTranslation(language);
  const [hoverData, setHoverData] = useState<{
    classes: ClassSession[];
    position: { x: number; y: number };
  } | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const HOVER_DELAY_MS = 500; // Half second delay

  const formatStudentNames = (studentEmails: string[]) => {
    const names = studentEmails.map(email => userNames[email] || email);

    if (names.length === 0) return t.class;
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${t.pair}: ${names.join(' & ')}`;
    return `${t.group}: ${names.join(', ')}`;
  };

  const fetchClasses = useCallback(async () => {
    if (!currentUser || adminLoading) return;

    try {
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
      setGroupedUpcomingClasses(
        upcoming.reduce<Record<number, ClassSession[]>>((acc, classSession) => {
          const dayOfWeek = classSession.dayOfWeek || 0;
          if (!acc[dayOfWeek]) {
            acc[dayOfWeek] = [];
          }
          acc[dayOfWeek].push(classSession);
          return acc;
        }, {})
      );
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  }, [currentUser, adminLoading, isAdmin]);

  const [groupedUpcomingClasses, setGroupedUpcomingClasses] = useState<Record<number, ClassSession[]>>({});

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

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

  const previousMonth = () => {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1));
  };

  const { days, firstDay } = getDaysInMonth(selectedDate);

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
    setSelectedDayDetails({
      date,
      classes,
      paymentsDue
    });
  };

  const getClassesForDay = (dayOfWeek: number, date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const calendarDate = new Date(date);
    calendarDate.setHours(0, 0, 0, 0);
    
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

  const DAYS_OF_WEEK = [t.sundayShort, t.mondayShort, t.tuesdayShort, t.wednesdayShort, t.thursdayShort, t.fridayShort, t.saturdayShort];
  const DAYS_OF_WEEK_FULL = [t.sunday, t.monday, t.tuesday, t.wednesday, t.thursday, t.friday, t.saturday];

  const renderUpcomingClassesSection = () => (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">{t.upcomingClasses}</h2>
      <div className="bg-white shadow overflow-hidden sm:rounded-lg relative">
        <div 
          className="max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#D1D5DB transparent'
          }}
        >
          {Object.keys(groupedUpcomingClasses).length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {Object.entries(groupedUpcomingClasses).map(([dayOfWeek, classes]) => (
                <li key={dayOfWeek} className="px-4 sm:px-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 sticky top-0 bg-white py-3 -mx-4 px-4 z-10 border-b border-gray-100">
                      {DAYS_OF_WEEK_FULL[parseInt(dayOfWeek)]} {t.class}
                    </h3>
                    <div className="py-3 space-y-3">
                      {sortClassesByTime(classes).map((classSession) => (
                        <div 
                          key={classSession.id} 
                          className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors duration-150 ease-in-out border border-gray-100"
                        >
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-indigo-600"></div>
                              <p className="text-sm font-medium text-gray-900">
                                {formatClassTime(classSession)}
                              </p>
                            </div>
                            <div className="pl-4">
                              <p className="text-sm text-gray-600">
                                {formatStudentNames(classSession.studentEmails)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-5 sm:px-6 text-center text-gray-500">
              {t.noClassesScheduled}
            </div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
      </div>
    </div>
  );

  if (adminLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const DashboardContent = () => (
    <div className="space-y-8 max-w-7xl mx-auto pt-8 px-4 sm:px-6 lg:px-8 pb-12">
      {/* Upcoming Classes */}
      {renderUpcomingClassesSection()}

      {/* Calendar and Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            {/* Calendar Header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedDate.toLocaleString(language === 'pt-BR' ? 'pt-BR' : 'en', { month: 'long', year: 'numeric' })}
                </h2>
                <div className="flex space-x-2">
                  <button
                    onClick={previousMonth}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--brand-color)] hover:bg-[var(--brand-color-dark)] text-[var(--header-bg)] transition-colors text-xl"
                  >
                    ‹
                  </button>
                  <button
                    onClick={nextMonth}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--brand-color)] hover:bg-[var(--brand-color-dark)] text-[var(--header-bg)] transition-colors text-xl"
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="calendar-grid">
              {DAYS_OF_WEEK.map((day) => (
                <div
                  key={day}
                  className="calendar-day-header text-center text-sm font-medium text-gray-600 py-4"
                >
                  {day}
                </div>
              ))}
              {Array.from({ length: firstDay }).map((_, index) => (
                <div key={`empty-${index}`} className="calendar-day" />
              ))}
              {Array.from({ length: days }).map((_, index) => {
                const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), index + 1);
                const dayOfWeek = date.getDay();
                const dayClasses = getClassesForDay(dayOfWeek, date);
                const isToday =
                  date.getDate() === new Date().getDate() &&
                  date.getMonth() === new Date().getMonth() &&
                  date.getFullYear() === new Date().getFullYear();

                // Calculate payment information for all classes, not just classes on this day
                const paymentsDue: { user: User; classSession: ClassSession }[] = [];
                upcomingClasses.forEach(classSession => {
                  // Get payment dates using the class's payment configuration
                  if (classSession.paymentConfig) {
                    const paymentDates = getNextPaymentDates(classSession.paymentConfig, classSession, selectedDate);
                    const isPaymentDue = paymentDates.some(paymentDate => {
                      const matches = paymentDate.getFullYear() === date.getFullYear() &&
                        paymentDate.getMonth() === date.getMonth() &&
                        paymentDate.getDate() === date.getDate();
                      
                      if (matches) {
                        console.log('Found payment due:', {
                          classId: classSession.id,
                          date: date.toISOString(),
                          paymentDate: paymentDate.toISOString()
                        });
                      }
                      return matches;
                    });
                    
                    if (isPaymentDue) {
                      console.log('Adding payment due:', {
                        classId: classSession.id,
                        date: date.toISOString()
                      });
                      // Add all students in the class to the payments due list
                      classSession.studentEmails.forEach(email => {
                        const user = users.find(u => u.email === email);
                        if (user) {
                          paymentsDue.push({ user, classSession });
                        }
                      });
                    }
                  }
                });

                const isPaymentDay = paymentsDue.length > 0;
                const daysUntilPayment = isPaymentDay ? 
                  Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
                const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

                const isSelected = selectedDayDetails?.date.toDateString() === date.toDateString();

                return (
                  <div
                    key={index}
                    onClick={() => handleDayClick(date, dayClasses, paymentsDue)}
                    className={`calendar-day hover:bg-[#f8f8f8] transition-colors
                      ${isToday ? 'bg-[#f8f8f8]' : ''} 
                      ${isSelected ? 'bg-[#f0f0f0]' : ''}`}
                  >
                    <div className="h-full flex flex-col p-2">
                      {/* Indicators */}
                      <div className="calendar-day-indicators flex justify-center gap-1 mb-1">
                        {dayClasses.length > 0 && (
                          <div className="w-1.5 h-1.5 rounded-full bg-[#6366f1]" title="Has classes" />
                        )}
                        {isPaymentDay && (
                          <div 
                            className={`w-1.5 h-1.5 rounded-full ${isPaymentSoon ? 'bg-[#ef4444]' : 'bg-[#f59e0b]'}`}
                            title={isPaymentSoon ? 'Payment due soon' : 'Payment due'}
                          />
                        )}
                      </div>
                      {/* Date and Payment Pill */}
                      <div className="flex flex-col items-center">
                        <div className={`font-medium text-center ${isToday ? 'text-[#6366f1]' : 'text-[#1a1a1a]'} ${isPaymentDay ? (isPaymentSoon ? 'text-[#ef4444]' : 'text-[#f59e0b]') : ''}`}>
                          <span>{index + 1}</span>
                        </div>
                        {isPaymentDay && (
                          <div className={`text-[0.6rem] px-1 py-0.5 rounded mt-1 ${
                            isPaymentSoon 
                              ? 'bg-[#fef2f2] text-[#ef4444]' 
                              : 'bg-[#fffbeb] text-[#f59e0b]'
                          }`}>
                            {t.paymentDue}
                          </div>
                        )}
                      </div>
                      {/* Class details */}
                      <div className="class-details mt-1">
                        <div className="time-slots-container relative flex-1">
                          <div className="time-slots relative h-full flex flex-col gap-1">
                            {sortClassesByTime(dayClasses)
                              .slice(0, dayClasses.length > 3 ? 2 : 3)
                              .map((classItem) => (
                                <div
                                  key={classItem.id}
                                  className="right-0 left-0 bg-indigo-600 rounded-md py-0.5 px-1"
                                >
                                  <span className="text-[0.6rem] leading-none text-white font-medium block text-center truncate">
                                    {classItem.startTime}
                                  </span>
                                </div>
                              ))}
                            
                            {dayClasses.length > 3 && (
                              <div 
                                className="right-0 left-0 bg-indigo-600 rounded-md py-0.5 px-1 cursor-pointer hover:bg-indigo-700 transition-colors relative"
                                onMouseEnter={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  if (hoverTimeoutRef.current) {
                                    window.clearTimeout(hoverTimeoutRef.current);
                                  }
                                  hoverTimeoutRef.current = window.setTimeout(() => {
                                    setHoverData({
                                      classes: dayClasses,
                                      position: {
                                        x: rect.left + (rect.width / 2),
                                        y: rect.bottom
                                      }
                                    });
                                    hoverTimeoutRef.current = null;
                                  }, HOVER_DELAY_MS);
                                }}
                                onMouseLeave={() => {
                                  if (hoverTimeoutRef.current) {
                                    window.clearTimeout(hoverTimeoutRef.current);
                                    hoverTimeoutRef.current = null;
                                  }
                                  setHoverData(null);
                                }}
                              >
                                <span className="text-[0.6rem] leading-none text-white font-medium block text-center">
                                  +{dayClasses.length - 2} more
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tooltip */}
        {hoverData && (
          <div 
            className="fixed z-[9999] pointer-events-none"
            style={{ 
              left: `${hoverData.position.x}px`,
              top: `${hoverData.position.y}px`,
              transform: 'translate(-50%, 8px)'
            }}
          >
            <div className="bg-white rounded-lg shadow-xl p-2 border border-gray-200 min-w-[120px]">
              <div className="flex flex-col gap-1 items-center">
                {sortClassesByTime(hoverData.classes).map((classItem) => (
                  <div
                    key={classItem.id}
                    className="bg-indigo-600 rounded-md py-1 px-3 w-fit"
                  >
                    <span className="text-sm leading-none text-white font-medium whitespace-nowrap">
                      {classItem.startTime}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Details Section */}
        <div className="lg:col-span-1">
          {selectedDayDetails ? (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {selectedDayDetails.date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </h3>

              {/* Payment Due Section */}
              {selectedDayDetails.paymentsDue.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-md font-semibold text-amber-600 mb-2">{t.paymentDue}</h4>
                  <div className="space-y-3">
                    {selectedDayDetails.paymentsDue.map(({ user, classSession }) => {
                      const daysUntilPayment = Math.ceil(
                        (selectedDayDetails.date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                      );
                      const isPaymentSoon = daysUntilPayment <= 3 && daysUntilPayment >= 0;

                      return (
                        <div 
                          key={`${user.id}-${classSession.id}`} 
                          className={`p-3 rounded-lg border ${
                            isPaymentSoon 
                              ? 'bg-red-50 border-red-200' 
                              : 'bg-amber-50 border-amber-200'
                          }`}
                        >
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium text-gray-900">{user.name}</span>
                            <span className="text-xs text-gray-600">
                              {classSession.courseType} - {classSession.startTime} to {classSession.endTime}
                            </span>
                            <span className={`text-xs ${isPaymentSoon ? 'text-red-600' : 'text-amber-600'}`}>
                              {classSession.paymentConfig?.type === 'weekly' ? 
                                `Weekly payment (${classSession.paymentConfig.weeklyInterval || 1} week interval)` :
                                `Monthly payment (${classSession.paymentConfig?.monthlyOption} of month)`}
                              {isPaymentSoon && ' - Due soon'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Classes Section */}
              {selectedDayDetails.classes.length > 0 && (
                <div className="space-y-4">
                  {sortClassesByTime(selectedDayDetails.classes).map((classItem) => (
                    <div
                      key={classItem.id}
                      className="p-4 rounded-lg border border-gray-200 hover:border-indigo-200 bg-gray-50 hover:bg-indigo-50 transition-colors"
                    >
                      <div className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2">
                        <span className="text-sm font-medium text-gray-600">{t.time}</span>
                        <span className="text-sm text-gray-900">{formatClassTime(classItem)}</span>

                        <span className="text-sm font-medium text-gray-600">{t.students}</span>
                        <span className="text-sm text-gray-900">{formatStudentNames(classItem.studentEmails)}</span>

                        {classItem.notes && (
                          <>
                            <span className="text-sm font-medium text-gray-600">{t.notes}</span>
                            <span className="text-sm text-gray-900">{classItem.notes}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Show empty state only if there are no classes AND no payments due */}
              {selectedDayDetails.classes.length === 0 && selectedDayDetails.paymentsDue.length === 0 && (
                <p className="text-gray-500 text-center">{t.noClassesScheduled}</p>
              )}
            </div>
          ) : (
            <div className="bg-white shadow rounded-lg p-6">
              <p className="text-gray-500 text-center">{t.selectDayToViewDetails}</p>
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