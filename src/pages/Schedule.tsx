import { useState, useEffect } from 'react';
import { where } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { useAdmin } from '../hooks/useAdmin';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { getCachedCollection } from '../utils/firebaseUtils';
import { getDaysInMonth } from '../utils/dateUtils';
import { getStudentClassMaterials } from '../utils/classMaterialsUtils';
import { FaFilePdf, FaLink, FaFileAlt } from 'react-icons/fa';
import toast from 'react-hot-toast';
import {
  User,
  ClassWithStudents,
  getClassesForDay,
  getNextPaymentDates,
} from '../utils/scheduleUtils';

interface ClassMaterial {
  classId: string;
  slides?: string;
  links?: string[];
  createdAt: Date;
  updatedAt: Date;
  classDate: Date;
  studentEmails: string[];
  studentIds?: string[];
}

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
  const [showMaterialsModal, setShowMaterialsModal] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassWithStudents | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<ClassMaterial | null>(null);
  const [loadingMaterial, setLoadingMaterial] = useState(false);
  const [slidesUrl, setSlidesUrl] = useState<string | null>(null);
  const [classesWithMaterials, setClassesWithMaterials] = useState<Set<string>>(new Set());
  const [materialsInfo, setMaterialsInfo] = useState<Map<string, { hasSlides: boolean; hasLinks: boolean }>>(new Map());

  const DAYS_OF_WEEK = [t.sundayShort, t.mondayShort, t.tuesdayShort, t.wednesdayShort, t.thursdayShort, t.fridayShort, t.saturdayShort];
  const DAYS_OF_WEEK_FULL = [t.sunday, t.monday, t.tuesday, t.wednesday, t.thursday, t.friday, t.saturday];

  // Update time formatting to handle undefined values
  const formatTimeDisplay = (classItem: ClassWithStudents) => {
    if (!classItem.startTime || !classItem.endTime) return null;
    
    // Convert time to position
    const startHour = parseInt(classItem.startTime.match(/(\d+):/)?.[1] || '0');
    const startMinutes = parseInt(classItem.startTime.match(/:(\d+)/)?.[1] || '0');
    const startPeriod = classItem.startTime.includes('PM');
    const startTime24 = startPeriod && startHour !== 12 ? startHour + 12 : startHour;

    const endHour = parseInt(classItem.endTime.match(/(\d+):/)?.[1] || '0');
    const endMinutes = parseInt(classItem.endTime.match(/:(\d+)/)?.[1] || '0');
    const endPeriod = classItem.endTime.includes('PM');
    
    // Calculate position (6am = 0%, 6pm = 100%)
    const position = ((startTime24 - 6) / 12) * 100;

    // Format time string
    const startTimeStr = `${startHour}${startMinutes > 0 ? `:${startMinutes}` : ''}`;
    const endTimeStr = `${endHour}${endMinutes > 0 ? `:${endMinutes}` : ''}`;
    const timeStr = `${startTimeStr}-${endTimeStr}${startPeriod === endPeriod ? endPeriod ? 'pm' : 'am' : ''}`;

    return {
      position,
      timeStr
    };
  };

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
    setShowMaterialsModal(true);

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

  const renderCalendar = () => {
    const { days, firstDay } = getDaysInMonth(selectedDate);

    return (
      <div className="calendar-grid bg-white rounded-2xl shadow-sm border border-[#f0f0f0]">
        {DAYS_OF_WEEK.map((day) => (
          <div
            key={day}
            className="calendar-day-header text-center text-sm font-medium text-[#666666] py-4"
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
          const dayClasses = getClassesForDay(classes, dayOfWeek, date);
          const isToday =
            date.getDate() === new Date().getDate() &&
            date.getMonth() === new Date().getMonth() &&
            date.getFullYear() === new Date().getFullYear();

          const paymentDates = classes.length > 0 ? 
            classes.flatMap(classItem => {
              if (!classItem.startDate) return [];
              console.log('Calculating payment dates for class:', {
                classId: classItem.id,
                classStartDate: classItem.startDate.toDate().toISOString(),
                classEndDate: classItem.endDate?.toDate().toISOString(),
                paymentConfig: classItem.paymentConfig
              });
              const dates = getNextPaymentDates(classItem.paymentConfig, classItem, selectedDate);
              console.log('Payment dates for class:', classItem.id, dates.map(d => d.toISOString()));
              return dates;
            }) : [];

          const isPaymentDay = paymentDates.some(paymentDate => {
            const matches = date.getFullYear() === paymentDate.getFullYear() &&
                   date.getMonth() === paymentDate.getMonth() &&
                   date.getDate() === paymentDate.getDate();
            if (matches) {
              console.log('Found payment day match:', {
                date: date.toISOString(),
                paymentDate: paymentDate.toISOString()
              });
            }
            return matches;
          });

          const daysUntilPayment = isPaymentDay ? 
            Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
          const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

          return (
            <div
              key={index}
              onClick={() => handleDayClick(date, dayClasses, isPaymentDay, isPaymentSoon)}
              className={`calendar-day hover:bg-[#f8f8f8] transition-colors
                ${isToday ? 'bg-[#f8f8f8]' : ''} 
                ${selectedDayDetails?.date.toDateString() === date.toDateString() ? 'bg-[#f0f0f0]' : ''}`}
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
                {/* Class details (hidden on mobile) */}
                {dayClasses.length > 0 && (
                  <div className="class-details mt-1">
                    <div className="time-slots-container relative flex-1">
                      {/* Class slots */}
                      <div className="time-slots relative h-full">
                        {dayClasses.map(classItem => {
                          const dateStr = date.toISOString().split('T')[0];
                          const key = `${classItem.id}_${dateStr}`;
                          const materialInfo = materialsInfo.get(key);
                          const hasMaterials = !!materialInfo;
                          const timeDisplay = formatTimeDisplay(classItem);

                          return timeDisplay ? (
                            <div
                              key={classItem.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (hasMaterials) handleClassClick(classItem, date);
                              }}
                              className={`absolute right-0 left-0 transform -translate-y-1/2 rounded-md py-0.5 px-1 transition-all ${
                                hasMaterials 
                                  ? 'bg-[#6366f1] cursor-pointer hover:bg-[#4f46e5]' 
                                  : 'bg-[#818cf8]'
                              }`}
                              style={{ top: `${timeDisplay.position}%` }}
                            >
                              <span className="text-[0.6rem] leading-none text-white font-medium block text-center truncate">
                                {timeDisplay.timeStr}
                              </span>
                            </div>
                          ) : null;
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
            <h1 className="text-3xl font-bold text-[#1a1a1a]">{t.courseSchedule}</h1>
            <p className="mt-2 text-sm text-black">
            </p>
          </div>
        </div>

        {/* New responsive layout container */}
        <div className="mt-8 lg:grid lg:grid-cols-[2fr,1fr] lg:gap-8">
          {/* Calendar section */}
          <div>
            <div className="flex items-center justify-center gap-4 mb-6">
              <button
                onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1))}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--brand-color)] hover:bg-[var(--brand-color-dark)] text-[var(--header-bg)] transition-colors text-xl"
              >
                ‹
              </button>
              <h2 className="text-2xl font-semibold text-[#1a1a1a] min-w-[200px] text-center">
                {selectedDate.toLocaleString(language === 'pt-BR' ? 'pt-BR' : 'en', { month: 'long', year: 'numeric' })}
              </h2>
              <button
                onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1))}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--brand-color)] hover:bg-[var(--brand-color-dark)] text-[var(--header-bg)] transition-colors text-xl"
              >
                ›
              </button>
            </div>
            {renderCalendar()}
          </div>

          {/* Details section - Now always visible on larger screens */}
          <div className="mt-8 lg:mt-[3.75rem]"> {/* Align with calendar grid */}
            {selectedDayDetails ? (
              <div className="bg-white rounded-2xl shadow-sm border border-[#f0f0f0] p-6 lg:sticky lg:top-8">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-lg font-medium text-[#1a1a1a]">
                    {selectedDayDetails.date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </h3>
                </div>

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
              <div className="bg-white rounded-2xl shadow-sm border border-[#f0f0f0] p-6 lg:sticky lg:top-8">
                <p className="text-gray-500 text-center">{t.selectDayToViewDetails}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Class Materials Modal */}
      {showMaterialsModal && selectedClass && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-semibold text-gray-900">
                {t.classMaterialsTitle}
              </h3>
              <button
                onClick={() => {
                  setShowMaterialsModal(false);
                  setSelectedClass(null);
                  setSelectedMaterial(null);
                  setSlidesUrl(null);
                }}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                X
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
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-3">{t.usefulLinks}</h3>
                    <div className="space-y-2">
                      {selectedMaterial.links.map((link, index) => (
                        <a
                          key={index}
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-indigo-600 hover:text-indigo-900"
                        >
                          <FaLink className="mr-2" />
                          {link}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                {t.noMaterialsFound}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}; 