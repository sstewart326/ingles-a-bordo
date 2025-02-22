import { useState, useEffect, useCallback } from 'react';
import { where, Timestamp } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { useAdmin } from '../hooks/useAdmin';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { Link } from 'react-router-dom';
import { getCachedCollection } from '../utils/firebaseUtils';

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
}

export const Dashboard = () => {
  const [upcomingClasses, setUpcomingClasses] = useState<ClassSession[]>([]);
  const [pastClasses, setPastClasses] = useState<ClassSession[]>([]);
  const { currentUser } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { language } = useLanguage();
  const t = useTranslation(language);

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

      return `${classSession.startTime} - ${classSession.endTime} ${timezone}`;
    }
    return '';
  };

  if (adminLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const AdminDashboard = () => (
    <div className="space-y-8 max-w-3xl mx-auto pt-8 px-4 sm:px-6 lg:px-8">
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

      {/* Upcoming Classes */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900">{t.upcomingClasses}</h2>
          <Link to="/admin/schedule" className="text-sm text-indigo-600 hover:text-indigo-900">
            {t.viewAll}
          </Link>
        </div>
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <ul className="divide-y divide-gray-200">
            {upcomingClasses.slice(0, 3).map((session) => (
              <li key={session.id}>
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-indigo-600 truncate">
                      {formatClassTitle(session)}
                    </h3>
                    <div className="ml-2 flex-shrink-0 flex">
                      <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        {formatClassTime(session)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">{session.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  const StudentDashboard = () => (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Upcoming Classes */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">{t.yourUpcomingClasses}</h2>
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <ul className="divide-y divide-gray-200">
            {upcomingClasses.map((session) => (
              <li key={session.id}>
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-indigo-600 truncate">
                      {formatClassTitle(session)}
                    </h3>
                    <div className="ml-2 flex-shrink-0 flex">
                      <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        {formatClassTime(session)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">{session.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Past Classes */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">{t.pastClasses}</h2>
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <ul className="divide-y divide-gray-200">
            {pastClasses.map((session) => (
              <li key={session.id}>
                <Link 
                  to={`/materials?classId=${session.id}`}
                  className="block hover:bg-gray-50 transition-colors"
                >
                  <div className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-gray-900 truncate">
                        {formatClassTitle(session)}
                      </h3>
                      <div className="ml-2 flex-shrink-0 flex">
                        <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                          {formatClassTime(session)}
                        </p>
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{session.description}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  return isAdmin ? <AdminDashboard /> : <StudentDashboard />;
}; 