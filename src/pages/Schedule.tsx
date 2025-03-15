import { useState, useEffect, useRef } from 'react';
import { useAuthWithMasquerade } from '../hooks/useAuthWithMasquerade';
import { Calendar } from '../components/Calendar';
import { ScheduleCalendarDay } from '../components/ScheduleCalendarDay';
import '../styles/calendar.css';
import { styles } from '../styles/styleUtils';
import { FaFilePdf, FaLink, FaFileAlt } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { getCalendarData, clearCalendarCache } from '../services/calendarService';
import { ClassSession } from '../utils/scheduleUtils';

// Define types for the calendar data from the server
interface CalendarClass extends ClassSession {
  classDetails: {
    id: string;
    dayOfWeek: number;
    scheduleType: string;
    schedules: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
    }>;
    frequency: {
      type: string;
      every: number;
    };
    startTime: string;
    endTime: string;
    courseType: string;
    notes: string;
    studentEmails: string[];
    startDate: string | null;
    endDate: string | null;
    recurrencePattern: string;
    recurrenceInterval: number;
    paymentConfig: {
      amount: number;
      weeklyInterval: number | null;
      monthlyOption: string | null;
      currency: string;
      paymentLink: string;
      type: string;
      startDate: string;
    };
  };
  dates: string[];
  paymentDueDates: string[];
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

  // Class Materials Modal State
  const [selectedClass, setSelectedClass] = useState<CalendarClass | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<CalendarMaterial | null>(null);
  const [loadingMaterial, setLoadingMaterial] = useState(false);
  const [slidesUrl, setSlidesUrl] = useState<string | null>(null);

  const DAYS_OF_WEEK_FULL = [t.sunday, t.monday, t.tuesday, t.wednesday, t.thursday, t.friday, t.saturday];

  useEffect(() => {
    const fetchCalendarData = async () => {
      if (!currentUser) {
        setCalendarData(null);
        setLoading(false);
        return;
      }

      try {
        const month = selectedDate.getMonth();
        const year = selectedDate.getFullYear();
        
        const data = await getCalendarData(month, year);
        setCalendarData(data);
      } catch (error) {
        console.error('Error fetching calendar data:', error);
        toast.error(t.failedToLoad);
      } finally {
        setLoading(false);
      }
    };

    setLoading(true);
    fetchCalendarData();
  }, [currentUser, selectedDate]);

  // Clear calendar cache when masquerading status changes
  useEffect(() => {
    // Clear the calendar cache when masquerading status changes
    clearCalendarCache();
  }, [isMasquerading, masqueradingAs?.id]);

  const getClassesForDate = (date: Date): CalendarClass[] => {
    if (!calendarData?.classes) return [];
    
    const dateStr = date.toISOString().split('T')[0];
    
    return calendarData.classes.filter(classItem => 
      classItem.dates.some(classDate => 
        classDate.split('T')[0] === dateStr
      )
    );
  };

  const isPaymentDueOnDate = (date: Date): boolean => {
    if (!calendarData?.paymentDueDates) return false;
    
    const dateStr = date.toISOString().split('T')[0];
    
    return calendarData.paymentDueDates.some(payment => 
      payment.date.split('T')[0] === dateStr
    );
  };

  const handleClassClick = async (classItem: CalendarClass, date: Date) => {
    if (!calendarData?.materials) return;
    
    const classId = classItem.id;
    if (!calendarData.materials[classId]) return;
    
    setSelectedClass(classItem);
    setLoadingMaterial(true);

    try {
      const dateStr = date.toISOString().split('T')[0];
      
      // Find material for this specific class and date
      const material = calendarData.materials[classId].find(m => {
        const materialDateStr = m.classDate.split('T')[0];
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

  const handleDayClick = (date: Date, classes: CalendarClass[], isPaymentDay: boolean, isPaymentSoon: boolean) => {
    setSelectedDayDetails({
      date,
      classes,
      isPaymentDay,
      isPaymentSoon
    });
    
    // Scroll to details section with smooth behavior
    setTimeout(() => {
      detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const renderCalendarDay = (date: Date, isToday: boolean) => {
    const dayClasses = getClassesForDate(date);
    const isPaymentDay = isPaymentDueOnDate(date);
    
    // Calculate if payment is soon (within 3 days)
    const daysUntilPayment = isPaymentDay ? 
      Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
    const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

    // Handle class count click
    const handleClassCountClick = (e: React.MouseEvent, classes: CalendarClass[], date: Date) => {
      e.stopPropagation();
      handleDayClick(date, classes, isPaymentDay, isPaymentSoon);
    };

    // Handle payment pill click
    const handlePaymentPillClick = (e: React.MouseEvent, date: Date, classes: CalendarClass[]) => {
      e.stopPropagation();
      handleDayClick(date, classes, isPaymentDay, isPaymentSoon);
    };

    // Create materials info map for the ScheduleCalendarDay component
    const materialsInfo = new Map<string, { hasSlides: boolean; hasLinks: boolean }>();
    
    if (calendarData?.materials) {
      dayClasses.forEach(classItem => {
        const dateStr = date.toISOString().split('T')[0];
        const key = `${classItem.id}_${dateStr}`;
        
        if (calendarData.materials[classItem.id]) {
          const material = calendarData.materials[classItem.id].find(m => 
            m.classDate.split('T')[0] === dateStr
          );
          
          if (material) {
            materialsInfo.set(key, {
              hasSlides: Array.isArray(material.slides) && material.slides.length > 0,
              hasLinks: Array.isArray(material.links) && material.links.length > 0
            });
          }
        }
      });
    }

    // Map the calendar classes to include required ClassSession properties
    const mappedClasses = dayClasses.map(classItem => ({
      ...classItem,
      name: classItem.classDetails.courseType || 'Class',
      studentEmails: classItem.classDetails.studentEmails,
      dayOfWeek: classItem.classDetails.dayOfWeek,
      startTime: classItem.classDetails.startTime,
      endTime: classItem.classDetails.endTime,
      courseType: classItem.classDetails.courseType,
      notes: classItem.classDetails.notes,
      paymentConfig: classItem.classDetails.paymentConfig ? {
        type: classItem.classDetails.paymentConfig.type as 'weekly' | 'monthly',
        weeklyInterval: classItem.classDetails.paymentConfig.weeklyInterval || undefined,
        monthlyOption: classItem.classDetails.paymentConfig.monthlyOption as 'first' | 'fifteen' | 'last' | undefined,
        startDate: classItem.classDetails.paymentConfig.startDate,
        paymentLink: classItem.classDetails.paymentConfig.paymentLink,
        amount: classItem.classDetails.paymentConfig.amount,
        currency: classItem.classDetails.paymentConfig.currency
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
              onMonthChange={(date) => {
                setSelectedDate(date);
                // Fetch new data when month changes
                setLoading(true);
                const month = date.getMonth();
                const year = date.getFullYear();
                getCalendarData(month, year)
                  .then(data => {
                    setCalendarData(data);
                    setLoading(false);
                  })
                  .catch(error => {
                    console.error('Error fetching calendar data:', error);
                    toast.error(t.failedToLoad);
                    setLoading(false);
                  });
              }}
              onDayClick={(date: Date) => {
                const dayClasses = getClassesForDate(date);
                const isPaymentDay = isPaymentDueOnDate(date);
                
                const daysUntilPayment = isPaymentDay ? 
                  Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
                const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 3 && daysUntilPayment >= 0;

                handleDayClick(date, dayClasses, isPaymentDay, isPaymentSoon);
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
                <h3 className={styles.headings.h3}>
                  {selectedDayDetails.date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en', { 
                    weekday: 'long', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </h3>

                {selectedDayDetails.isPaymentDay && (
                  <div className="flex flex-col bg-[#fffbeb] p-3 rounded-lg mb-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${selectedDayDetails.isPaymentSoon ? 'bg-[#ef4444]' : 'bg-[#f59e0b]'}`} />
                      <div>
                        <span className="text-sm font-medium text-[#f59e0b]">{t.paymentDue}</span>
                        {selectedDayDetails.isPaymentSoon && (
                          <span className="text-xs ml-2 text-[#ef4444]">Due soon</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Payment Link Section */}
                    {calendarData?.paymentDueDates && calendarData.paymentDueDates.some(payment => {
                      const paymentDateStr = payment.date.split('T')[0];
                      const selectedDateStr = selectedDayDetails.date.toISOString().split('T')[0];
                      return paymentDateStr === selectedDateStr && payment.paymentLink;
                    }) && (
                      <div className="mt-2 ml-4">
                        {calendarData.paymentDueDates
                          .filter(payment => {
                            const paymentDateStr = payment.date.split('T')[0];
                            const selectedDateStr = selectedDayDetails.date.toISOString().split('T')[0];
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
                    const dateStr = selectedDayDetails.date.toISOString().split('T')[0];
                    
                    // Check if this class has materials
                    let hasMaterials = false;
                    if (calendarData?.materials && calendarData.materials[classItem.id]) {
                      hasMaterials = calendarData.materials[classItem.id].some(m => 
                        m.classDate.split('T')[0] === dateStr
                      );
                    }

                    // Get material info for display
                    let materialInfo = { hasSlides: false, hasLinks: false };
                    if (hasMaterials && calendarData?.materials) {
                      const material = calendarData.materials[classItem.id].find(m => 
                        m.classDate.split('T')[0] === dateStr
                      );
                      
                      if (material) {
                        materialInfo = {
                          hasSlides: Array.isArray(material.slides) && material.slides.length > 0,
                          hasLinks: Array.isArray(material.links) && material.links.length > 0
                        };
                      }
                    }

                    // Map the class to include required ClassSession properties
                    const mappedClass = {
                      ...classItem,
                      name: classItem.classDetails.courseType || 'Class',
                      studentEmails: classItem.classDetails.studentEmails,
                      dayOfWeek: classItem.classDetails.dayOfWeek,
                      startTime: classItem.classDetails.startTime,
                      endTime: classItem.classDetails.endTime,
                      courseType: classItem.classDetails.courseType,
                      notes: classItem.classDetails.notes,
                      paymentConfig: classItem.classDetails.paymentConfig ? {
                        type: classItem.classDetails.paymentConfig.type as 'weekly' | 'monthly',
                        weeklyInterval: classItem.classDetails.paymentConfig.weeklyInterval || undefined,
                        monthlyOption: classItem.classDetails.paymentConfig.monthlyOption as 'first' | 'fifteen' | 'last' | undefined,
                        startDate: classItem.classDetails.paymentConfig.startDate,
                        paymentLink: classItem.classDetails.paymentConfig.paymentLink,
                        amount: classItem.classDetails.paymentConfig.amount,
                        currency: classItem.classDetails.paymentConfig.currency
                      } : undefined
                    };

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
                          <span className="text-sm text-[#1a1a1a]">
                            {mappedClass.startTime} - {mappedClass.endTime}
                          </span>

                          <span className="text-sm font-medium text-[#4b5563]">{t.class}</span>
                          <span className="text-sm text-[#1a1a1a]">{mappedClass.courseType || t.class}</span>

                          {mappedClass.notes && (
                            <>
                              <span className="text-sm font-medium text-[#4b5563]">{t.notes}</span>
                              <span className="text-sm text-[#1a1a1a]">{mappedClass.notes}</span>
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