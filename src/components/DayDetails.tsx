import { useState, useEffect, useRef } from 'react';
import { ClassSession, User } from '../utils/scheduleUtils';
import { ClassMaterial } from '../types/interfaces';
import { styles } from '../styles/styleUtils';
import { useTranslation } from '../translations';
import { useLanguage } from '../hooks/useLanguage';
import { FaFilePdf, FaLink, FaPlus, FaTrash } from 'react-icons/fa';
import { PencilIcon, InformationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { UploadMaterialsForm } from './UploadMaterialsForm';
import Modal from './Modal';
import { Payment } from '../types/payment';
import { createPayment, getPaymentsByDueDate, deletePayment } from '../services/paymentService';
import { updateClassPaymentLink, getClassById } from '../utils/firebaseUtils';

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
  onSavePrivateNotes: (classSession: ClassSession) => void;
  onCancelEditPrivateNotes: (classId: string) => void;
  onDeleteMaterial: (material: ClassMaterial, index: number, classId: string, type: 'slides' | 'link', itemIndex?: number) => void;
  onOpenUploadForm: (classId: string) => void;
  onCloseUploadForm: () => void;
  visibleUploadForm: string | null;
  textareaRefs: { [key: string]: HTMLTextAreaElement | null };
  onPaymentStatusChange?: (date: Date) => void;
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
  onSavePrivateNotes,
  onCancelEditPrivateNotes,
  onDeleteMaterial,
  onOpenUploadForm,
  onCloseUploadForm,
  visibleUploadForm,
  textareaRefs,
  onPaymentStatusChange
}: DayDetailsProps) => {
  const { language } = useLanguage();
  const t = useTranslation(language);
  const [activeTooltips, setActiveTooltips] = useState<{[key: string]: boolean}>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [paymentsPage, setPaymentsPage] = useState(0);
  const [completedPayments, setCompletedPayments] = useState<Record<string, Payment[]>>({});
  const [editingPaymentLink, setEditingPaymentLink] = useState<{[classId: string]: string | null}>({});
  const [savingPaymentLink, setSavingPaymentLink] = useState<{[classId: string]: boolean}>({});
  const [paymentLinks, setPaymentLinks] = useState<{[classId: string]: string | null}>({});
  const [loadingPaymentLinks, setLoadingPaymentLinks] = useState<{[classId: string]: boolean}>({});
  const [loadingPaymentComplete, setLoadingPaymentComplete] = useState<{[key: string]: boolean}>({});
  const [loadingPaymentIncomplete, setLoadingPaymentIncomplete] = useState<{[key: string]: boolean}>({});
  const CLASSES_PER_PAGE = 3;
  const detailsContainerRef = useRef<HTMLDivElement>(null);
  
  const toggleTooltip = (key: string) => {
    setActiveTooltips(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Function to get day name from dayOfWeek number
  const getDayName = (dayOfWeek: number | undefined): string => {
    if (dayOfWeek === undefined) return '';
    
    const days = [
      t.sunday || 'Sunday',
      t.monday || 'Monday', 
      t.tuesday || 'Tuesday', 
      t.wednesday || 'Wednesday', 
      t.thursday || 'Thursday', 
      t.friday || 'Friday', 
      t.saturday || 'Saturday'
    ];
    
    return days[dayOfWeek];
  };

  // Reset payments page when selected day changes
  useEffect(() => {
    setPaymentsPage(0);
  }, [selectedDayDetails?.date]);

  // Only fetch completed payments when there are payments due
  useEffect(() => {
    const fetchCompletedPayments = async () => {
      if (!selectedDayDetails?.date || !selectedDayDetails.paymentsDue.length) return;
      
      const payments: Record<string, Payment[]> = {};
      
      for (const { classSession } of selectedDayDetails.paymentsDue) {
        const completedPaymentsForClass = await getPaymentsByDueDate(selectedDayDetails.date, classSession.id);
        if (completedPaymentsForClass.length > 0) {
          payments[classSession.id] = completedPaymentsForClass;
        }
      }
      
      setCompletedPayments(payments);
    };

    fetchCompletedPayments();
  }, [selectedDayDetails?.date, selectedDayDetails?.paymentsDue]);

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
          console.error(`Error fetching payment link for class ${classId}:`, error);
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
    try {
      const paymentKey = `${userId}-${classSession.id}`;
      setLoadingPaymentComplete(prev => ({ ...prev, [paymentKey]: true }));
      
      console.log('Starting payment completion...', { userId, classSessionId: classSession.id });
      
      // Get amount and currency from class configuration
      const amount = classSession.paymentConfig?.amount || 0;
      const currency = classSession.paymentConfig?.currency || 'USD';
      
      console.log('Payment details:', { amount, currency });
      
      // Find the user in the paymentsDue array to get their email
      const userPaymentDue = selectedDayDetails?.paymentsDue.find(
        payment => payment.classSession.id === classSession.id && payment.user.email === userId
      );
      
      if (!userPaymentDue) {
        console.error('User payment due not found');
        setLoadingPaymentComplete(prev => ({ ...prev, [paymentKey]: false }));
        return;
      }
      
      // Use the user's email as the userId since that's what we have
      const paymentId = await createPayment(userPaymentDue.user.email, classSession.id, amount, currency, selectedDayDetails!.date);
      console.log('Payment created with ID:', paymentId);
      
      // Fetch all completed payments to ensure state is fully up to date
      if (selectedDayDetails?.paymentsDue) {
        console.log('Fetching updated payments...');
        const payments: Record<string, Payment[]> = {};
        
        for (const { classSession: cs } of selectedDayDetails.paymentsDue) {
          const completedPaymentsForClass = await getPaymentsByDueDate(selectedDayDetails.date, cs.id);
          console.log('Completed payments for class:', cs.id, completedPaymentsForClass);
          if (completedPaymentsForClass.length > 0) {
            payments[cs.id] = completedPaymentsForClass;
          }
        }
        
        console.log('Setting completed payments:', payments);
        setCompletedPayments(payments);
      }
      
      // Notify parent component to refresh calendar
      if (onPaymentStatusChange && selectedDayDetails) {
        console.log('Triggering calendar refresh...');
        onPaymentStatusChange(selectedDayDetails.date);
      }
    } catch (error) {
      console.error('Error marking payment as completed:', error);
    } finally {
      const paymentKey = `${userId}-${classSession.id}`;
      setLoadingPaymentComplete(prev => ({ ...prev, [paymentKey]: false }));
    }
  };

  const handleMarkPaymentIncomplete = async (payment: Payment) => {
    try {
      setLoadingPaymentIncomplete(prev => ({ ...prev, [payment.id]: true }));
      
      await deletePayment(payment.id);
      
      // Update the local state by removing the payment
      setCompletedPayments(prev => ({
        ...prev,
        [payment.classSessionId]: prev[payment.classSessionId]?.filter(p => p.id !== payment.id) || []
      }));
      
      // Notify parent component to refresh calendar
      if (onPaymentStatusChange && selectedDayDetails) {
        onPaymentStatusChange(selectedDayDetails.date);
      }
    } catch (error) {
      console.error('Error marking payment as incomplete:', error);
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
          
          // Log for debugging
          console.log('Editing payment link for class:', updatedClassSession.id);
          console.log('Latest payment link from DB:', latestClassData.paymentConfig.paymentLink);
          return;
        }
      } catch (error) {
        console.error('Error fetching latest class data:', error);
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
      
      // Log for debugging
      console.log('Editing payment link for class:', updatedClassSession.id);
      console.log('Current payment link (from local state):', updatedClassSession.paymentConfig?.paymentLink);
    } catch (error) {
      console.error('Error in handleEditPaymentLink:', error);
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
      console.log('Saving payment link:', paymentLink);
      
      await updateClassPaymentLink(classSession.id, paymentLink);
      console.log('Payment link saved to database');
      
      // Fetch the latest class data from the database to ensure we have the most up-to-date data
      const latestClassData = await getClassById(classSession.id);
      
      // Update our component state with the new payment link
      setPaymentLinks(prev => ({
        ...prev,
        [classSession.id]: latestClassData?.paymentConfig?.paymentLink || null
      }));
      
      // Update the class session in the selected day details
      if (selectedDayDetails && latestClassData) {
        // Create updated class session with the latest data from the database
        const updatedClassSession: ClassSession = {
          ...classSession,
          ...latestClassData,
          paymentConfig: latestClassData.paymentConfig || {
            type: 'monthly', // Default type
            startDate: new Date().toISOString().split('T')[0], // Default start date
            paymentLink
          }
        };
        
        console.log('Updated class session:', updatedClassSession);
        console.log('Updated payment link:', updatedClassSession.paymentConfig?.paymentLink);
        
        // Update the classes array in selectedDayDetails
        const updatedClasses = selectedDayDetails.classes.map(c => 
          c.id === classSession.id ? updatedClassSession : c
        );
        
        // Update the paymentsDue array in selectedDayDetails
        const updatedPaymentsDue = selectedDayDetails.paymentsDue.map(item => {
          if (item.classSession.id === classSession.id) {
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
        
        console.log('Updating selectedDayDetails with new payment link');
        
        // Update the local state first
        if (setSelectedDayDetails) {
          setSelectedDayDetails(updatedSelectedDayDetails);
          console.log('selectedDayDetails updated');
        } else {
          console.log('setSelectedDayDetails is not available');
        }
        
        // Then notify parent component to refresh calendar
        if (onPaymentStatusChange) {
          onPaymentStatusChange(selectedDayDetails.date);
          console.log('Calendar refresh triggered');
        }
      }
      
      // Clear the editing state
      setEditingPaymentLink({
        ...editingPaymentLink,
        [classSession.id]: null
      });
      console.log('Editing state cleared');
    } catch (error) {
      console.error('Error saving payment link:', error);
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

  const renderUploadMaterialsSection = (classSession: ClassSession, date: Date) => (
    <Modal isOpen={visibleUploadForm === classSession.id} onClose={onCloseUploadForm}>
      <UploadMaterialsForm
        classId={classSession.id}
        classDate={date}
        studentEmails={classSession.studentEmails || []}
        onUploadSuccess={onCloseUploadForm}
      />
    </Modal>
  );

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
        onClick={() => setPaymentsPage(prev => Math.max(0, prev - 1))}
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
        onClick={() => setPaymentsPage(prev => Math.min(totalPaymentsPages - 1, prev + 1))}
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

  // Log when selectedDayDetails changes
  useEffect(() => {
    if (selectedDayDetails) {
      console.log('selectedDayDetails changed:', selectedDayDetails);
      
      // Log payment links for all classes
      selectedDayDetails.classes.forEach(classSession => {
        console.log(`Class ${classSession.id} payment link:`, classSession.paymentConfig?.paymentLink);
      });
      
      // Log payment links for all payment due classes
      selectedDayDetails.paymentsDue.forEach(({ classSession }) => {
        console.log(`Payment due class ${classSession.id} payment link:`, classSession.paymentConfig?.paymentLink);
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
    
    // Use the payment link from our component state
    const isLoading = loadingPaymentLinks[updatedClassSession.id];
    const paymentLink = paymentLinks[updatedClassSession.id];
    
    // Display loading state if needed
    if (isLoading) {
      return (
        <div className="flex items-center">
          <span className="text-gray-500">Loading payment link...</span>
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
              title={t.edit || 'Edit'}
            />
          )}
        </div>
      );
    } else if (isAdmin) {
      return (
        <button
          onClick={() => handleEditPaymentLink(updatedClassSession)}
          className={`${styles.buttons.secondary} flex items-center text-sm py-1 px-3`}
        >
          <PencilIcon className="h-4 w-4 mr-1" />
          {t.paymentLink || 'Add payment link'}
        </button>
      );
    } else {
      return (
        <span className="text-gray-500">{'No payment link available'}</span>
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
              const payment = completedPayments[classSession.id]?.find(p => p.userId === user.email);
              const completed = !!payment;
              return (
                <div
                  key={`${user.email}-${classSession.id}`}
                  className={`rounded-lg border ${
                    completed ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                  }`}
                >
                  {completed ? (
                    <div className="flex items-center text-green-600 bg-green-100 px-4 py-2 rounded-t-lg border-b border-green-200">
                      <div className="flex items-center">
                        <CheckCircleIcon className="h-5 w-5 mr-2" />
                        <span className="text-sm font-bold">{t.completed}</span>
                      </div>
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
                        {/* Add class day and time details */}
                        <div className="text-sm text-gray-600">
                          <div className="font-medium">{t.dayOfWeek}: {getDayName(classSession.dayOfWeek)}</div>
                          {classSession.startTime && classSession.endTime && (
                            <div className="mt-1">{t.time}: {classSession.startTime} - {classSession.endTime}</div>
                          )}
                          {classSession.paymentConfig?.amount && classSession.paymentConfig?.currency && (
                            <div className="mt-1">
                              {t.amount || "Amount"}: {classSession.paymentConfig.currency} {classSession.paymentConfig.amount.toFixed(2)}
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
      {paginatedClasses.map((classSession) => (
        <div key={classSession.id} className="mb-8 last:mb-0">
          <div className="flex justify-between items-start w-full">
            <div className="w-full overflow-hidden">
              <div className="text-sm font-bold text-black mb-2">
                {selectedDayDetails.date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en', { 
                  weekday: 'long', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </div>
              <div className={styles.card.title}>
                {(classSession.students || []).join(', ')}
              </div>
              <div className={styles.card.subtitle}>
                {formatClassTime(classSession)}
              </div>
              
              {/* Notes section */}
              <div className="mt-4 w-full">
                <div className={styles.card.label}>
                  {t.notes || 'Notes'}
                  <span className="inline-block ml-1 relative group">
                    <InformationCircleIcon 
                      className="h-4 w-4 text-gray-400 inline-block hover:text-gray-600 cursor-pointer" 
                      onClick={() => toggleTooltip(`notes-${classSession.id}`)}
                    />
                    <span className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 w-36 p-1.5 bg-gray-800 text-white text-xs rounded shadow-lg ${activeTooltips[`notes-${classSession.id}`] ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} z-10 whitespace-normal pointer-events-none transition-opacity duration-150 normal-case`}>
                      {t.notesInfo || 'Notes will be shared with students'}
                      <span className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-800"></span>
                    </span>
                  </span>
                </div>
                
                {editingNotes[classSession.id] !== undefined ? (
                  <div className="mt-1 w-full">
                    <textarea
                      ref={(el) => { textareaRefs[classSession.id] = el; }}
                      defaultValue={editingNotes[classSession.id]}
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                      rows={3}
                    />
                    <div className="flex justify-end mt-2 space-x-2">
                      <button
                        onClick={() => onCancelEditNotes(classSession.id)}
                        className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                        disabled={savingNotes[classSession.id]}
                      >
                        {t.cancel || 'Cancel'}
                      </button>
                      <button
                        onClick={() => onSaveNotes(classSession)}
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
                        onClick={() => onEditNotes(classSession)}
                        className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer ml-1 flex-shrink-0"
                        title={t.edit || 'Edit'}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Private Notes section */}
              <div className="mt-4 w-full">
                <div className={styles.card.label}>
                  {t.privateNotes || 'Private notes'}
                  <span className="inline-block ml-1 relative group">
                    <InformationCircleIcon 
                      className="h-4 w-4 text-gray-400 inline-block hover:text-gray-600 cursor-pointer" 
                      onClick={() => toggleTooltip(`private-notes-${classSession.id}`)}
                    />
                    <span className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 w-36 p-1.5 bg-gray-800 text-white text-xs rounded shadow-lg ${activeTooltips[`private-notes-${classSession.id}`] ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} z-10 whitespace-normal pointer-events-none transition-opacity duration-150 normal-case`}>
                      {t.privateNotesInfo || 'Private notes will not be shared with students'}
                      <span className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-800"></span>
                    </span>
                  </span>
                </div>
                
                {editingPrivateNotes[classSession.id] !== undefined ? (
                  <div className="mt-1 w-full">
                    <textarea
                      ref={(el) => { textareaRefs[`private_${classSession.id}`] = el; }}
                      defaultValue={editingPrivateNotes[classSession.id]}
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                      rows={3}
                    />
                    <div className="flex justify-end mt-2 space-x-2">
                      <button
                        onClick={() => onCancelEditPrivateNotes(classSession.id)}
                        className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                        disabled={savingPrivateNotes[classSession.id]}
                      >
                        {t.cancel || 'Cancel'}
                      </button>
                      <button
                        onClick={() => onSavePrivateNotes(classSession)}
                        className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                        disabled={savingPrivateNotes[classSession.id]}
                      >
                        {savingPrivateNotes[classSession.id]
                          ? 'Saving...'
                          : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-700 text-sm mt-1 flex items-center">
                    <span>{classSession.privateNotes || (t.noNotes || 'No private notes available')}</span>
                    {!editingPrivateNotes[classSession.id] && (
                      <PencilIcon
                        onClick={() => onEditPrivateNotes(classSession)}
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
                          onOpenUploadForm(classSession.id);
                        }}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        {t.addMaterials}
                      </a>
                    )}
                  </div>
                  <div className="mt-1 space-y-2 overflow-hidden" style={{ maxWidth: '100%', wordBreak: 'break-word' }}>
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
                                <FaFilePdf className="mr-2 flex-shrink-0" />
                                <span className="text-sm overflow-hidden whitespace-nowrap text-ellipsis" style={{ maxWidth: '250px', display: 'inline-block', wordBreak: 'break-all' }}>
                                  {t.slides || "Slides"} {material.slides && material.slides.length > 1 ? `(${slideIndex + 1}/${material.slides.length})` : ''}
                                </span>
                                {isAdmin && (
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      onDeleteMaterial(material, index, classSession.id, 'slides', slideIndex);
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
                                <FaLink className="mr-2 flex-shrink-0" />
                                <span className="text-sm overflow-hidden whitespace-nowrap text-ellipsis" style={{ maxWidth: '250px', display: 'inline-block', wordBreak: 'break-all' }}>{link}</span>
                                {isAdmin && (
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      onDeleteMaterial(material, index, classSession.id, 'link', linkIndex);
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
                      onOpenUploadForm(classSession.id);
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
      
      {/* Classes Pagination */}
      {totalPages > 1 && <ClassesPagination />}
    </div>
  );
}; 