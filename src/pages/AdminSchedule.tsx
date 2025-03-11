import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import Select, { MultiValue, StylesConfig } from 'react-select';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { 
  getCachedCollection, 
  setCachedDocument, 
  deleteCachedDocument,
  updateCachedDocument 
} from '../utils/firebaseUtils';
import { Timestamp } from 'firebase/firestore';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { db } from '../config/firebase';
import { getDocs, collection } from 'firebase/firestore';
import { styles, classNames } from '../styles/styleUtils';
import { getDayName } from '../utils/dateUtils';
import Modal from '../components/Modal';

interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  createdAt: string;
  status?: 'active' | 'pending';
}

interface PaymentConfig {
  type: 'weekly' | 'monthly';
  weeklyInterval?: number;  // for weekly payments, number of weeks
  monthlyOption?: 'first' | 'fifteen' | 'last';  // for monthly payments: first day, 15th, or last day
  startDate: string;  // YYYY-MM-DD date string
  paymentLink?: string;  // URL for payment
  amount?: number;  // Payment amount
  currency?: string;  // Payment currency (e.g., USD, BRL)
}

interface Class {
  id: string;
  studentEmails: string[];
  studentIds?: string[];
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  courseType: string;
  notes?: string;
  startDate: Timestamp;
  endDate?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  paymentConfig: PaymentConfig;
}

interface SelectOption {
  value: string;
  label: string;
}

type SelectStyles = StylesConfig<SelectOption, true>;

const generateTimeOptions = () => {
  const times = [];
  for (let hour = 6; hour <= 21; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const time = new Date();
      time.setHours(hour);
      time.setMinutes(minute);
      times.push(time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }));
    }
  }
  return times;
};

const getNextDayOccurrence = (dayOfWeek: number) => {
  const today = new Date();
  const resultDate = new Date();
  const daysUntilNext = (dayOfWeek - today.getDay() + 7) % 7;
  resultDate.setDate(today.getDate() + daysUntilNext);
  // Reset time to start of day
  resultDate.setHours(0, 0, 0, 0);
  return resultDate;
};

const timeOptions = generateTimeOptions();

interface NewClass {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  courseType: string;
  notes: string;
  studentEmails: string[];
  startDate: Date;
  endDate: Date | null;
  paymentConfig: {
    type: 'weekly' | 'monthly';
    weeklyInterval: number | null;
    monthlyOption: 'first' | 'fifteen' | 'last' | null;
    startDate: string;  // YYYY-MM-DD date string
    paymentLink?: string;  // URL for payment
    amount?: number;  // Payment amount
    currency?: string;  // Payment currency (e.g., USD, BRL)
  };
}

