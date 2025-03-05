import { useState, useEffect } from 'react';
import { where } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { Calendar } from '../components/Calendar';
import { ScheduleCalendarDay } from '../components/ScheduleCalendarDay';
import '../styles/calendar.css';
import { getStudentClassMaterials } from '../utils/classMaterialsUtils';
import { styles } from '../styles/styleUtils';
import { ClassMaterial } from '../types/interfaces';
import { FaFilePdf, FaLink, FaFileAlt } from 'react-icons/fa';
import toast from 'react-hot-toast';
import {
  User,
  ClassWithStudents,
  getClassesForDay,
  getNextPaymentDates,
} from '../utils/scheduleUtils';
import { useAdmin } from '../hooks/useAdmin';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { getCachedCollection } from '../utils/firebaseUtils';

const logSchedule = (message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[SCHEDULE] ${message}`, data ? data : '');
  }
};

export const Schedule = () => {
  const [classes, setClasses] = useState<ClassWithStudents[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedDayDetails, setSelectedDayDetails] = useState<{
    date: Date;
    classes: ClassWithStudents[];
    isPaymentDay: boolean;
    isPaymentSoon: boolean;
  } | null>(null);
  const { currentUser } = useAuth();
  const { isAdmin } = useAdmin();
  const { language } = useLanguage();
  const t = useTranslation(language);

  // Class Materials Modal State
  const [selectedClass, setSelectedClass] = useState<ClassWithStudents | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<ClassMaterial | null>(null);
  const [loadingMaterial, setLoadingMaterial] = useState(false);
  const [slidesUrl, setSlidesUrl] = useState<string | null>(null);
  const [classesWithMaterials, setClassesWithMaterials] = useState<Set<string>>(new Set());
  const [materialsInfo, setMaterialsInfo] = useState<Map<string, { hasSlides: boolean; hasLinks: boolean }>>(new Map());

  const DAYS_OF_WEEK_FULL = [t.sunday, t.monday, t.tuesday, t.wednesday, t.thursday, t.friday, t.saturday];

  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser) {
        setClasses([]);
        setLoading(false);
        return;
      }

      try {
        // First get the user's document
        const usersData = await getCachedCollection<User>('users', [
          where('email', '==', currentUser.email)
        ], {
          includeIds: true
        });
        
        const currentUserDoc = usersData.find(u => u.email === currentUser.email);
        
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
        

        const classesData = await getCachedCollection<ClassWithStudents>('classes', queryConstraints, {
          includeIds: true
        });

        if (classesData.length > 0) {
          // Fetch all users that are students in any class
          const allStudentEmails = new Set<string>();
          classesData.forEach(classItem => {
            classItem.studentEmails.forEach(email => allStudentEmails.add(email));
          });
                    
          // Get all users data in one query
          const usersData = await getCachedCollection<User>('users', [
            where('email', 'in', Array.from(allStudentEmails))
          ], {
            includeIds: true
          });

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
        } else {
          logSchedule('No classes found for the current user');
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

  // Update the materials info effect
  useEffect(() => {
    const fetchMaterialsInfo = async () => {
      if (!currentUser?.email) return;

      try {
        const materials = await getStudentClassMaterials(currentUser.email);
        const materialsMap = new Map<string, { hasSlides: boolean; hasLinks: boolean }>();
        
        materials.forEach(material => {
          const dateStr = material.classDate.toISOString().split('T')[0];
          const key = `${material.classId}_${dateStr}`;
          materialsMap.set(key, {
            hasSlides: !!material.slides,
            hasLinks: Array.isArray(material.links) && material.links.length > 0
          });
        });
        
        setMaterialsInfo(materialsMap);
        setClassesWithMaterials(new Set(materialsMap.keys()));
      } catch (error) {
        console.error('Error fetching materials info:', error);
      }
    };

    fetchMaterialsInfo();
  }, [currentUser]);

  const handleClassClick = async (classItem: ClassWithStudents, date: Date) => {
    // Check if this class has materials before proceeding
    const dateStr = date.toISOString().split('T')[0];
    const key = `${classItem.id}_${dateStr}`;
    if (!classesWithMaterials.has(key)) return;

    setSelectedClass(classItem);
    setLoadingMaterial(true);

    try {
      if (!currentUser?.email) return;

      const materials = await getStudentClassMaterials(currentUser.email);
      
      // Find material for this specific class and date
      const material = materials.find(m => {
        const materialDateStr = m.classDate.toISOString().split('T')[0];
        const classDateStr = date.toISOString().split('T')[0];
        return m.classId === classItem.id && materialDateStr === classDateStr;
      });

      if (material) {
        setSelectedMaterial(material);
        if (material.slides) {
          setSlidesUrl(material.slides);
        }
      } else {
        setSelectedMaterial(null);
        setSlidesUrl(null);
      }
    } catch (error) {
      console.error('Error fetching class materials:', error);
      toast.error(t.failedToLoad);
    } finally {
      setLoadingMaterial(false);
    }
  };

  const handleDayClick = (date: Date, classes: ClassWithStudents[], isPaymentDay: boolean, isPaymentSoon: boolean) => {
    setSelectedDayDetails({
      date,
      classes,
      isPaymentDay,
      isPaymentSoon
    });
  };

  const renderCalendarDay = (date: Date, isToday: boolean) => {
    const dayOfWeek = date.getDay();
    const dayClasses = getClassesForDay(classes, dayOfWeek, date);
    
    // Calculate payment dates
    const paymentDates = classes.length > 0 ? 
      classes.flatMap(classItem => {
        if (!classItem.startDate) return [];
        return getNextPaymentDates(classItem.paymentConfig, classItem, selectedDate);
      }) : [];

    const isPaymentDay = paymentDates.some(paymentDate => 
      date.getFullYear() === paymentDate.getFullYear() &&
      date.getMonth() === paymentDate.getMonth() &&
      date.getDate() === paymentDate.getDate()
    );

    // Handle class count click
    const handleClassCountClick = (e: React.MouseEvent, classes: ClassWithStudents[], date: Date) => {
      e.stopPropagation();
      // For Schedule, we'll just show the day details when clicking on class count
      handleDayClick(date, classes, isPaymentDay, isPaymentDay && daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0);
    };

    // Handle payment pill click
    const handlePaymentPillClick = (e: React.MouseEvent, date: Date, classes: ClassWithStudents[]) => {
      e.stopPropagation();
      // For Schedule, we'll just show the day details when clicking on payment pill
      handleDayClick(date, classes, isPaymentDay, isPaymentDay && daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0);
    };

    const daysUntilPayment = isPaymentDay ? 
      Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
    const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

    return (
      <ScheduleCalendarDay<ClassWithStudents>
        date={date}
        isToday={isToday}
        classes={dayClasses}
        paymentsDue={isPaymentDay}
        onClassCountClick={handleClassCountClick}
        onPaymentPillClick={handlePaymentPillClick}
        onDayClick={(date, classes) => handleDayClick(date, classes, isPaymentDay, isPaymentSoon)}
        materialsInfo={materialsInfo}
      />
    );
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
              onDateSelect={(date: Date) => {
                const dayClasses = getClassesForDay(classes, date.getDay(), date);
                const paymentDates = classes.length > 0 ? 
                  classes.flatMap(classItem => {
                    if (!classItem.startDate) return [];
                    return getNextPaymentDates(classItem.paymentConfig, classItem, selectedDate);
                  }) : [];

                const isPaymentDay = paymentDates.some(paymentDate => 
                  date.getFullYear() === paymentDate.getFullYear() &&
                  date.getMonth() === paymentDate.getMonth() &&
                  date.getDate() === paymentDate.getDate()
                );

                const daysUntilPayment = isPaymentDay ? 
                  Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
                const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

                handleDayClick(date, dayClasses, isPaymentDay, isPaymentSoon);
              }}
              onMonthChange={setSelectedDate}
              renderDay={renderCalendarDay}
            />
          </div>

          {/* Details section */}
          <div>
            {selectedDayDetails ? (
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h3 className={styles.headings.h3}>
                  {selectedDayDetails.date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en', { 
                    weekday: 'long', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </h3>

                {selectedDayDetails.isPaymentDay && (
                  <div className="flex items-center gap-2 bg-[#fffbeb] p-3 rounded-lg mb-4">
                    <div className={`w-2 h-2 rounded-full ${selectedDayDetails.isPaymentSoon ? 'bg-[#ef4444]' : 'bg-[#f59e0b]'}`} />
                    <div>
                      <span className="text-sm font-medium text-[#f59e0b]">{t.paymentDue}</span>
                      {selectedDayDetails.isPaymentSoon && (
                        <span className="text-xs ml-2 text-[#ef4444]">Due soon</span>
                      )}
                    </div>
                  </div>
                )}

                {selectedDayDetails.classes.length > 0 ? (
                  selectedDayDetails.classes.map(classItem => {
                    const dateStr = selectedDayDetails.date.toISOString().split('T')[0];
                    const key = `${classItem.id}_${dateStr}`;
                    const materialInfo = materialsInfo.get(key);
                    const hasMaterials = !!materialInfo;

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
                          <span className="text-sm text-[#1a1a1a]">{DAYS_OF_WEEK_FULL[selectedDayDetails.date.getDay()]}</span>
                          
                          <span className="text-sm font-medium text-[#4b5563]">{t.time}</span>
                          <span className="text-sm text-[#1a1a1a]">{classItem.startTime} - {classItem.endTime}</span>

                          <span className="text-sm font-medium text-[#4b5563]">{t.class}</span>
                          <span className="text-sm text-[#1a1a1a]">{classItem.courseType || t.class}</span>

                          {classItem.notes && (
                            <>
                              <span className="text-sm font-medium text-[#4b5563]">{t.notes}</span>
                              <span className="text-sm text-[#1a1a1a]">{classItem.notes}</span>
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
                {selectedMaterial.slides && (
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