import { useState, useEffect } from 'react';
import { where, Timestamp } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { useAdmin } from '../hooks/useAdmin';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { getCachedCollection } from '../utils/firebaseUtils';
import { getDaysInMonth, startOfDay } from '../utils/dateUtils';

interface Class {
  id: string;
  studentIds?: string[];
  studentEmails: string[];
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  courseType: string;
  notes?: string;
  endDate?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface ClassWithStudents extends Class {
  students: {
    id: string;
    name?: string;
    email: string;
  }[];
}

interface User {
  id: string;
  name?: string;
  email: string;
}

export const Schedule = () => {
  const [classes, setClasses] = useState<ClassWithStudents[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { currentUser } = useAuth();
  const { isAdmin } = useAdmin();
  const { language } = useLanguage();
  const t = useTranslation(language);

  const DAYS_OF_WEEK = [t.sunday, t.monday, t.tuesday, t.wednesday, t.thursday, t.friday, t.saturday];

  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser) {
        console.log('No current user, skipping fetch');
        setClasses([]);
        setLoading(false);
        return;
      }

      try {
        console.log('Fetching schedule data for user:', {
          email: currentUser.email,
          uid: currentUser.uid
        });

        // First get the user's document
        const usersData = await getCachedCollection<User>('users', [
          where('email', '==', currentUser.email)
        ], {
          includeIds: true
        });
        console.log('Users data fetched:', usersData);
        
        const currentUserDoc = usersData.find(u => u.email === currentUser.email);
        console.log('Current user doc:', currentUserDoc);
        
        if (!currentUserDoc && !isAdmin) {
          console.error('Could not find user document');
          setClasses([]);
          setLoading(false);
          return;
        }

        // Then fetch classes using email
        const queryConstraints = isAdmin 
          ? []
          : [where('studentEmails', 'array-contains', currentUser.email)];
        
        console.log('Fetching classes with constraints:', {
          isAdmin,
          queryConstraints,
          email: currentUser.email
        });

        const classesData = await getCachedCollection<ClassWithStudents>('classes', queryConstraints, {
          includeIds: true
        });
        
        console.log('Classes data fetched:', classesData);
        
        if (classesData.length > 0) {
          // Fetch all users that are students in any class
          const allStudentEmails = new Set<string>();
          classesData.forEach(classItem => {
            classItem.studentEmails.forEach(email => allStudentEmails.add(email));
          });
          
          console.log('Fetching user data for emails:', Array.from(allStudentEmails));
          
          // Get all users data in one query
          const usersData = await getCachedCollection<User>('users', [
            where('email', 'in', Array.from(allStudentEmails))
          ], {
            includeIds: true
          });
          
          console.log('Users data fetched:', usersData);

          // Create a map of user data
          const usersMap = new Map(
            usersData.map(user => [user.email, user])
          );

          // Populate students array for each class
          classesData.forEach(classItem => {
            classItem.students = classItem.studentEmails
              .map(email => {
                const user = usersMap.get(email);
                return user ? { 
                  id: user.id, 
                  name: user.name, 
                  email: email 
                } : {
                  id: email, // Use email as fallback id
                  email: email
                };
              });
          });
          
          console.log('Classes data with students:', classesData);
        }
        
        setClasses(classesData);
      } catch (error) {
        console.error('Error fetching schedule data:', error);
        setClasses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser, isAdmin]);

  const getClassesForDay = (dayOfWeek: number, date: Date) => {
    const today = startOfDay(new Date());
    const calendarDate = startOfDay(date);
    
    return classes
      .filter(classItem => {
        // If class has no end date, it's always valid
        if (!classItem.endDate) {
          return classItem.dayOfWeek === dayOfWeek;
        }
        
        // Otherwise check if it's not expired and within end date
        return classItem.dayOfWeek === dayOfWeek && 
          classItem.endDate.toDate() >= today && // Must not be expired
          calendarDate <= classItem.endDate.toDate(); // Must not be past the end date
      })
      .sort((a, b) => {
        // Sort by time
        return a.startTime.localeCompare(b.startTime);
      });
  };

