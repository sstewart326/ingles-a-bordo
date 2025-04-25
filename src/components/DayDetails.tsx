import { useState, useEffect, useRef } from 'react';
import { ClassSession, getBaseClassId } from '../utils/scheduleUtils';
import { ClassMaterial, Homework } from '../types/interfaces';
import { useTranslation } from '../translations';
import { useLanguage } from '../hooks/useLanguage';
import { PencilIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { Payment } from '../types/payment';
import { createPayment, deletePayment } from '../services/paymentService';
import { updateClassPaymentLink, getClassById } from '../utils/firebaseUtils';
import { ClassSection } from './ClassSection';
import { User } from '../types/interfaces';
import { formatDateWithShortDay } from '../utils/dateUtils';
import { useAuth } from '../hooks/useAuth';

interface DayDetailsProps {
  selectedDayDetails: {
    date: Date;
    classes: ClassSession[];
    paymentsDue: { user: User; classSession: ClassSession }[];
    materials: Record<string, ClassMaterial[]>;
    birthdays?: User[];
  } | null;
  setSelectedDayDetails?: (details: {
    date: Date;
    classes: ClassSession[];
    paymentsDue: { user: User; classSession: ClassSession }[];
    materials: Record<string, ClassMaterial[]>;
    birthdays?: User[];
  }) => void;
  editingNotes: { [classId: string]: string };
  savingNotes: { [classId: string]: boolean };
  editingPrivateNotes: { [classId: string]: string };
  savingPrivateNotes: { [classId: string]: boolean };
  deletingMaterial: { [materialId: string]: boolean };
  isAdmin: boolean;
  formatClassTime: (classSession: ClassSession) => string;
  onEditNotes: (classSession: ClassSession) => void;
  onSaveNotes: (classSession: ClassSession) => void;
  onCancelEditNotes: (classId: string) => void;
  onEditPrivateNotes: (classSession: ClassSession) => void;
  onCancelEditPrivateNotes: (classId: string) => void;
  onDeleteMaterial: (material: ClassMaterial, index: number, classId: string, type: 'slides' | 'link', itemIndex?: number) => void;
  onOpenUploadForm: (classId: string) => void;
  onCloseUploadForm: () => void;
  visibleUploadForm: string | null;
  textareaRefs: { [key: string]: HTMLTextAreaElement | null };
  onPaymentStatusChange?: (date: Date) => void;
  homeworkByClassId?: Record<string, Homework[]>;
  refreshHomework?: () => Promise<void>;
  formatStudentNames: (emails: string[]) => string;
  completedPayments: Record<string, Payment[]>;
  paymentsPage: number;
  onPaymentsPageChange: (newPage: number) => void;
}

interface PendingPaymentAction {
  userId: string;
  classSession: ClassSession;
  amount: number;
  currency: string;
}

export const DayDetails = ({
  selectedDayDetails,
  setSelectedDayDetails,
  editingNotes,
  savingNotes,
  editingPrivateNotes,
  savingPrivateNotes,
  deletingMaterial,
  isAdmin,
  formatClassTime,
  onEditNotes,
  onSaveNotes,
  onCancelEditNotes,
  onEditPrivateNotes,
  onCancelEditPrivateNotes,
  onDeleteMaterial,
  onOpenUploadForm,
  onCloseUploadForm,
  visibleUploadForm,
  textareaRefs,
  onPaymentStatusChange,
  homeworkByClassId,
  refreshHomework,
  formatStudentNames,
  completedPayments,
  paymentsPage,
  onPaymentsPageChange
}: DayDetailsProps) => {
  const { language } = useLanguage();
  const t = useTranslation(language);
  const [currentPage, setCurrentPage] = useState(0);
  const [editingPaymentLink, setEditingPaymentLink] = useState<{[classId: string]: string | null}>({});
  const [savingPaymentLink, setSavingPaymentLink] = useState<{[classId: string]: boolean}>({});
  const [paymentLinks, setPaymentLinks] = useState<{[classId: string]: string | null}>({});
  const [loadingPaymentLinks, setLoadingPaymentLinks] = useState<{[classId: string]: boolean}>({});
  const [loadingPaymentComplete, setLoadingPaymentComplete] = useState<{[key: string]: boolean}>({});
  const [loadingPaymentIncomplete, setLoadingPaymentIncomplete] = useState<{[key: string]: boolean}>({});
  const [showCompletionDateModal, setShowCompletionDateModal] = useState(false);
  const [selectedCompletionDate, setSelectedCompletionDate] = useState<Date>(new Date());
  const [pendingPaymentAction, setPendingPaymentAction] = useState<PendingPaymentAction | null>(null);
  const CLASSES_PER_PAGE = 3;
  const detailsContainerRef = useRef<HTMLDivElement>(null);
  const { currentUser } = useAuth();

  // Function to get day name from dayOfWeek number
  const getDayName = (dayOfWeek: number | undefined): string => {
    if (dayOfWeek === undefined) return '';
    
    const days = [
      formatDateWithShortDay(new Date(2024, 0, 7), language), // Sunday
      formatDateWithShortDay(new Date(2024, 0, 8), language), // Monday
      formatDateWithShortDay(new Date(2024, 0, 9), language), // Tuesday
      formatDateWithShortDay(new Date(2024, 0, 10), language), // Wednesday
      formatDateWithShortDay(new Date(2024, 0, 11), language), // Thursday
      formatDateWithShortDay(new Date(2024, 0, 12), language), // Friday
      formatDateWithShortDay(new Date(2024, 0, 13), language)  // Saturday
    ];
    
    return days[dayOfWeek];
  };

  // Add a useEffect to fetch payment links for all classes in selectedDayDetails
  useEffect(() => {
    if (!selectedDayDetails) return;
    
    const fetchPaymentLinks = async () => {
      const classIds = new Set<string>();
      
      // Collect all class IDs from classes and paymentsDue
      selectedDayDetails.classes.forEach(c => classIds.add(c.id));
      selectedDayDetails.paymentsDue.forEach(p => classIds.add(p.classSession.id));
      
      // Initialize loading state for all classes
      const newLoadingState: {[classId: string]: boolean} = {};
      Array.from(classIds).forEach(id => {
        newLoadingState[id] = true;
      });
      setLoadingPaymentLinks(newLoadingState);
      
      // Fetch payment links for all classes
      const promises = Array.from(classIds).map(async (classId) => {
        try {
          const classData = await getClassById(classId);
          return { 
            classId, 
            paymentLink: classData?.paymentConfig?.paymentLink || null 
          };
        } catch (error) {
          return { classId, paymentLink: null };
        }
      });
      
      const results = await Promise.all(promises);
      
      // Update payment links state
      const newPaymentLinks: {[classId: string]: string | null} = {};
      const newLoadingPaymentLinks: {[classId: string]: boolean} = {};
      
      results.forEach(({ classId, paymentLink }) => {
        newPaymentLinks[classId] = paymentLink;
        newLoadingPaymentLinks[classId] = false;
      });
      
      setPaymentLinks(newPaymentLinks);
      setLoadingPaymentLinks(newLoadingPaymentLinks);
    };
    
    fetchPaymentLinks();
  }, [selectedDayDetails]);

  const handleMarkPaymentCompleted = async (userId: string, classSession: ClassSession) => {
    setPendingPaymentAction({
      userId,
      classSession,
      amount: classSession.paymentConfig?.amount || 0,
      currency: classSession.paymentConfig?.currency || 'USD'
    });
    const defaultCompletionDate = new Date();
    defaultCompletionDate.setHours(12, 0, 0, 0);
    setSelectedCompletionDate(defaultCompletionDate);
    setShowCompletionDateModal(true);
  };

  const handleConfirmPaymentCompletion = async () => {
    try {
      if (!pendingPaymentAction || !selectedDayDetails) return;
      
      const { userId, classSession, amount, currency } = pendingPaymentAction;
      const paymentKey = `${userId}-${classSession.id}`;
      
      setLoadingPaymentComplete(prev => ({ ...prev, [paymentKey]: true }));
      
      const userPaymentDue = selectedDayDetails.paymentsDue.find(
        payment => payment.user.email === userId && payment.classSession.id === classSession.id
      );
      
      if (!userPaymentDue) {
        setLoadingPaymentComplete(prev => ({ ...prev, [paymentKey]: false }));
        return;
      }
      
      // Extract the base class ID for consistency with multiple schedule classes
      const baseClassId = getBaseClassId(classSession.id);
      
      // Get the current user ID for the teacherId parameter
      await createPayment(
        userPaymentDue.user.email,
        baseClassId,
        amount,
        currency,
        selectedDayDetails.date,
        currentUser?.uid || '', // Add teacherId parameter
        selectedCompletionDate
      );
      
      // Notify the parent component that a payment was completed
      if (onPaymentStatusChange) {
        onPaymentStatusChange(selectedDayDetails.date);
      }
      
      setLoadingPaymentComplete(prev => ({ ...prev, [paymentKey]: false }));
      setShowCompletionDateModal(false);
      setPendingPaymentAction(null);
    } catch (error) {
      if (pendingPaymentAction) {
        const paymentKey = `${pendingPaymentAction.userId}-${pendingPaymentAction.classSession.id}`;
        setLoadingPaymentComplete(prev => ({ ...prev, [paymentKey]: false }));
      }
      setShowCompletionDateModal(false);
      setPendingPaymentAction(null);
    }
  };

  const handleMarkPaymentIncomplete = async (payment: Payment) => {
    try {
      setLoadingPaymentIncomplete(prev => ({ ...prev, [payment.id]: true }));
      
      await deletePayment(payment.id);
      
      // Notify parent component to refresh calendar
      if (onPaymentStatusChange && selectedDayDetails) {
        onPaymentStatusChange(selectedDayDetails.date);
      }
    } catch (error) {
    } finally {
      setLoadingPaymentIncomplete(prev => ({ ...prev, [payment.id]: false }));
    }
  };

  const handleEditPaymentLink = async (classSession: ClassSession) => {
    try {
      // Find the most up-to-date class session from selectedDayDetails
      let updatedClassSession = classSession;
      
      if (selectedDayDetails) {
        // Try to find the class in the classes array
        const foundClass = selectedDayDetails.classes.find(c => c.id === classSession.id);
        if (foundClass) {
          updatedClassSession = foundClass;
        } else {
          // If not found in classes, try to find it in paymentsDue
          const foundPaymentDue = selectedDayDetails.paymentsDue.find(
            p => p.classSession.id === classSession.id
          );
          if (foundPaymentDue) {
            updatedClassSession = foundPaymentDue.classSession;
          }
        }
      }
      
      // Fetch the latest class data from the database to ensure we have the most up-to-date payment link
      try {
        const latestClassData = await getClassById(updatedClassSession.id);
        
        if (latestClassData && latestClassData.paymentConfig) {
          // Use the latest payment link from the database
          setEditingPaymentLink({
            ...editingPaymentLink,
            [updatedClassSession.id]: latestClassData.paymentConfig.paymentLink || ''
          });
          
          return;
        }
      } catch (error) {
        // Continue with local data if fetch fails
      }
      
      // Fallback to local data if fetch fails or returns no data
      if (!updatedClassSession.paymentConfig?.paymentLink) {
        setEditingPaymentLink({
          ...editingPaymentLink,
          [updatedClassSession.id]: ''
        });
      } else {
        setEditingPaymentLink({
          ...editingPaymentLink,
          [updatedClassSession.id]: updatedClassSession.paymentConfig.paymentLink
        });
      }
    } catch (error) {
    }
  };

  const handleSavePaymentLink = async (classSession: ClassSession) => {
    if (editingPaymentLink[classSession.id] === undefined) return;
    
    try {
      setSavingPaymentLink({
        ...savingPaymentLink,
        [classSession.id]: true
      });
      
      const paymentLink = editingPaymentLink[classSession.id] || '';
      
      // Extract the base class ID for consistency with multiple schedule classes
      const baseClassId = getBaseClassId(classSession.id);
      
      await updateClassPaymentLink(baseClassId, paymentLink);
      
      // Fetch the latest class data from the database to ensure we have the most up-to-date data
      const latestClassData = await getClassById(baseClassId);
      
      // Update our component state with the new payment link for all schedules of this class
      const allScheduleIds = selectedDayDetails?.classes
        .filter(c => getBaseClassId(c.id) === baseClassId)
        .map(c => c.id) || [classSession.id];
      
      const newPaymentLinks = { ...paymentLinks };
      allScheduleIds.forEach(id => {
        newPaymentLinks[id] = paymentLink;
      });
      setPaymentLinks(newPaymentLinks);
      
      // Update the class session in the selected day details
      if (selectedDayDetails && latestClassData) {
        
        // Update the classes array in selectedDayDetails
        const updatedClasses = selectedDayDetails.classes.map(c => {
          if (getBaseClassId(c.id) === baseClassId) {
            return {
              ...c,
              paymentConfig: {
                type: c.paymentConfig?.type || 'monthly',
                startDate: c.paymentConfig?.startDate || new Date().toISOString().split('T')[0],
                paymentLink,
                ...(c.paymentConfig || {})
              }
            } as ClassSession;
          }
          return c;
        });
        
        // Update the paymentsDue array in selectedDayDetails
        const updatedPaymentsDue = selectedDayDetails.paymentsDue.map(item => {
          if (getBaseClassId(item.classSession.id) === baseClassId) {
            const updatedClassSession = {
              ...item.classSession,
              paymentConfig: {
                type: item.classSession.paymentConfig?.type || 'monthly',
                startDate: item.classSession.paymentConfig?.startDate || new Date().toISOString().split('T')[0],
                paymentLink,
                ...(item.classSession.paymentConfig || {})
              }
            } as ClassSession;
            
            return {
              ...item,
              classSession: updatedClassSession
            };
          }
          return item;
        });
        
        // Set the updated selectedDayDetails
        const updatedSelectedDayDetails = {
          ...selectedDayDetails,
          classes: updatedClasses,
          paymentsDue: updatedPaymentsDue
        };
        
        // Update the local state first
        if (setSelectedDayDetails) {
          setSelectedDayDetails(updatedSelectedDayDetails);
        }
        
        // Then notify parent component to refresh calendar
        if (onPaymentStatusChange) {
          onPaymentStatusChange(selectedDayDetails.date);
        }
      }
      
      // Clear the editing state
      setEditingPaymentLink({
        ...editingPaymentLink,
        [classSession.id]: null
      });
    } catch (error) {
    } finally {
      setSavingPaymentLink({
        ...savingPaymentLink,
        [classSession.id]: false
      });
    }
  };

  const handleCancelEditPaymentLink = (classId: string) => {
    setEditingPaymentLink({
      ...editingPaymentLink,
      [classId]: null
    });
  };

  // Reset pagination when selected day changes
  useEffect(() => {
    setCurrentPage(0);
  }, [selectedDayDetails?.date]);

  // Calculate pagination values
  const totalClasses = selectedDayDetails?.classes.length || 0;
  const totalPages = Math.ceil(totalClasses / CLASSES_PER_PAGE);
  const startIndex = currentPage * CLASSES_PER_PAGE;
  const endIndex = Math.min(startIndex + CLASSES_PER_PAGE, totalClasses);
  const paginatedClasses = selectedDayDetails?.classes.slice(startIndex, endIndex) || [];

  // Add pagination controls for payments
  const PAYMENTS_PER_PAGE = 2;
  const totalPaymentsPages = selectedDayDetails ? Math.ceil(selectedDayDetails.paymentsDue.length / PAYMENTS_PER_PAGE) : 0;
  const paginatedPayments = selectedDayDetails ? selectedDayDetails.paymentsDue.slice(
    paymentsPage * PAYMENTS_PER_PAGE,
    (paymentsPage + 1) * PAYMENTS_PER_PAGE
  ) : [];

  // Add pagination controls component
  const PaymentsPagination = () => (
    <div className="flex justify-center items-center space-x-4 mt-4 mb-2">
      <button
        onClick={() => onPaymentsPageChange(Math.max(0, paymentsPage - 1))}
        disabled={paymentsPage === 0}
        className={`px-3 py-1 rounded ${
          paymentsPage === 0
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-blue-500 text-white hover:bg-blue-600'
        }`}
      >
        {t.previous || 'Previous'}
      </button>
      <span className="text-sm text-gray-600">
        {t.page || 'Page'} {paymentsPage + 1} {t.of || 'of'} {totalPaymentsPages}
      </span>
      <button
        onClick={() => onPaymentsPageChange(Math.min(totalPaymentsPages - 1, paymentsPage + 1))}
        disabled={paymentsPage >= totalPaymentsPages - 1}
        className={`px-3 py-1 rounded ${
          paymentsPage >= totalPaymentsPages - 1
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-blue-500 text-white hover:bg-blue-600'
        }`}
      >
        {t.next || 'Next'}
      </button>
    </div>
  );

  const scrollToTop = () => {
    const detailsSection = document.getElementById('day-details-section');
    if (detailsSection) {
      detailsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Check for changes in selectedDayDetails
  useEffect(() => {
    if (selectedDayDetails) {
      // Initialize payment links for all classes
      selectedDayDetails.classes.forEach(classSession => {
        if (classSession.paymentConfig?.paymentLink) {
          setPaymentLinks(prev => ({
            ...prev,
            [classSession.id]: classSession.paymentConfig?.paymentLink || null
          }));
        }
      });
    }
  }, [selectedDayDetails]);

  // Replace the nested useState and useEffect in the JSX with a function that uses the component-level state
  const renderPaymentLink = (classSession: ClassSession) => {
    // Find the most up-to-date class session
    let updatedClassSession = classSession;
    
    if (selectedDayDetails) {
      // Try to find the class in the classes array
      const foundClass = selectedDayDetails.classes.find(c => c.id === classSession.id);
      if (foundClass) {
        updatedClassSession = foundClass;
      } else {
        // If not found in classes, try to find it in paymentsDue
        const foundPaymentDue = selectedDayDetails.paymentsDue.find(
          p => p.classSession.id === classSession.id
        );
        if (foundPaymentDue) {
          updatedClassSession = foundPaymentDue.classSession;
        }
      }
    }
    
    // Use the payment link from our component state or from the class session
    const isLoading = loadingPaymentLinks[updatedClassSession.id];
    const paymentLink = paymentLinks[updatedClassSession.id] || updatedClassSession.paymentConfig?.paymentLink;
    
    // Display loading state if needed
    if (isLoading) {
      return (
        <div className="flex items-center">
          <span className="text-gray-500">{t.loading}</span>
        </div>
      );
    }
    
    // Display the payment link if available
    if (paymentLink) {
      return (
        <div className="flex items-center">
          <a 
            href={paymentLink} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            {t.paymentLink}
          </a>
          {isAdmin && (
            <PencilIcon
              onClick={() => handleEditPaymentLink(updatedClassSession)}
              className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer ml-1 flex-shrink-0"
              title={t.edit}
            />
          )}
        </div>
      );
    } else if (isAdmin) {
      return (
        <div 
          onClick={() => handleEditPaymentLink(updatedClassSession)}
          className="flex items-center text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          <span className="mr-1">{t.addPaymentLink}</span>
          <PencilIcon className="h-4 w-4 flex-shrink-0" />
        </div>
      );
    } else {
      return (
        <span className="text-gray-500">{t.noPaymentLink}</span>
      );
    }
  };

  // Add pagination controls component for classes
  const ClassesPagination = () => (
    <div className="flex justify-center items-center space-x-4 mt-4 mb-2">
      <button
        onClick={() => {
          setCurrentPage(prev => Math.max(0, prev - 1));
          scrollToTop();
        }}
        disabled={currentPage === 0}
        className={`px-3 py-1 rounded ${
          currentPage === 0
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-blue-500 text-white hover:bg-blue-600'
        }`}
      >
        {t.previous || 'Previous'}
      </button>
      <span className="text-sm text-gray-600">
        {t.page || 'Page'} {currentPage + 1} {t.of || 'of'} {totalPages}
      </span>
      <button
        onClick={() => {
          setCurrentPage(prev => Math.min(totalPages - 1, prev + 1));
          scrollToTop();
        }}
        disabled={currentPage >= totalPages - 1}
        className={`px-3 py-1 rounded ${
          currentPage >= totalPages - 1
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-blue-500 text-white hover:bg-blue-600'
        }`}
      >
        {t.next || 'Next'}
      </button>
    </div>
  );

  if (!selectedDayDetails) {
    return (
      <div className="bg-white rounded-lg p-6 h-full flex items-center justify-center text-gray-500">
        {t.selectDayToViewDetails}
      </div>
    );
  }

  return (
    <div id="day-details-section" className="bg-white rounded-lg p-6 w-full shadow-md border border-gray-200" style={{ maxWidth: '100%', overflowX: 'hidden' }} ref={detailsContainerRef}>
      <h2 className="text-xl font-semibold mb-6">
        {selectedDayDetails.date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}
      </h2>

      {/* No content message */}
      {selectedDayDetails.classes.length === 0 && 
       (!selectedDayDetails.birthdays || selectedDayDetails.birthdays.length === 0) && 
       selectedDayDetails.paymentsDue.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-gray-500">
          <div className="text-lg mb-2">{t.noDetailsAvailable || 'No details available'}</div>
          <p className="text-center text-sm">
            {t.nothingScheduledForThisDay || 'There are no classes, birthdays, or payments scheduled for this day.'}
          </p>
        </div>
      )}

      {/* Birthdays Section */}
      {selectedDayDetails.birthdays && selectedDayDetails.birthdays.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-4 flex items-center">
            <span role="img" aria-label="birthday" className="mr-2">🎂</span>
            {t.birthdays || 'Birthdays'}
          </h3>
          <div className="space-y-2 ml-6">
            {selectedDayDetails.birthdays.map((user) => (
              <div key={user.email} className="flex items-center">
                <h4 className="text-lg font-semibold text-purple-600">{user.name}</h4>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payments Due Section */}
      {selectedDayDetails.paymentsDue.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-4">{t.paymentsDue}</h3>
          <div className="space-y-4">
            {paginatedPayments.map(({ user, classSession }) => {
              // Get the selected date from context
              const selectedDateStart = new Date(selectedDayDetails.date);
              selectedDateStart.setHours(0, 0, 0, 0);
              const selectedDateEnd = new Date(selectedDayDetails.date);
              selectedDateEnd.setHours(23, 59, 59, 999);
              
              // Find payment that matches classSessionId, userId, and has a dueDate that falls on the selected date
              const payment = completedPayments[classSession.id]?.find(p => {
                // First check if this payment is for the correct user
                if (p.userId !== user.email) return false;
                
                // Then check if the payment's due date matches the selected date
                if (p.dueDate) {
                  // Convert Firebase Timestamp to JavaScript Date
                  let dueDateObj;
                  if (typeof p.dueDate === 'object' && 'seconds' in p.dueDate) {
                    // If it's a Firestore Timestamp
                    dueDateObj = new Date(p.dueDate.seconds * 1000);
                  } else if (Object.prototype.toString.call(p.dueDate) === '[object Date]') {
                    // If it's already a Date object
                    dueDateObj = p.dueDate as unknown as Date;
                  } else {
                    // If it's a date string or timestamp
                    dueDateObj = new Date(p.dueDate as any);
                  }
                  
                  // Reset hours to compare just the date
                  dueDateObj.setHours(0, 0, 0, 0);
                  
                  // Compare the dates
                  return dueDateObj.getTime() === selectedDateStart.getTime();
                }
                
                return false;
              });
              
              const completed = !!payment;
              return (
                <div
                  key={`${user.email}-${classSession.id}`}
                  className={`rounded-lg border ${
                    completed ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                  }`}
                >
                  {completed ? (
                    <div className="flex items-center justify-between text-green-600 bg-green-100 px-4 py-2 rounded-t-lg border-b border-green-200">
                      <div className="flex items-center">
                        <CheckCircleIcon className="h-5 w-5 mr-2" />
                        <span className="text-sm font-bold">{t.completed}</span>
                      </div>
                      {payment && payment.completedAt && (
                        <div className="mt-2 ml-4 text-sm text-[#22c55e]">
                          <div>{t.completedOn}:</div>
                          <div>{new Date(payment.completedAt.seconds * 1000).toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center text-yellow-600 bg-yellow-100 px-4 py-2 rounded-t-lg border-b border-yellow-200">
                      <div className="flex items-center">
                        <span className="text-sm font-bold">{t.paymentDue}</span>
                      </div>
                    </div>
                  )}
                  <div className="p-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-xl font-semibold mb-2">{user.name}</h4>
                        {/* Add time details */}
                        <div className="text-sm text-gray-600">
                          <div className="mt-1">
                            {classSession.scheduleType === 'multiple' && Array.isArray(classSession.schedules) ? (
                              <div>
                                {classSession.schedules
                                  .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                                  .map((schedule, index) => {
                                    // Create a temporary class session with this schedule's times
                                    const tempClassSession = {
                                      ...classSession,
                                      startTime: schedule.startTime,
                                      endTime: schedule.endTime,
                                      timezone: schedule.timezone || classSession.timezone,
                                      dayOfWeek: schedule.dayOfWeek
                                    };
                                    return (
                                      <div key={index}>
                                        {getDayName(schedule.dayOfWeek)}: {formatClassTime(tempClassSession)}
                                      </div>
                                    );
                                  })}
                              </div>
                            ) : (
                              <div>
                                {getDayName(classSession.dayOfWeek)}: {formatClassTime(classSession)}
                              </div>
                            )}
                          </div>
                          {classSession.paymentConfig?.amount !== undefined && classSession.paymentConfig.amount > 0 && classSession.paymentConfig?.currency && (
                            <div className="mt-1">
                              {(() => {
                                // Get the selected date from context
                                const selectedDateStart = new Date(selectedDayDetails.date);
                                selectedDateStart.setHours(0, 0, 0, 0);
                                
                                // Find valid payment with matching date
                                const paymentForAmount = completedPayments[classSession.id]?.find(p => {
                                  // First check if this payment is for the correct user
                                  if (p.userId !== user.email) return false;
                                  
                                  // Then check if the payment's due date matches the selected date
                                  if (p.dueDate) {
                                    // Convert Firebase Timestamp to JavaScript Date
                                    let dueDateObj;
                                    if (typeof p.dueDate === 'object' && 'seconds' in p.dueDate) {
                                      // If it's a Firestore Timestamp
                                      dueDateObj = new Date(p.dueDate.seconds * 1000);
                                    } else if (Object.prototype.toString.call(p.dueDate) === '[object Date]') {
                                      // If it's already a Date object
                                      dueDateObj = p.dueDate as unknown as Date;
                                    } else {
                                      // If it's a date string or timestamp
                                      dueDateObj = new Date(p.dueDate as any);
                                    }
                                    
                                    // Reset hours to compare just the date
                                    dueDateObj.setHours(0, 0, 0, 0);
                                    
                                    // Compare the dates
                                    return dueDateObj.getTime() === selectedDateStart.getTime();
                                  }
                                  
                                  return false;
                                });
                                
                                return paymentForAmount ? t.amountPaid : t.amountDue;
                              })()}: {classSession.paymentConfig.currency} {classSession.paymentConfig.amount.toFixed(2)}
                            </div>
                          )}
                          
                          {/* Payment Link Section */}
                          <div className="mt-1">
                            {editingPaymentLink[classSession.id] !== undefined && editingPaymentLink[classSession.id] !== null ? (
                              <div>
                                <div className="flex items-center">
                                  <input
                                    type="text"
                                    value={editingPaymentLink[classSession.id] || ''}
                                    onChange={(e) => setEditingPaymentLink({
                                      ...editingPaymentLink,
                                      [classSession.id]: e.target.value
                                    })}
                                    className="w-full p-1 border border-gray-300 rounded text-sm"
                                    placeholder="https://..."
                                  />
                                </div>
                                <div className="flex justify-end mt-2 space-x-2">
                                  <button
                                    onClick={() => handleCancelEditPaymentLink(classSession.id)}
                                    className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                    disabled={savingPaymentLink[classSession.id]}
                                  >
                                    {t.cancel || 'Cancel'}
                                  </button>
                                  <button
                                    onClick={() => handleSavePaymentLink(classSession)}
                                    className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                                    disabled={savingPaymentLink[classSession.id]}
                                  >
                                    {savingPaymentLink[classSession.id] 
                                      ? 'Saving...' 
                                      : 'Save'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center">
                                {renderPaymentLink(classSession)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  {!completed ? (
                    <div className="px-6 py-3 border-t border-yellow-200 bg-yellow-50">
                      <button
                        onClick={() => handleMarkPaymentCompleted(user.email, classSession)}
                        disabled={loadingPaymentComplete[`${user.email}-${classSession.id}`]}
                        className="w-full bg-yellow-100 text-yellow-700 hover:bg-yellow-200 py-2 rounded-md text-sm font-medium transition-colors border border-yellow-300 flex items-center justify-center"
                      >
                        {loadingPaymentComplete[`${user.email}-${classSession.id}`] ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-700 mr-2"></div>
                            {t.processing}
                          </>
                        ) : (
                          t.markAsCompleted
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="px-6 py-3 border-t border-green-200 bg-green-50">
                      <button
                        onClick={() => payment && handleMarkPaymentIncomplete(payment)}
                        disabled={payment && loadingPaymentIncomplete[payment.id]}
                        className="w-full bg-green-100 text-green-700 hover:bg-green-200 py-2 rounded-md text-sm font-medium transition-colors border border-green-300 flex items-center justify-center"
                      >
                        {payment && loadingPaymentIncomplete[payment.id] ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-700 mr-2"></div>
                            {t.processing}
                          </>
                        ) : (
                          t.markAsIncomplete
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <PaymentsPagination />
        </div>
      )}

      {/* Classes Section */}
      {selectedDayDetails.classes.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-4">
            {t.class || 'Classes'}
          </h3>
          
          <ClassSection
            title=""
            classes={paginatedClasses.map(classSession => ({
              ...classSession,
              _displayDate: selectedDayDetails.date
            }))}
            classMaterials={selectedDayDetails.materials}
            editingNotes={editingNotes}
            savingNotes={savingNotes}
            editingPrivateNotes={editingPrivateNotes}
            savingPrivateNotes={savingPrivateNotes}
            deletingMaterial={deletingMaterial}
            isAdmin={isAdmin}
            formatStudentNames={formatStudentNames}
            formatClassTime={formatClassTime}
            formatClassDate={() => ''}
            onEditNotes={onEditNotes}
            onSaveNotes={onSaveNotes}
            onCancelEditNotes={onCancelEditNotes}
            onEditPrivateNotes={onEditPrivateNotes}
            onCancelEditPrivateNotes={onCancelEditPrivateNotes}
            onDeleteMaterial={(material, index, classId, type = 'slides', itemIndex) => 
              onDeleteMaterial(material, index, classId, type, itemIndex)
            }
            onOpenUploadForm={onOpenUploadForm}
            onCloseUploadForm={onCloseUploadForm}
            visibleUploadForm={visibleUploadForm}
            textareaRefs={textareaRefs}
            pageSize={1000}
            currentPage={0}
            onPageChange={() => {}}
            sectionRef={detailsContainerRef}
            selectedDate={selectedDayDetails.date}
            homeworkByClassId={homeworkByClassId}
            refreshHomework={refreshHomework}
            noContainer={true}
            hideDateDisplay={true}
            t={{
              upcomingClasses: '',
              pastClasses: '',
              noUpcomingClasses: 'No classes for this day',
              noPastClasses: 'No classes for this day',
              addNotes: t.edit || 'Edit',
              addPrivateNotes: t.edit || 'Edit',
              materials: t.materials || 'Materials',
              addMaterials: t.addMaterials || 'Add Materials',
              slides: t.slides || 'Slides',
              link: t.paymentLink || 'Link',
              previous: t.previous || 'Previous',
              next: t.next || 'Next',
              notes: t.notes || 'Notes',
              notesInfo: t.notesInfo || 'Notes will be shared with students',
              cancel: t.cancel || 'Cancel',
              noNotes: t.noNotes || 'No notes available',
              edit: t.edit || 'Edit',
              privateNotes: t.privateNotes || 'Private notes',
              privateNotesInfo: t.privateNotesInfo || 'Private notes will not be shared with students'
            }}
          />
          
          {totalPages > 1 && <ClassesPagination />}
        </div>
      )}

      {/* Completion Date Modal */}
      {showCompletionDateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium mb-4">{t.selectCompletionDate}</h3>
            <input
              type="date"
              value={selectedCompletionDate instanceof Date && !isNaN(selectedCompletionDate.getTime()) 
                ? selectedCompletionDate.toISOString().split('T')[0] 
                : new Date().toISOString().split('T')[0]}
              onChange={(e) => {
                // Create date in local timezone by appending the timezone offset
                const date = new Date(e.target.value + 'T12:00:00');
                // Only update if it's a valid date
                if (!isNaN(date.getTime())) {
                  setSelectedCompletionDate(date);
                }
              }}
              className="w-full p-2 border rounded mb-4"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowCompletionDateModal(false);
                  setPendingPaymentAction(null);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleConfirmPaymentCompletion}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                {t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 