import { useState, useEffect, useCallback } from 'react';
import { where, Timestamp } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { useAdmin } from '../hooks/useAdmin';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { Link } from 'react-router-dom';
import { getCachedCollection } from '../utils/firebaseUtils';
import { getDaysInMonth } from '../utils/dateUtils';

interface ClassSession {
  id: string;
  date?: string;
  title?: string;
  description?: string;
  studentEmails: string[];
  studentIds?: string[]; // Keep for backward compatibility
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  courseType?: string;
  notes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  endDate?: Timestamp;
  startDate?: Timestamp;
}

export const Dashboard = () => {
  const [upcomingClasses, setUpcomingClasses] = useState<ClassSession[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedDayDetails, setSelectedDayDetails] = useState<{
    date: Date;
    classes: ClassSession[];
  } | null>(null);
  const [userNames, setUserNames] = useState<{[email: string]: string}>({});
  const { currentUser } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { language } = useLanguage();
  const t = useTranslation(language);

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

      console.log('Fetched classes:', allClasses);

      // Fetch all unique student emails
      const uniqueEmails = new Set<string>();
      allClasses.forEach(classSession => {
        classSession.studentEmails.forEach(email => uniqueEmails.add(email));
      });

      // Fetch user data for all students
      const users = await getCachedCollection<{ email: string; name: string }>('users', [], { userId: currentUser.uid });
      const nameMap: {[email: string]: string} = {};
      users.forEach(user => {
        if (uniqueEmails.has(user.email)) {
          nameMap[user.email] = user.name;
        }
      });
      setUserNames(nameMap);

      const now = new Date();
      const upcoming: ClassSession[] = [];
      const past: ClassSession[] = [];

      allClasses.forEach(classSession => {
        console.log('Processing class:', {
          id: classSession.id,
          dayOfWeek: classSession.dayOfWeek,
          startTime: classSession.startTime,
          endDate: classSession.endDate?.toDate(),
          now: now
        });

        if (classSession.dayOfWeek !== undefined) {
          // Check if today's instance of the class has passed
          const isPastToday = isClassPastToday(classSession.dayOfWeek, classSession.startTime);
          // Check if the class is upcoming (either later this week or next week)
          const isUpcoming = isClassUpcoming(classSession.dayOfWeek, classSession.startTime);
          
          console.log('Class status:', {
            id: classSession.id,
            isPastToday,
            isUpcoming,
            dayOfWeek: classSession.dayOfWeek,
            currentDayOfWeek: now.getDay(),
            startTime: classSession.startTime,
            currentTime: `${now.getHours()}:${now.getMinutes()}`,
            hasEndDate: !!classSession.endDate,
            endDate: classSession.endDate?.toDate(),
            isRecurring: !classSession.endDate
          });

          // For recurring classes (no endDate) or classes that haven't reached their endDate
          if (!classSession.endDate || new Date(classSession.endDate.seconds * 1000) >= now) {
            // Add to past if today's instance has passed
            if (isPastToday) {
              past.push(classSession);
            }
            // Also add to upcoming if it's recurring or will happen again
            if (isUpcoming) {
              upcoming.push(classSession);
            }
          } else {
            // If the class has an endDate that's passed, it only goes to past
            past.push(classSession);
          }
        }
      });

      console.log('Final results:', {
        upcomingClasses: upcoming,
        pastClasses: past
      });

      // Sort upcoming classes by day of week and time
      upcoming.sort((a, b) => {
        const dayA = a.dayOfWeek || 0;
        const dayB = b.dayOfWeek || 0;
        if (dayA !== dayB) return dayA - dayB;
        
        const timeA = a.startTime || '00:00';
        const timeB = b.startTime || '00:00';
        return timeA.localeCompare(timeB);
      });

      setUpcomingClasses(upcoming);
      setPastClasses(past);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  }, [currentUser, adminLoading, isAdmin]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  const isClassPastToday = (dayOfWeek: number, startTime?: string) => {
    const now = new Date();
    const currentDayOfWeek = now.getDay();
    
    // If it's not today, it's not past today
    if (dayOfWeek !== currentDayOfWeek) {
      return false;
    }

    // If it's today, check if the time has passed
    if (startTime) {
      const [hours, minutes] = startTime.split(':');
      let hour = parseInt(hours);
      if (startTime.toLowerCase().includes('pm') && hour !== 12) {
        hour += 12;
      } else if (startTime.toLowerCase().includes('am') && hour === 12) {
        hour = 0;
      }
      
      const classTime = new Date();
      classTime.setHours(hour, parseInt(minutes), 0, 0);
      
      return now > classTime;
    }
    
    return false;
  };

  const isClassUpcoming = (dayOfWeek: number, startTime?: string) => {
    const now = new Date();
    const currentDayOfWeek = now.getDay();
    
    // If the class is later this week
    if (dayOfWeek > currentDayOfWeek) {
      return true;
    } 
    // If it's today and hasn't started yet
    else if (dayOfWeek === currentDayOfWeek && startTime) {
      const [hours, minutes] = startTime.split(':');
      let hour = parseInt(hours);
      if (startTime.toLowerCase().includes('pm') && hour !== 12) {
        hour += 12;
      } else if (startTime.toLowerCase().includes('am') && hour === 12) {
        hour = 0;
      }
      
      const classTime = new Date();
      classTime.setHours(hour, parseInt(minutes), 0, 0);
      
      return now < classTime;
    }
    // If it's earlier in the week or today but already passed,
    // it's upcoming because it will happen next week
    return true;
  };

  const formatClassTitle = (classSession: ClassSession) => {
    if (classSession.title) return classSession.title;
    if (classSession.dayOfWeek !== undefined) {
      const days = [t.sunday, t.monday, t.tuesday, t.wednesday, t.thursday, t.friday, t.saturday];
      return `${days[classSession.dayOfWeek]} ${t.class}`;
    }
    return t.class;
  };

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

  const handleDayClick = (date: Date, classes: ClassSession[]) => {
    setSelectedDayDetails({
      date,
      classes
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
        const startDate = new Date(classItem.startDate.seconds * 1000);
        startDate.setHours(0, 0, 0, 0);
        if (startDate > calendarDate) return false;
      }

      // If class has no end date, it's recurring
      if (!classItem.endDate) return true;
      
      // Check if the class hasn't ended yet
      const endDate = new Date(classItem.endDate.seconds * 1000);
      endDate.setHours(0, 0, 0, 0);
      return endDate >= calendarDate;
    });
  };

  const DAYS_OF_WEEK = [t.sundayShort, t.mondayShort, t.tuesdayShort, t.wednesdayShort, t.thursdayShort, t.fridayShort, t.saturdayShort];

  if (adminLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const AdminDashboard = () => (
    <div className="space-y-8 max-w-7xl mx-auto pt-8 px-4 sm:px-6 lg:px-8">
      {/* Quick Actions */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">{t.quickActions}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            to="/admin/schedule"
            className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm flex items-center space-x-3 hover:border-gray-400 focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
          >
            <div className="flex-1 min-w-0">
              <span className="absolute inset-0" aria-hidden="true" />
              <p className="text-sm font-medium text-gray-900">{t.manageSchedules}</p>
              <p className="text-sm text-gray-500">{t.manageScheduleDesc}</p>
            </div>
          </Link>
          <Link
            to="/admin/materials"
            className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm flex items-center space-x-3 hover:border-gray-400 focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
          >
            <div className="flex-1 min-w-0">
              <span className="absolute inset-0" aria-hidden="true" />
              <p className="text-sm font-medium text-gray-900">{t.classMaterials}</p>
              <p className="text-sm text-gray-500">{t.classMaterialsDesc}</p>
            </div>
          </Link>
        </div>
      </div>

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
                const isSelected = selectedDayDetails?.date.toDateString() === date.toDateString();

                return (
                  <div
                    key={index}
                    onClick={() => handleDayClick(date, dayClasses)}
                    className={`calendar-day hover:bg-gray-50 transition-colors
                      ${isToday ? 'bg-gray-50' : ''} 
                      ${isSelected ? 'bg-indigo-50' : ''}`}
                  >
                    <div className="h-full flex flex-col p-2">
                      {/* Indicators */}
                      <div className="calendar-day-indicators flex justify-center gap-1 mb-1">
                        {dayClasses.length > 0 && (
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" title="Has classes" />
                        )}
                      </div>
                      {/* Date */}
                      <div className={`font-medium text-center ${isToday ? 'text-indigo-600' : 'text-gray-900'}`}>
                        <span>{index + 1}</span>
                      </div>
                      {/* Class details */}
                      {dayClasses.length > 0 && (
                        <div className="class-details mt-1">
                          <div className="time-slots-container relative flex-1">
                            {/* Class slots */}
                            <div className="time-slots relative h-full">
                              {dayClasses.map(classItem => {
                                // Convert time to position
                                const startHour = parseInt(classItem.startTime?.split(':')[0] || '0');
                                const startMinutes = parseInt(classItem.startTime?.split(':')[1] || '0');
                                const position = ((startHour + startMinutes / 60 - 6) / 12) * 100;
                                
                                return (
                                  <div
                                    key={classItem.id}
                                    className="absolute right-0 left-0 transform -translate-y-1/2 bg-indigo-600 rounded-md py-0.5 px-1"
                                    style={{ top: `${position}%` }}
                                  >
                                    <span className="text-[0.6rem] leading-none text-white font-medium block text-center truncate">
                                      {classItem.startTime}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

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
              {selectedDayDetails.classes.length > 0 ? (
                <div className="space-y-4">
                  {selectedDayDetails.classes.map((classItem) => (
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
              ) : (
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

  const StudentDashboard = () => (
    <div className="space-y-8 max-w-7xl mx-auto pt-8 px-4 sm:px-6 lg:px-8">
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
                const isSelected = selectedDayDetails?.date.toDateString() === date.toDateString();

                return (
                  <div
                    key={index}
                    onClick={() => handleDayClick(date, dayClasses)}
                    className={`calendar-day hover:bg-gray-50 transition-colors
                      ${isToday ? 'bg-gray-50' : ''} 
                      ${isSelected ? 'bg-indigo-50' : ''}`}
                  >
                    <div className="h-full flex flex-col p-2">
                      {/* Indicators */}
                      <div className="calendar-day-indicators flex justify-center gap-1 mb-1">
                        {dayClasses.length > 0 && (
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" title="Has classes" />
                        )}
                      </div>
                      {/* Date */}
                      <div className={`font-medium text-center ${isToday ? 'text-indigo-600' : 'text-gray-900'}`}>
                        <span>{index + 1}</span>
                      </div>
                      {/* Class details */}
                      {dayClasses.length > 0 && (
                        <div className="class-details mt-1">
                          <div className="time-slots-container relative flex-1">
                            {/* Class slots */}
                            <div className="time-slots relative h-full">
                              {dayClasses.map(classItem => {
                                // Convert time to position
                                const startHour = parseInt(classItem.startTime?.split(':')[0] || '0');
                                const startMinutes = parseInt(classItem.startTime?.split(':')[1] || '0');
                                const position = ((startHour + startMinutes / 60 - 6) / 12) * 100;
                                
                                return (
                                  <div
                                    key={classItem.id}
                                    className="absolute right-0 left-0 transform -translate-y-1/2 bg-indigo-600 rounded-md py-0.5 px-1"
                                    style={{ top: `${position}%` }}
                                  >
                                    <span className="text-[0.6rem] leading-none text-white font-medium block text-center truncate">
                                      {classItem.startTime}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

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
              {selectedDayDetails.classes.length > 0 ? (
                <div className="space-y-4">
                  {selectedDayDetails.classes.map((classItem) => (
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
              ) : (
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
      {isAdmin ? <AdminDashboard /> : <StudentDashboard />}
    </div>
  );
}; 