  const previousMonth = () => {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1));
  };

  const { days, firstDay } = getDaysInMonth(selectedDate);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-white">
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="md:flex md:items-center md:justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold text-black">{t.courseSchedule}</h1>
            <p className="mt-2 text-sm text-black">
              {t.scheduleDescription}
            </p>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            <button
              onClick={previousMonth}
              className="ml-3 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {t.previousMonth}
            </button>
            <button
              onClick={nextMonth}
              className="ml-3 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {t.nextMonth}
            </button>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-semibold text-black">
            {selectedDate.toLocaleString(language === 'pt-BR' ? 'pt-BR' : 'en', { month: 'long', year: 'numeric' })}
          </h2>
          <div className="mt-4 grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden shadow">
            {DAYS_OF_WEEK.map((day) => (
              <div
                key={day}
                className="bg-gray-50 py-2 text-center text-sm font-semibold text-black"
              >
                {day}
              </div>
            ))}
            {Array.from({ length: firstDay }).map((_, index) => (
              <div key={`empty-${index}`} className="bg-white h-40 lg:h-56" />
            ))}
            {Array.from({ length: days }).map((_, index) => {
              const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), index + 1);
              const dayOfWeek = date.getDay();
              const dayClasses = getClassesForDay(dayOfWeek, date);
              const isToday =
                date.getDate() === new Date().getDate() &&
                date.getMonth() === new Date().getMonth() &&
                date.getFullYear() === new Date().getFullYear();

              return (
                <div
                  key={index}
                  className={`bg-white p-3 h-40 lg:h-56 overflow-y-auto ${
                    isToday ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="font-semibold text-black">{index + 1}</div>
                  <div className="mt-2 space-y-2">
                    {dayClasses.map((classItem) => {
                      console.log('Class item:', {
                        id: classItem.id,
                        students: classItem.students,
                        studentEmails: classItem.studentEmails
                      });
                      return (
                        <div
                          key={classItem.id}
                          className="px-3 py-2 text-sm rounded-md border-l-4 border-indigo-400 bg-white shadow-sm hover:shadow-md transition-shadow w-full overflow-hidden"
                        >
                          <div className="flex flex-col text-black gap-1 w-full">
                            <span className="text-xs whitespace-nowrap">{classItem.startTime} - {classItem.endTime}</span>
                            <div className="w-full overflow-hidden">
                              {classItem.students && classItem.students.length > 0 ? (
                                <div className="flex flex-wrap gap-x-1 w-full overflow-hidden">
                                  {classItem.students.map((student, idx) => (
                                    <span key={student.id} className="text-xs font-medium overflow-hidden text-ellipsis">
                                      {student.name || student.email.split('@')[0]}
                                      {idx < classItem.students.length - 1 ? ', ' : ''}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-xs font-medium overflow-hidden text-ellipsis">
                                  {classItem.studentEmails[0]?.split('@')[0] || 'No student'}
                                </div>
                              )}
                            </div>
                            {classItem.notes && (
                              <div className="text-xs text-gray-500 italic overflow-hidden text-ellipsis">
                                {classItem.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Weekly Schedule Summary */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-black mb-4">{t.weeklyScheduleSummary}</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {DAYS_OF_WEEK.map((day, dayIndex) => {
              const dayClasses = getClassesForDay(dayIndex, selectedDate);
              if (dayClasses.length === 0) return null;

              return (
                <div key={day} className="bg-white shadow rounded-lg p-4">
                  <h4 className="font-medium text-black mb-3 pb-2 border-b">{day}</h4>
                  <div className="space-y-3">
                    {dayClasses.map((classItem) => {
                      // For students, only show their classes - no need to check here as the query already filtered
                      if (!isAdmin) {
                        return null;
                      }

                      return (
                        <div
                          key={classItem.id}
                          className="text-sm bg-gray-50 rounded-lg p-2 w-full overflow-hidden"
                        >
                          <div className="flex flex-col text-black gap-1 w-full">
                            <span className="text-xs whitespace-nowrap">{classItem.startTime} - {classItem.endTime}</span>
                            <div className="w-full overflow-hidden">
                              <div className="flex flex-wrap gap-x-1 w-full overflow-hidden">
                                {classItem.students.map((student, idx) => (
                                  <span key={student.id} className="text-xs font-medium overflow-hidden text-ellipsis">
                                    {student.name || student.email.split('@')[0]}
                                    {idx < classItem.students.length - 1 ? ', ' : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                            {classItem.notes && (
                              <div className="text-xs text-gray-500 italic overflow-hidden text-ellipsis">
                                {classItem.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}; 