export const AdminSchedule = () => {
  const { language } = useLanguage();
  const t = useTranslation(language);
  const DAYS_OF_WEEK = [t.sunday, t.monday, t.tuesday, t.wednesday, t.thursday, t.friday, t.saturday];
  const [classes, setClasses] = useState<Class[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newClass, setNewClass] = useState<NewClass>(() => {
    const today = new Date();
    return {
      dayOfWeek: 1,
      startTime: '09:00 AM',
      endTime: '10:00 AM',
      courseType: 'Individual',
      notes: '',
      studentEmails: [],
      startDate: getNextDayOccurrence(1),
      endDate: null,
      paymentConfig: {
        type: 'weekly',
        weeklyInterval: 1,
        monthlyOption: null,
        startDate: today.toISOString().split('T')[0],
        paymentLink: '',
        amount: 0,
        currency: 'BRL'
      }
    };
  });
  const [showMobileView, setShowMobileView] = useState(window.innerWidth < 768);

  // Replace editing states with modal state
  const [editingClass, setEditingClass] = useState<{
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    courseType: string;
    notes: string;
    studentEmails: string[];
    startDate: Date;
    endDate: Date | null;
    paymentConfig: PaymentConfig;
  } | null>(null);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchAllUsers();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const loadData = async () => {
      setLoading(true);
      try {
        await fetchAllUsers();
        await fetchClasses();
      } catch (error) {
        console.error('Error loading data:', error);
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();

    const handleResize = () => {
      setShowMobileView(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const fetchClasses = async () => {
    try {
      const classesData = await getCachedCollection<Class>('classes', [], { includeIds: true });
      setClasses(classesData);
    } catch (error) {
      console.error('Error fetching classes:', error);
      throw error; // Propagate error to be handled by loadData
    }
  };

  const fetchAllUsers = async () => {
    try {
      // Fetch all users directly from Firestore to get fresh data
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const users = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as User[];
      setUsers(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error; // Propagate error to be handled by loadData
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate payment start date for monthly payments
    if (newClass.paymentConfig.type === 'monthly') {
      const [year, month, day] = newClass.paymentConfig.startDate.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      const dayOfMonth = date.getDate();
      const lastDayOfMonth = new Date(year, month, 0).getDate();
      
      if (dayOfMonth !== 1 && dayOfMonth !== 15 && dayOfMonth !== lastDayOfMonth) {
        toast.error("For monthly payments, start date must be the 1st, 15th, or last day of the month");
        return;
      }
    }
    
    try {
      const now = Timestamp.now();
      
      // Get the selected students' emails directly
      const selectedStudents = users.filter(user => 
        newClass.studentEmails.includes(user.email)
      );
      const studentEmails = selectedStudents.map(student => student.email);
      
      // Clean up payment config to remove undefined/null values
      const paymentConfig = {
        type: newClass.paymentConfig.type,
        startDate: newClass.paymentConfig.startDate,
        ...(newClass.paymentConfig.type === 'weekly' ? { 
          weeklyInterval: newClass.paymentConfig.weeklyInterval || 1,
          monthlyOption: null
        } : { 
          weeklyInterval: null,
          monthlyOption: newClass.paymentConfig.monthlyOption || 'first'
        }),
        paymentLink: newClass.paymentConfig.paymentLink || '',
        amount: newClass.paymentConfig.amount || 0,
        currency: newClass.paymentConfig.currency || 'BRL'
      };
      
      const classData = {
        dayOfWeek: newClass.dayOfWeek,
        startTime: newClass.startTime,
        endTime: newClass.endTime,
        courseType: newClass.courseType,
        notes: newClass.notes,
        studentEmails: studentEmails,
        startDate: Timestamp.fromDate(newClass.startDate),
        ...(newClass.endDate ? { endDate: Timestamp.fromDate(newClass.endDate) } : {}),
        createdAt: now,
        updatedAt: now,
        paymentConfig
      };

      // Generate a unique ID for the new class
      const classId = Date.now().toString();
      await setCachedDocument('classes', classId, classData);
      
      await fetchClasses();
      setShowAddForm(false);
      const today = new Date();
      
      // Ensure the payment start date is valid for monthly payments
      let paymentStartDate = today.toISOString().split('T')[0];
      const paymentType = 'weekly'; // Default to weekly when resetting
      
      setNewClass({
        dayOfWeek: 1,
        startTime: '09:00 AM',
        endTime: '10:00 AM',
        courseType: 'Individual',
        notes: '',
        studentEmails: [],
        startDate: getNextDayOccurrence(1),
        endDate: null,
        paymentConfig: {
          type: paymentType,
          weeklyInterval: 1,
          monthlyOption: null,
          startDate: paymentStartDate,
          paymentLink: '',
          amount: 0,
          currency: 'BRL'
        }
      });
      toast.success('Class created successfully');
    } catch (error) {
      console.error('Error creating class:', error);
      toast.error('Failed to create class');
    }
  };

  const handleDeleteClass = async (classId: string) => {
    const classToDelete = classes.find(c => c.id === classId);
    if (!classToDelete) return;

    const dayName = DAYS_OF_WEEK[classToDelete.dayOfWeek];
    const confirmMessage = `Are you sure you want to delete the ${classToDelete.courseType} class on ${dayName} at ${classToDelete.startTime}?`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      await deleteCachedDocument('classes', classId);
      await fetchClasses();
      toast.success('Class deleted successfully');
    } catch (error) {
      console.error('Error deleting class:', error);
      toast.error('Failed to delete class');
    }
  };

  const studentOptions = users
    .filter(user => !user.isAdmin) // Filter out admin users
    .map(user => ({
      value: user.email,
      label: `${user.name} ${user.status === 'pending' ? '(Pending)' : ''}`
    }));

  const customSelectStyles: SelectStyles = {
    control: (base, state) => ({
      ...base,
      minHeight: '42px',
      background: 'white',
      borderRadius: '0.375rem',
      borderColor: state.isFocused ? '#6366F1' : '#D1D5DB',
      boxShadow: state.isFocused ? '0 0 0 1px #6366F1' : 'none',
      cursor: 'pointer',
      '&:hover': {
        borderColor: state.isFocused ? '#6366F1' : '#9CA3AF'
      }
    }),
    valueContainer: (base) => ({
      ...base,
      padding: '2px 8px',
    }),
    placeholder: (base) => ({
      ...base,
      color: '#6B7280',
      fontSize: '0.875rem'
    }),
    input: (base) => ({
      ...base,
      color: '#111827',
      margin: 0,
      padding: 0,
      opacity: 1,
      height: 'auto',
    }),
    indicatorSeparator: () => ({
      display: 'none'
    }),
    dropdownIndicator: (base) => ({
      ...base,
      padding: '5px 8px',
      color: '#6B7280',
      '&:hover': {
        color: '#374151'
      }
    }),
    clearIndicator: (base) => ({
      ...base,
      padding: '5px 8px',
      color: '#6B7280',
      '&:hover': {
        color: '#374151'
      }
    }),
    menu: (base) => ({
      ...base,
      marginTop: '1px',
      maxHeight: '300px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      zIndex: 50
    }),
    option: (base, state) => ({
      ...base,
      color: '#111827',
      padding: '8px 12px',
      backgroundColor: state.isFocused ? '#EEF2FF' : state.isSelected ? '#E0E7FF' : 'white',
      '&:active': {
        backgroundColor: '#C7D2FE',
      }
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: '#EEF2FF',
      border: '1px solid #C7D2FE',
      borderRadius: '0.25rem'
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: '#4338CA',
      padding: '2px 6px',
      fontSize: '0.875rem'
    }),
    multiValueRemove: (base) => ({
      ...base,
      color: '#4338CA',
      padding: '0 4px',
      '&:hover': {
        backgroundColor: '#C7D2FE',
        color: '#312E81'
      }
    })
  };

  const handleStudentChange = (selected: MultiValue<SelectOption>) => {
    const selectedEmails = selected ? selected.map(option => option.value) : [];
    setNewClass(prev => ({
      ...prev,
      studentEmails: selectedEmails,
      courseType: selectedEmails.length === 1 ? 'Individual' : selectedEmails.length === 2 ? 'Pair' : 'Group'
    }));
  };

  const handleStartTimeChange = (startTime: string) => {
    // Parse the selected start time
    const [time, period] = startTime.split(' ');
    const [hours, minutes] = time.split(':').map(Number);
    
    // Create Date objects for start and end times
    const startDate = new Date();
    startDate.setHours(period === 'PM' && hours !== 12 ? hours + 12 : hours, minutes);
    
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Add 1 hour
    
    // Format end time in 12-hour format
    const endTime = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    
    setNewClass(prev => ({
      ...prev,
      startTime,
      endTime
    }));
  };

  const handleEndTimeChange = (endTime: string) => {
    // Parse both times
    const [startTime, startPeriod] = newClass.startTime.split(' ');
    const [endTime_, endPeriod] = endTime.split(' ');
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime_.split(':').map(Number);

    // Create Date objects for comparison
    const startDate = new Date();
    const endDate = new Date();
    
    startDate.setHours(
      startPeriod === 'PM' && startHours !== 12 ? startHours + 12 : startHours,
      startMinutes
    );
    endDate.setHours(
      endPeriod === 'PM' && endHours !== 12 ? endHours + 12 : endHours,
      endMinutes
    );

    // If end time is before start time, adjust start time to be 1 hour before end time
    if (endDate <= startDate) {
      const newStartDate = new Date(endDate.getTime() - 60 * 60 * 1000);
      const newStartTime = newStartDate.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true 
      });
      
      setNewClass(prev => ({
        ...prev,
        startTime: newStartTime,
        endTime
      }));
    } else {
      setNewClass(prev => ({
        ...prev,
        endTime
      }));
    }
  };

  // Function to handle opening the edit modal
  const openEditModal = (classItem: Class) => {
    // Ensure payment config has proper structure
    const paymentConfig: PaymentConfig = {
      type: classItem.paymentConfig.type,
      startDate: classItem.paymentConfig.startDate,
      ...(classItem.paymentConfig.type === 'weekly'
        ? { weeklyInterval: classItem.paymentConfig.weeklyInterval || 1 }
        : { monthlyOption: classItem.paymentConfig.monthlyOption || 'first' }),
      paymentLink: classItem.paymentConfig.paymentLink || '',
      amount: classItem.paymentConfig.amount || 0,
      currency: classItem.paymentConfig.currency || 'BRL'
    };

    setEditingClass({
      id: classItem.id,
      dayOfWeek: classItem.dayOfWeek,
      startTime: classItem.startTime,
      endTime: classItem.endTime,
      courseType: classItem.courseType,
      notes: classItem.notes || '',
      studentEmails: classItem.studentEmails,
      startDate: classItem.startDate.toDate(),
      endDate: classItem.endDate?.toDate() || null,
      paymentConfig: paymentConfig
    });
  };

  // Function to handle saving all changes
  const handleSaveChanges = async () => {
    if (!editingClass) return;

    // Validate payment start date for monthly payments
    if (editingClass.paymentConfig.type === 'monthly') {
      const [year, month, day] = editingClass.paymentConfig.startDate.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      const dayOfMonth = date.getDate();
      const lastDayOfMonth = new Date(year, month, 0).getDate();
      
      if (dayOfMonth !== 1 && dayOfMonth !== 15 && dayOfMonth !== lastDayOfMonth) {
        toast.error("For monthly payments, start date must be the 1st, 15th, or last day of the month");
        return;
      }
    }

    try {
      // Clean up payment config to remove undefined values
      const paymentConfig = {
        type: editingClass.paymentConfig.type,
        startDate: editingClass.paymentConfig.startDate,
        ...(editingClass.paymentConfig.type === 'weekly' ? {
          weeklyInterval: editingClass.paymentConfig.weeklyInterval || 1,
          monthlyOption: null
        } : {
          weeklyInterval: null,
          monthlyOption: editingClass.paymentConfig.monthlyOption || 'first'
        }),
        paymentLink: editingClass.paymentConfig.paymentLink || '',
        amount: editingClass.paymentConfig.amount || 0,
        currency: editingClass.paymentConfig.currency || 'BRL'
      };

      const updateData = {
        dayOfWeek: editingClass.dayOfWeek,
        startTime: editingClass.startTime,
        endTime: editingClass.endTime,
        courseType: editingClass.courseType,
        notes: editingClass.notes,
        studentEmails: editingClass.studentEmails,
        startDate: Timestamp.fromDate(editingClass.startDate),
        endDate: editingClass.endDate ? Timestamp.fromDate(editingClass.endDate) : null,
        paymentConfig: paymentConfig,
        updatedAt: Timestamp.now()
      };

      await updateCachedDocument('classes', editingClass.id, updateData);
      await fetchClasses();
      setEditingClass(null);
      toast.success(t.updateSuccessful);
    } catch (error) {
      console.error('Error updating class:', error);
      toast.error(t.updateFailed);
    }
  };

  // Add these helper functions
  const adjustTime = (time: string, hourOffset: number): string => {
    const [timeStr, period] = time.split(' ');
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    const date = new Date();
    date.setHours(
      period === 'PM' && hours !== 12 ? hours + 12 : hours,
      minutes
    );
    
    // Add/subtract hours
    date.setTime(date.getTime() + hourOffset * 60 * 60 * 1000);
    
    // Format back to 12-hour format
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: true 
    }).toUpperCase();
  };

  const handleEditStartTimeChange = (startTime: string) => {
    setEditingClass(prev => {
      if (!prev) return prev;
      
      // Ensure payment config has proper structure
      const paymentConfig: PaymentConfig = {
        type: prev.paymentConfig.type,
        startDate: prev.paymentConfig.startDate,
        ...(prev.paymentConfig.type === 'weekly'
          ? { weeklyInterval: prev.paymentConfig.weeklyInterval || 1 }
          : { monthlyOption: prev.paymentConfig.monthlyOption || 'first' }),
        paymentLink: prev.paymentConfig.paymentLink || ''
      };
      
      return {
        ...prev,
        startTime,
        // Automatically set end time to be 1 hour after start time
        endTime: adjustTime(startTime, 1),
        paymentConfig
      };
    });
  };

  const handleEditEndTimeChange = (endTime: string) => {
    setEditingClass(prev => {
      if (!prev) return prev;
      
      // Ensure payment config has proper structure
      const paymentConfig: PaymentConfig = {
        type: prev.paymentConfig.type,
        startDate: prev.paymentConfig.startDate,
        ...(prev.paymentConfig.type === 'weekly'
          ? { weeklyInterval: prev.paymentConfig.weeklyInterval || 1 }
          : { monthlyOption: prev.paymentConfig.monthlyOption || 'first' }),
        paymentLink: prev.paymentConfig.paymentLink || ''
      };
      
      // Parse both times
      const [startTime, startPeriod] = prev.startTime.split(' ');
      const [endTime_, endPeriod] = endTime.split(' ');
      const [startHours, startMinutes] = startTime.split(':').map(Number);
      const [endHours, endMinutes] = endTime_.split(':').map(Number);

      // Create Date objects for comparison
      const startDate = new Date();
      const endDate = new Date();
      
      startDate.setHours(
        startPeriod === 'PM' && startHours !== 12 ? startHours + 12 : startHours,
        startMinutes
      );
      endDate.setHours(
        endPeriod === 'PM' && endHours !== 12 ? endHours + 12 : endHours,
        endMinutes
      );

      // If end time is before or equal to start time, adjust start time to be 1 hour before end time
      if (endDate <= startDate) {
        return {
          ...prev,
          startTime: adjustTime(endTime, -1),
          endTime,
          paymentConfig
        };
      }

      return {
        ...prev,
        endTime,
        paymentConfig
      };
    });
  };

  if (loading) {
    return <div className="text-center p-4">Loading...</div>;
  }

  const renderMobileCard = (classItem: Class) => (
    <div key={classItem.id} className={styles.card.container}>
      <div className="space-y-2">
        <div className="flex justify-between items-start">
          <div className="text-gray-900">
            <div className={styles.card.title}>{DAYS_OF_WEEK[classItem.dayOfWeek]}</div>
            <div className={styles.card.subtitle}>{classItem.startTime} - {classItem.endTime}</div>
            <div className="mt-2">
              <div className={styles.card.label}>{t.courseType}</div>
              <div className="text-gray-800">{classItem.courseType}</div>
            </div>
            <div className="mt-2">
              <div className={styles.card.label}>{t.students}</div>
              <div className="max-h-24 overflow-y-auto">
                {classItem.studentEmails?.map(email => {
                  const student = users.find(u => u.email === email);
                  return student ? (
                    <div key={`${classItem.id}-${email}`} className="mb-1 text-gray-800">
                      {student.name}{student.status === 'pending' ? ` (${t.pending})` : ''}
                    </div>
                  ) : (
                    <div key={`${classItem.id}-${email}`} className="mb-1 text-red-500">
                      {t.unknownEmail}: {email}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-2">
              <div className={styles.card.label}>Payment Type</div>
              <div className="text-gray-800">
                {classItem.paymentConfig?.type === 'weekly' ? 'Weekly' : 'Monthly'}
              </div>
            </div>
            <div className="mt-2">
              <div className={styles.card.label}>Payment Details</div>
              <div className="text-sm text-gray-600 mt-1">
                <span className="font-medium">Payment:</span> {classItem.paymentConfig?.type === 'weekly'
                  ? ((classItem.paymentConfig.weeklyInterval || 1) === 1
                    ? 'Weekly'
                    : `Every ${classItem.paymentConfig.weeklyInterval} weeks`)
                  : classItem.paymentConfig?.monthlyOption === 'first'
                    ? 'Monthly (1st day)'
                    : classItem.paymentConfig?.monthlyOption === 'fifteen'
                      ? 'Monthly (15th day)'
                      : 'Monthly (last day)'
                }
                {classItem.paymentConfig?.paymentLink && (
                  <div className="mt-1">
                    <a 
                      href={classItem.paymentConfig.paymentLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Payment Link
                    </a>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-2">
              <div className={styles.card.label}>Payment Amount</div>
              <div className="text-gray-800">
                {classItem.paymentConfig?.currency || 'BRL'} {classItem.paymentConfig?.amount?.toFixed(2) || '0.00'}
              </div>
            </div>
            <div className="mt-2">
              <div className={styles.card.label}>Payment Day</div>
              <div className="text-gray-800">
                {classItem.paymentConfig?.type === 'weekly'
                  ? (() => {
                      const [year, month, day] = classItem.paymentConfig.startDate.split('-').map(Number);
                      const date = new Date(year, month - 1, day);
                      return getDayName(date.getDay(), t);
                    })()
                  : classItem.paymentConfig?.monthlyOption === 'first'
                    ? '1st day of month'
                    : classItem.paymentConfig?.monthlyOption === 'fifteen'
                      ? '15th day of month'
                      : 'Last day of month'
                }
              </div>
            </div>
            <div className="mt-2">
              <div className={styles.card.label}>{t.notes}</div>
              <div className="text-gray-800">{classItem.notes || t.noNotes}</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => openEditModal(classItem)}
              className={styles.buttons.primary}
            >
              {t.edit}
            </button>
            <button
              onClick={() => handleDeleteClass(classItem.id)}
              className={styles.buttons.danger}
            >
              {t.delete}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1">
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className={styles.headings.h1}>{t.manageClasses}</h1>
          <div className="relative">
            <button
              onClick={async () => {
                if (!showAddForm) {
                  await fetchAllUsers();
                  const today = new Date();
                  setNewClass({
                    dayOfWeek: 1,
                    startTime: '09:00 AM',
                    endTime: '10:00 AM',
                    courseType: 'Individual',
                    notes: '',
                    studentEmails: [],
                    startDate: getNextDayOccurrence(1),
                    endDate: null,
                    paymentConfig: {
                      type: 'weekly',
                      weeklyInterval: 1,
                      monthlyOption: null,
                      startDate: today.toISOString().split('T')[0],
                      paymentLink: '',
                      amount: 0,
                      currency: 'BRL'
                    }
                  });
                }
                setShowAddForm(!showAddForm);
              }}
              className={classNames(
                showAddForm 
                  ? "bg-gray-200 hover:bg-gray-300 text-gray-800" 
                  : styles.buttons.primary,
                "focus:outline-none focus:ring-2 focus:ring-offset-2",
                showAddForm ? "focus:ring-gray-500" : "focus:ring-indigo-500"
              )}
            >
              {showAddForm ? (
                <span className="text-xl">&times;</span>
              ) : (
                t.addNewClass
              )}
            </button>
          </div>
        </div>

        {/* Add Class Form */}
        <Modal isOpen={showAddForm} onClose={() => setShowAddForm(false)} paddingTop="20px">
          <div className="max-w-4xl w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">{t.addNewClass}</h2>
            </div>
            <form onSubmit={handleCreateClass}>
              {/* Class Configuration Section */}
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-800 mb-3 pb-2 border-b border-gray-200">
                  {"Class Configuration"}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={styles.form.label}>{t.students}</label>
                    <Select
                      isMulti
                      value={studentOptions.filter(option => 
                        newClass.studentEmails.includes(option.value)
                      )}
                      onChange={handleStudentChange}
                      options={studentOptions}
                      className="mt-1"
                      classNamePrefix="select"
                      placeholder={t.selectStudents}
                      isClearable={true}
                      closeMenuOnSelect={false}
                      hideSelectedOptions={false}
                      styles={customSelectStyles}
                      menuPlacement="auto"
                      maxMenuHeight={300}
                    />
                  </div>
                  <div>
                    <label className={styles.form.label}>{t.courseType}</label>
                    <div className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-100 text-gray-700 px-3 py-2 sm:text-sm">
                      {newClass.courseType}
                      <span className="ml-2 text-gray-500 text-xs">
                        (auto-determined by number of students)
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className={styles.form.label}>{t.dayOfWeek}</label>
                    <select
                      value={newClass.dayOfWeek}
                      onChange={(e) => {
                        const newDayOfWeek = parseInt(e.target.value);
                        const nextOccurrence = getNextDayOccurrence(newDayOfWeek);
                        
                        // Only update the start date if the day of week has changed
                        const previousNextOccurrence = getNextDayOccurrence(newClass.dayOfWeek);
                        const shouldUpdateStartDate = 
                          newClass.startDate.getTime() === previousNextOccurrence.getTime();
                        
                        setNewClass(prev => ({ 
                          ...prev, 
                          dayOfWeek: newDayOfWeek,
                          ...(shouldUpdateStartDate ? { 
                            startDate: nextOccurrence,
                            // Reset end date if it's now before the start date
                            ...(prev.endDate && prev.endDate < nextOccurrence ? { endDate: null } : {})
                          } : {})
                        }));
                      }}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    >
                      {DAYS_OF_WEEK.map((day, index) => (
                        <option key={day} value={index}>{day}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2 flex space-x-4">
                    <div className="flex-1">
                      <label className={styles.form.label}>{t.classStartDate || "Class Start Date"}</label>
                      <DatePicker
                        selected={newClass.startDate}
                        onChange={(date: Date | null) => {
                          if (date) {
                            setNewClass(prev => ({
                              ...prev,
                              startDate: date,
                              // Reset end date if it's now before the start date
                              ...(prev.endDate && prev.endDate < date ? { endDate: null } : {})
                            }));
                          }
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        showTimeSelect={false}
                        dateFormat="MMMM d, yyyy"
                        minDate={new Date()}
                      />
                    </div>
                    <div className="flex-1">
                      <label className={styles.form.label}>{t.endDate || "Class End Date"} <span className="text-gray-500 text-xs">({t.optional})</span></label>
                      <DatePicker
                        selected={newClass.endDate}
                        onChange={(date: Date | null) => {
                          setNewClass(prev => ({
                            ...prev,
                            endDate: date
                          }));
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        showTimeSelect={false}
                        dateFormat="MMMM d, yyyy"
                        minDate={newClass.startDate}
                        isClearable={true}
                        placeholderText={t.noEndDate || "No end date"}
                      />
                    </div>
                  </div>
                  <div className="flex space-x-4 md:col-span-2">
                    <div className="flex-1">
                      <label className={styles.form.label}>{"Start Time"}</label>
                      <select
                        value={newClass.startTime}
                        onChange={(e) => handleStartTimeChange(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      >
                        {timeOptions.map(time => (
                          <option key={time} value={time}>{time}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className={styles.form.label}>{"End Time"}</label>
                      <select
                        value={newClass.endTime}
                        onChange={(e) => handleEndTimeChange(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      >
                        {timeOptions.map(time => (
                          <option key={time} value={time}>{time}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className={styles.form.label}>{t.notes}</label>
                    <textarea
                      value={newClass.notes}
                      onChange={(e) => setNewClass(prev => ({ ...prev, notes: e.target.value }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              {/* Payment Configuration Section */}
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-800 mb-3 pb-2 border-b border-gray-200">
                  {"Payment Configuration"}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={styles.form.label}>{"Payment Type"}</label>
                    <select
                      value={newClass.paymentConfig.type}
                      onChange={(e) => {
                        const type = e.target.value as 'weekly' | 'monthly';
                        setNewClass(prev => {
                          if (type === 'monthly') {
                            // If switching to monthly, adjust the start date to a valid day (1, 15, or last day)
                            const currentDate = (() => {
                              const [year, month, day] = prev.paymentConfig.startDate.split('-').map(Number);
                              const date = new Date();
                              date.setFullYear(year);
                              date.setMonth(month - 1); // Month is 0-indexed in JavaScript
                              date.setDate(day);
                              return date;
                            })();
                            
                            const day = currentDate.getDate();
                            const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
                            
                            // Determine the closest valid day (1, 15, or last day)
                            let newDay: number;
                            if (day <= 8) {
                              newDay = 1;
                            } else if (day <= 23) {
                              newDay = 15;
                            } else {
                              newDay = lastDayOfMonth;
                            }
                            
                            // Determine the corresponding monthlyOption
                            let monthlyOption: 'first' | 'fifteen' | 'last';
                            if (newDay === 1) {
                              monthlyOption = 'first';
                            } else if (newDay === 15) {
                              monthlyOption = 'fifteen';
                            } else {
                              monthlyOption = 'last';
                            }
                            
                            // Create new date string with adjusted day
                            const year = currentDate.getFullYear();
                            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                            const adjustedDateStr = `${year}-${month}-${String(newDay).padStart(2, '0')}`;
                            
                            return {
                              ...prev,
                              paymentConfig: {
                                type,
                                startDate: adjustedDateStr,
                                monthlyOption: monthlyOption,
                                weeklyInterval: null
                              }
                            };
                          }
                          
                          return {
                            ...prev,
                            paymentConfig: {
                              type,
                              startDate: prev.paymentConfig.startDate,
                              ...(type === 'weekly' 
                                ? { weeklyInterval: 1, monthlyOption: null } 
                                : { monthlyOption: 'first', weeklyInterval: null })
                            }
                          };
                        });
                      }}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className={styles.form.label}>{t.paymentStartDate || "Payment Start Date"}</label>
                    <DatePicker
                      selected={(() => {
                        // Fix: Parse the date string correctly to avoid timezone issues
                        const [year, month, day] = newClass.paymentConfig.startDate.split('-').map(Number);
                        const date = new Date();
                        date.setFullYear(year);
                        date.setMonth(month - 1); // Month is 0-indexed in JavaScript
                        date.setDate(day);
                        date.setHours(12, 0, 0, 0); // Set to noon to avoid any timezone issues
                        return date;
                      })()}
                      onChange={(date: Date | null) => {
                        if (date) {
                          // Validate date for monthly payment type
                          if (newClass.paymentConfig.type === 'monthly') {
                            const day = date.getDate();
                            const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
                            
                            // Only allow 1st, 15th, or last day of month for monthly payments
                            if (day !== 1 && day !== 15 && day !== lastDayOfMonth) {
                              toast.error("For monthly payments, start date must be the 1st, 15th, or last day of the month");
                              return;
                            }
                            
                            // Automatically set the monthlyOption based on the selected date
                            let monthlyOption: 'first' | 'fifteen' | 'last';
                            if (day === 1) {
                              monthlyOption = 'first';
                            } else if (day === 15) {
                              monthlyOption = 'fifteen';
                            } else {
                              monthlyOption = 'last';
                            }
                            
                            // Fix: Use local date string to prevent timezone issues
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const dateStr = `${year}-${month}-${String(day).padStart(2, '0')}`;
                            
                            setNewClass(prev => ({
                              ...prev,
                              paymentConfig: {
                                ...prev.paymentConfig,
                                startDate: dateStr,
                                monthlyOption: monthlyOption
                              }
                            }));
                            return;
                          }
                          
                          // For weekly payments, just update the date
                          // Fix: Use local date string to prevent timezone issues
                          const year = date.getFullYear();
                          const month = String(date.getMonth() + 1).padStart(2, '0');
                          const day = String(date.getDate()).padStart(2, '0');
                          const dateStr = `${year}-${month}-${day}`;
                          
                          setNewClass(prev => ({
                            ...prev,
                            paymentConfig: {
                              ...prev.paymentConfig,
                              startDate: dateStr
                            }
                          }));
                        }
                      }}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      showTimeSelect={false}
                      dateFormat="MMMM d, yyyy"
                      filterDate={(date) => {
                        // For monthly payments, only allow selecting 1st, 15th, or last day of month
                        if (newClass.paymentConfig.type === 'monthly') {
                          const day = date.getDate();
                          const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
                          return day === 1 || day === 15 || day === lastDayOfMonth;
                        }
                        return true; // No filter for weekly payments
                      }}
                    />
                  </div>
                  {newClass.paymentConfig.type === 'weekly' ? (
                    <div>
                      <label htmlFor="weeklyInterval" className={styles.form.label}>
                        {t.weeklyInterval || "Payment Frequency"}
                      </label>
                      <div className="flex items-center">
                        <input
                          type="number"
                          id="weeklyInterval"
                          min="1"
                          value={newClass.paymentConfig.weeklyInterval || 1}
                          onChange={(e) => setNewClass(prev => ({
                            ...prev,
                            paymentConfig: {
                              ...prev.paymentConfig,
                              weeklyInterval: parseInt(e.target.value) || 1
                            }
                          }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                        <span className="ml-2">weeks</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="monthlyOption" className={styles.form.label}>
                        {t.selectPaymentDay || "Payment Day"}
                        <span className="ml-1 text-gray-500 text-xs">
                          (auto-set)
                        </span>
                      </label>
                      <div className="relative">
                        <div className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-100 text-gray-500 px-3 py-2 sm:text-sm flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          {newClass.paymentConfig.monthlyOption === 'first' && t.firstDayMonth}
                          {newClass.paymentConfig.monthlyOption === 'fifteen' && t.fifteenthDayMonth}
                          {newClass.paymentConfig.monthlyOption === 'last' && t.lastDayMonth}
                        </div>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        Payment day is automatically set based on the selected payment start date.
                      </p>
                    </div>
                  )}
                  
                  <div>
                    <label htmlFor="paymentLink" className={styles.form.label}>
                      Payment Link
                    </label>
                    <input
                      type="url"
                      id="paymentLink"
                      value={newClass.paymentConfig.paymentLink || ''}
                      onChange={(e) => setNewClass(prev => ({
                        ...prev,
                        paymentConfig: {
                          ...prev.paymentConfig,
                          paymentLink: e.target.value
                        }
                      }))}
                      placeholder="https://payment-provider.com/your-payment-link"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Enter a URL where students can make payments
                    </p>
                  </div>
                  
                  <div>
                    <label htmlFor="paymentAmount" className={styles.form.label}>
                      Payment Amount
                    </label>
                    <input
                      type="number"
                      id="paymentAmount"
                      min="0"
                      step="0.01"
                      value={newClass.paymentConfig.amount || 0}
                      onChange={(e) => setNewClass(prev => ({
                        ...prev,
                        paymentConfig: {
                          ...prev.paymentConfig,
                          amount: parseFloat(e.target.value) || 0
                        }
                      }))}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="paymentCurrency" className={styles.form.label}>
                      Currency
                    </label>
                    <select
                      id="paymentCurrency"
                      value={newClass.paymentConfig.currency || 'BRL'}
                      onChange={(e) => setNewClass(prev => ({
                        ...prev,
                        paymentConfig: {
                          ...prev.paymentConfig,
                          currency: e.target.value
                        }
                      }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    >
                      <option value="BRL">BRL (R$)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="mr-3 px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  {t.cancel || "Cancel"}
                </button>
                <button
                  type="submit"
                  className={styles.buttons.primary}
                >
                  {t.createNewClass}
                </button>
              </div>
            </form>
          </div>
        </Modal>

        {showMobileView ? (
          <div className="space-y-4">
            {classes.map(renderMobileCard)}
          </div>
        ) : (
          <div className="bg-white shadow-md rounded-lg overflow-hidden relative">
            <div className="table-container overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className={styles.table.header}>
                      {t.dayAndTime}
                    </th>
                    <th scope="col" className={styles.table.header}>
                      {t.courseType}
                    </th>
                    <th scope="col" className={styles.table.header}>
                      {t.students}
                    </th>
                    <th scope="col" className={styles.table.header}>
                      Payment Type
                    </th>
                    <th scope="col" className={styles.table.header}>
                      Payment Amount
                    </th>
                    <th scope="col" className={styles.table.header}>
                      Payment Day
                    </th>
                    <th scope="col" className={`${styles.table.header} text-center`}>
                      {t.actions}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {classes.map((classItem) => (
                    <tr key={classItem.id}>
                      <td className={styles.table.cell}>
                        {getDayName(classItem.dayOfWeek, t)}<br />
                        {classItem.startTime} - {classItem.endTime}
                      </td>
                      <td className={styles.table.cell}>
                        {classItem.courseType}
                      </td>
                      <td className={styles.table.cell}>
                        {classItem.studentEmails.join(', ')}
                      </td>
                      <td className={styles.table.cell}>
                        {classItem.paymentConfig?.type === 'weekly'
                          ? ((classItem.paymentConfig.weeklyInterval || 1) === 1
                            ? 'Weekly'
                            : `Every ${classItem.paymentConfig.weeklyInterval} weeks`)
                          : classItem.paymentConfig?.monthlyOption === 'first'
                            ? 'Monthly (1st day)'
                            : classItem.paymentConfig?.monthlyOption === 'fifteen'
                              ? 'Monthly (15th day)'
                              : 'Monthly (last day)'
                        }
                        {classItem.paymentConfig?.paymentLink && (
                          <div className="mt-1">
                            <a 
                              href={classItem.paymentConfig.paymentLink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              Payment Link
                            </a>
                          </div>
                        )}
                      </td>
                      <td className={styles.table.cell}>
                        {classItem.paymentConfig?.currency || 'BRL'} {classItem.paymentConfig?.amount?.toFixed(2) || '0.00'}
                      </td>
                      <td className={styles.table.cell}>
                        {classItem.paymentConfig?.type === 'weekly'
                          ? (() => {
                              const [year, month, day] = classItem.paymentConfig.startDate.split('-').map(Number);
                              const date = new Date(year, month - 1, day);
                              return getDayName(date.getDay(), t);
                            })()
                          : classItem.paymentConfig?.monthlyOption === 'first'
                            ? '1st day of month'
                            : classItem.paymentConfig?.monthlyOption === 'fifteen'
                              ? '15th day of month'
                              : 'Last day of month'
                        }
                      </td>
                      <td className={`${styles.table.cell} text-center`}>
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => openEditModal(classItem)}
                            className={styles.buttons.primary}
                          >
                            {t.edit}
                          </button>
                          <button
                            onClick={() => handleDeleteClass(classItem.id)}
                            className={styles.buttons.danger}
                          >
                            {t.delete}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        <Modal isOpen={!!editingClass} onClose={() => setEditingClass(null)}>
          <div className="max-w-2xl w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className={styles.headings.h2}>{t.edit} {t.class}</h2>
            </div>

            {/* Class Configuration Section */}
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-800 mb-3 pb-2 border-b border-gray-200">
                {"Class Configuration"}
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className={styles.form.label}>{t.students}</label>
                    <Select
                      isMulti
                      value={studentOptions.filter(option => editingClass?.studentEmails.includes(option.value))}
                      onChange={(selected: MultiValue<SelectOption>) => {
                        const selectedEmails = selected ? selected.map(option => option.value) : [];
                        // Automatically determine course type based on number of students
                        const courseType = selectedEmails.length === 1 ? 'Individual' : 
                                          selectedEmails.length === 2 ? 'Pair' : 'Group';
                        setEditingClass(prev => ({ 
                          ...prev!, 
                          studentEmails: selectedEmails,
                          courseType: courseType
                        }));
                      }}
                      options={studentOptions}
                      className="mt-1"
                      classNamePrefix="select"
                      styles={customSelectStyles}
                    />
                  </div>
                </div>
                
                {/* Rest of the form content */}
                {/* ... existing code ... */}
              </div>
            </div>
            
            {/* Buttons */}
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setEditingClass(null)}
                className={styles.buttons.cancel}
              >
                {t.cancel}
              </button>
              <button
                onClick={handleSaveChanges}
                className={styles.buttons.primary}
              >
                {t.save}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}; 