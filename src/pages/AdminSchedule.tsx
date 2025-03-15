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
import { useDashboardData } from '../hooks/useDashboardData';
import { ClassSchedule } from '../types/interfaces';

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
  scheduleType: 'single' | 'multiple';  // New field to indicate schedule type
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  schedules?: ClassSchedule[];
  courseType: string;
  notes?: string;
  startDate: Timestamp;
  endDate?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  paymentConfig: PaymentConfig;
  frequency: {
    type: 'weekly' | 'biweekly' | 'custom';
    every: number; // 1 for weekly, 2 for biweekly, custom number for every X weeks
  };
}

interface SelectOption {
  value: string;
  label: string;
}

type SelectStyles = StylesConfig<SelectOption, true>;

const generateTimeOptions = () => {
  const times = [];
  // Start from 6 AM and go until 9 PM
  for (let hour = 6; hour <= 21; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const time = new Date();
      time.setHours(hour);
      time.setMinutes(minute);
      // Format consistently as "hh:mm AM/PM"
      const formattedTime = time.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true 
      });
      times.push(formattedTime);
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

export const AdminSchedule = () => {
  const { language } = useLanguage();
  const t = useTranslation(language);
  const DAYS_OF_WEEK = [t.sunday, t.monday, t.tuesday, t.wednesday, t.thursday, t.friday, t.saturday];
  const [classes, setClasses] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<any>(null);
  const [deletingClassId, setDeletingClassId] = useState<string | null>(null);
  const [newClass, setNewClass] = useState<any>({
    scheduleType: 'single',
    dayOfWeek: 1,
    startTime: timeOptions.find(time => time.includes('9:00') && time.includes('AM')) || '09:00 AM',
    endTime: timeOptions.find(time => time.includes('10:00') && time.includes('AM')) || '10:00 AM',
    schedules: [],
    courseType: 'Individual',
    notes: '',
    studentEmails: [],
    startDate: getNextDayOccurrence(1),
    endDate: null,
    paymentConfig: {
      type: 'weekly',
      weeklyInterval: 1,
      monthlyOption: null,
      startDate: new Date().toISOString().split('T')[0],
      paymentLink: '',
      amount: 0,
      currency: 'BRL'
    },
    frequency: {
      type: 'weekly',
      every: 1
    }
  });
  const [showMobileView, setShowMobileView] = useState(window.innerWidth < 768);

  const { setLoadedMonths } = useDashboardData();

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

  // Add these functions to handle schedule management
  const handleAddSchedule = () => {
    // Get the time options for 9:00 AM and 10:00 AM
    const defaultStartTime = timeOptions.find(time => time.includes('9:00') && time.includes('AM')) || '09:00 AM';
    const defaultEndTime = timeOptions.find(time => time.includes('10:00') && time.includes('AM')) || '10:00 AM';
    
    setNewClass((prev: typeof newClass) => {
      // Default to Sunday (0) if no schedules exist yet, otherwise use the next day after the last added day
      const lastDayOfWeek = prev.schedules.length > 0 
        ? prev.schedules[prev.schedules.length - 1].dayOfWeek 
        : -1;
      
      // Choose the next day that isn't already in the schedules
      let newDayOfWeek = (lastDayOfWeek + 1) % 7;
      const existingDays = prev.schedules.map((s: ClassSchedule) => s.dayOfWeek);
      
      // Find the first day that isn't already scheduled
      while (existingDays.includes(newDayOfWeek)) {
        newDayOfWeek = (newDayOfWeek + 1) % 7;
      }
      
      const newSchedule = { 
        dayOfWeek: newDayOfWeek, 
        startTime: defaultStartTime, 
        endTime: defaultEndTime 
      };
      
      const updatedSchedules = [...prev.schedules, newSchedule];
      
      // Check if the current start date's day of week is in the selected days
      const currentStartDateDay = prev.startDate.getDay();
      const selectedDays = updatedSchedules.map(schedule => schedule.dayOfWeek);
      const isCurrentStartDateValid = selectedDays.includes(currentStartDateDay);
      
      // If this is the first schedule or the current start date is not valid,
      // update the start date to the next occurrence of the new day
      if (prev.schedules.length === 0 || !isCurrentStartDateValid) {
        const nextOccurrence = getNextDayOccurrence(newDayOfWeek);
        
        return {
          ...prev,
          schedules: updatedSchedules,
          startDate: nextOccurrence,
          // Reset end date if it's now before the start date
          ...(prev.endDate && prev.endDate < nextOccurrence ? { endDate: null } : {})
        };
      }
      
      return {
        ...prev,
        schedules: updatedSchedules
      };
    });
  };

  const handleRemoveSchedule = (index: number) => {
    setNewClass((prev: typeof newClass) => {
      // Get the schedule that's being removed
      const scheduleToRemove = prev.schedules[index];
      
      // Filter out the schedule at the specified index
      const updatedSchedules = prev.schedules.filter((_: any, i: number) => i !== index);
      
      // If we're removing the last schedule, return to single day mode
      if (updatedSchedules.length === 0) {
        return {
          ...prev,
          scheduleType: 'single',
          schedules: []
        };
      }
      
      // Check if the current start date's day of week matches the day being removed
      const currentStartDateDay = prev.startDate.getDay();
      const isRemovingCurrentDay = scheduleToRemove.dayOfWeek === currentStartDateDay;
      
      // Check if the day being removed is the only instance of that day in the schedules
      const remainingDaysOfWeek = updatedSchedules.map((s: ClassSchedule) => s.dayOfWeek);
      const dayStillExists = remainingDaysOfWeek.includes(currentStartDateDay);
      
      // If we're removing the day that matches the current start date and it doesn't exist in other schedules
      if (isRemovingCurrentDay && !dayStillExists && updatedSchedules.length > 0) {
        // Update the start date to the next occurrence of the first remaining day
        const nextOccurrence = getNextDayOccurrence(updatedSchedules[0].dayOfWeek);
        
        return {
          ...prev,
          schedules: updatedSchedules,
          startDate: nextOccurrence,
          // Reset end date if it's now before the start date
          ...(prev.endDate && prev.endDate < nextOccurrence ? { endDate: null } : {})
        };
      }
      
      return {
        ...prev,
        schedules: updatedSchedules
      };
    });
  };

  const handleScheduleChange = (index: number, field: keyof ClassSchedule, value: string | number) => {
    setNewClass((prev: typeof newClass) => {
      const updatedSchedules = [...prev.schedules];
      updatedSchedules[index] = {
        ...updatedSchedules[index],
        [field]: value
      };
      
      // If changing day of week, update start/end times if needed
      if (field === 'dayOfWeek') {
        // When day of week is changed, we need to update the start date if it's currently
        // set to a day that doesn't match any of the schedules
        const newDayOfWeek = value as number;
        
        // Get all selected days of week from schedules (including the newly updated one)
        const selectedDays = updatedSchedules.map(schedule => schedule.dayOfWeek);
        
        // Check if the current start date's day of week is in the selected days
        const currentStartDateDay = prev.startDate.getDay();
        const isCurrentStartDateValid = selectedDays.includes(currentStartDateDay);
        
        // If the current start date is not valid anymore, update it to the next occurrence of the new day
        if (!isCurrentStartDateValid) {
          const nextOccurrence = getNextDayOccurrence(newDayOfWeek);
          
          return {
            ...prev,
            schedules: updatedSchedules,
            startDate: nextOccurrence,
            // Reset end date if it's now before the start date
            ...(prev.endDate && prev.endDate < nextOccurrence ? { endDate: null } : {})
          };
        }
      } else if (field === 'startTime') {
        // Parse the selected start time
        const [time, period] = value.toString().split(' ');
        const [hours, minutes] = time.split(':').map(Number);
        
        // Create Date objects for start and end times
        const startDate = new Date();
        startDate.setHours(period === 'PM' && hours !== 12 ? hours + 12 : (period === 'AM' && hours === 12 ? 0 : hours), minutes);
        
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Add 1 hour
        
        // Format end time in 12-hour format
        const endTime = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        
        updatedSchedules[index].endTime = endTime;
      } else if (field === 'endTime') {
        // Parse both times
        const [startTime, startPeriod] = updatedSchedules[index].startTime.split(' ');
        const [endTime, endPeriod] = value.toString().split(' ');
        const [startHours, startMinutes] = startTime.split(':').map(Number);
        const [endHours, endMinutes] = endTime.split(':').map(Number);

        // Create Date objects for comparison
        const startDate = new Date();
        const endDate = new Date();
        
        startDate.setHours(
          startPeriod === 'PM' && startHours !== 12 ? startHours + 12 : (startPeriod === 'AM' && startHours === 12 ? 0 : startHours),
          startMinutes
        );
        endDate.setHours(
          endPeriod === 'PM' && endHours !== 12 ? endHours + 12 : (endPeriod === 'AM' && endHours === 12 ? 0 : endHours),
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
          
          updatedSchedules[index].startTime = newStartTime;
        }
      }
      
      return {
        ...prev,
        schedules: updatedSchedules
      };
    });
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate that at least one student is selected
    if (newClass.studentEmails.length === 0) {
      toast.error("Please select at least one student for the class");
      return;
    }
    
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
    
    // Validate that multiple schedule has at least one schedule
    if (newClass.scheduleType === 'multiple' && newClass.schedules.length === 0) {
      toast.error("Please add at least one schedule for multiple day classes");
      return;
    }
    
    setIsCreating(true);
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
        scheduleType: newClass.scheduleType,
        dayOfWeek: newClass.dayOfWeek,
        startTime: newClass.startTime,
        endTime: newClass.endTime,
        schedules: newClass.scheduleType === 'multiple' ? newClass.schedules : [],
        courseType: newClass.courseType,
        notes: newClass.notes,
        studentEmails: studentEmails,
        startDate: Timestamp.fromDate(newClass.startDate),
        ...(newClass.endDate ? { endDate: Timestamp.fromDate(newClass.endDate) } : {}),
        createdAt: now,
        updatedAt: now,
        paymentConfig,
        frequency: newClass.frequency
      };

      // Generate a unique ID for the new class
      const classId = Date.now().toString();
      await setCachedDocument('classes', classId, classData);
      
      await fetchClasses();
      setIsModalOpen(false);
      const today = new Date();
      
      // Ensure the payment start date is valid for monthly payments
      let paymentStartDate = today.toISOString().split('T')[0];
      const paymentType = 'weekly'; // Default to weekly when resetting
      
      setNewClass({
        scheduleType: 'single',
        dayOfWeek: 1,
        startTime: '09:00 AM',
        endTime: '10:00 AM',
        schedules: [],
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
        },
        frequency: {
          type: 'weekly',
          every: 1
        }
      });
      toast.success('Class created successfully');
    } catch (error) {
      console.error('Error creating class:', error);
      toast.error('Failed to create class');
    } finally {
      setIsCreating(false);
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

    setDeletingClassId(classId);
    try {
      await deleteCachedDocument('classes', classId);
      // Clear the loaded months cache to force a fresh fetch
      setLoadedMonths(new Set());
      await fetchClasses();
      toast.success('Class deleted successfully');
    } catch (error) {
      console.error('Error deleting class:', error);
      toast.error('Failed to delete class');
    } finally {
      setDeletingClassId(null);
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
    setNewClass((prev: typeof newClass) => ({
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
    startDate.setHours(period === 'PM' && hours !== 12 ? hours + 12 : (period === 'AM' && hours === 12 ? 0 : hours), minutes);
    
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Add 1 hour
    
    // Format end time in 12-hour format
    const endTime = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    
    setNewClass((prev: typeof newClass) => ({
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
      startPeriod === 'PM' && startHours !== 12 ? startHours + 12 : (startPeriod === 'AM' && startHours === 12 ? 0 : startHours),
      startMinutes
    );
    endDate.setHours(
      endPeriod === 'PM' && endHours !== 12 ? endHours + 12 : (endPeriod === 'AM' && endHours === 12 ? 0 : endHours),
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
      
      setNewClass((prev: typeof newClass) => ({
        ...prev,
        startTime: newStartTime,
        endTime: endTime
      }));
    } else {
      setNewClass((prev: typeof newClass) => ({
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

    // Ensure frequency has proper structure (for backward compatibility)
    const frequency = classItem.frequency || {
      type: 'weekly',
      every: 1
    };

    setEditingClass({
      id: classItem.id,
      scheduleType: classItem.scheduleType || 'single', // Default to single for backward compatibility
      dayOfWeek: classItem.dayOfWeek,
      startTime: classItem.startTime,
      endTime: classItem.endTime,
      schedules: classItem.schedules || [],
      courseType: classItem.courseType,
      notes: classItem.notes || '',
      studentEmails: classItem.studentEmails,
      startDate: classItem.startDate.toDate(),
      endDate: classItem.endDate?.toDate() || null,
      paymentConfig: paymentConfig,
      frequency: frequency
    });
  };

  // Function to handle saving all changes
  const handleSaveChanges = async () => {
    if (!editingClass) return;

    // Validate that at least one student is selected
    if (editingClass.studentEmails.length === 0) {
      toast.error("Please select at least one student for the class");
      return;
    }

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
    
    // Validate that multiple schedule has at least one schedule
    if (editingClass.scheduleType === 'multiple' && editingClass.schedules.length === 0) {
      toast.error("Please add at least one schedule for multiple day classes");
      return;
    }

    setIsSaving(true);
    try {
      // Clean up payment config to remove undefined values
      const paymentConfig = {
        type: editingClass.paymentConfig.type || 'weekly',
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

      // Ensure frequency has proper structure
      const frequency = {
        type: editingClass.frequency?.type || 'weekly',
        every: editingClass.frequency?.every || 1
      };

      const updateData = {
        scheduleType: editingClass.scheduleType || 'single',
        dayOfWeek: editingClass.scheduleType === 'single' ? editingClass.dayOfWeek : 0,
        startTime: editingClass.scheduleType === 'single' ? editingClass.startTime : '',
        endTime: editingClass.scheduleType === 'single' ? editingClass.endTime : '',
        schedules: editingClass.scheduleType === 'multiple' ? editingClass.schedules.map((schedule: ClassSchedule) => {
          const s: Partial<Class> = {
            dayOfWeek: schedule.dayOfWeek,
            startTime: schedule.startTime,
            endTime: schedule.endTime
          };
          return s;
        }) : [],
        courseType: editingClass.courseType || 'Individual',
        notes: editingClass.notes || '',
        studentEmails: editingClass.studentEmails || [],
        startDate: Timestamp.fromDate(editingClass.startDate),
        endDate: editingClass.endDate ? Timestamp.fromDate(editingClass.endDate) : null,
        paymentConfig: paymentConfig,
        updatedAt: Timestamp.now(),
        frequency: frequency
      };

      await updateCachedDocument('classes', editingClass.id, updateData);
      await fetchClasses();
      setEditingClass(null);
      toast.success(t.updateSuccessful);
    } catch (error) {
      console.error('Error updating class:', error);
      toast.error(t.updateFailed);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center p-4">Loading...</div>;
  }

  const renderMobileCard = (classItem: Class) => (
    <div key={classItem.id} className={styles.card.container}>
      <div className="space-y-2">
        <div className="flex justify-between items-start">
          <div className="text-gray-900">
            <div className={styles.card.title}>
              {classItem.scheduleType === 'multiple' ? 'Multiple Days Schedule' : DAYS_OF_WEEK[classItem.dayOfWeek]}
            </div>
            {classItem.scheduleType === 'single' ? (
            <div className={styles.card.subtitle}>{classItem.startTime} - {classItem.endTime}</div>
            ) : (
              <div className="mt-2">
                <div className={styles.card.label}>Schedule</div>
                <div className="text-gray-800">
                  {classItem.schedules && classItem.schedules.length > 0 ? (
                    <div className="space-y-1">
                      {classItem.schedules.map((schedule, index) => (
                        <div key={index} className="flex items-center text-sm">
                          <span className="font-medium mr-2">{DAYS_OF_WEEK[schedule.dayOfWeek]}:</span>
                          <span>{schedule.startTime} - {schedule.endTime}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-500 italic">No schedule details available</div>
                  )}
                </div>
              </div>
            )}
            <div className="mt-2">
              <div className={styles.card.label}>Frequency</div>
              <div className="text-gray-800">
                {classItem.frequency?.type === 'weekly' ? 'Weekly' : 
                 classItem.frequency?.type === 'biweekly' ? 'Every 2 weeks' : 
                 `Every ${classItem.frequency?.every || 1} weeks`}
              </div>
            </div>
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
              disabled={deletingClassId === classItem.id}
              className={`${styles.buttons.danger} ${deletingClassId === classItem.id ? 'opacity-80' : ''} flex items-center justify-center`}
            >
              {deletingClassId === classItem.id ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {"Deleting..."}
                </>
              ) : (
                t.delete
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Add these functions to handle schedule management for editing
  const handleAddScheduleToEdit = () => {
    if (!editingClass) return;
    
    // Get the time options for 9:00 AM and 10:00 AM
    const defaultStartTime = timeOptions.find(time => time.includes('9:00') && time.includes('AM')) || '09:00 AM';
    const defaultEndTime = timeOptions.find(time => time.includes('10:00') && time.includes('AM')) || '10:00 AM';
    
    setEditingClass((prev: any) => {
      // Default to Sunday (0) if no schedules exist yet, otherwise use the next day after the last added day
      const lastDayOfWeek = prev.schedules.length > 0 
        ? prev.schedules[prev.schedules.length - 1].dayOfWeek 
        : -1;
      
      // Choose the next day that isn't already in the schedules
      let newDayOfWeek = (lastDayOfWeek + 1) % 7;
      const existingDays = prev.schedules.map((s: ClassSchedule) => s.dayOfWeek);
      
      // Find the first day that isn't already scheduled
      while (existingDays.includes(newDayOfWeek)) {
        newDayOfWeek = (newDayOfWeek + 1) % 7;
      }
      
      const newSchedule = { 
        dayOfWeek: newDayOfWeek, 
        startTime: defaultStartTime, 
        endTime: defaultEndTime 
      };
      
      const updatedSchedules = [...prev.schedules, newSchedule];
      
      // Check if the current start date's day of week is in the selected days
      const currentStartDate = prev.startDate instanceof Timestamp 
        ? prev.startDate.toDate() 
        : prev.startDate;
      const currentStartDateDay = currentStartDate.getDay();
      const selectedDays = updatedSchedules.map(schedule => schedule.dayOfWeek);
      const isCurrentStartDateValid = selectedDays.includes(currentStartDateDay);
      
      // If this is the first schedule or the current start date is not valid,
      // update the start date to the next occurrence of the new day
      if (prev.schedules.length === 0 || !isCurrentStartDateValid) {
        const nextOccurrence = getNextDayOccurrence(newDayOfWeek);
        
        return {
          ...prev,
          schedules: updatedSchedules,
          startDate: nextOccurrence,
          // Reset end date if it's now before the start date
          ...(prev.endDate && 
             (prev.endDate instanceof Timestamp 
              ? prev.endDate.toDate() < nextOccurrence 
              : prev.endDate < nextOccurrence) 
             ? { endDate: null } : {})
        };
      }
      
      return {
        ...prev,
        schedules: updatedSchedules
      };
    });
  };

  const handleRemoveScheduleFromEdit = (index: number) => {
    if (!editingClass) return;
    
    setEditingClass((prev: any) => {
      // Get the schedule that's being removed
      const scheduleToRemove = prev.schedules[index];
      
      // Filter out the schedule at the specified index
      const updatedSchedules = prev.schedules.filter((_: any, i: number) => i !== index);
      
      // If we're removing the last schedule, return to single day mode
      if (updatedSchedules.length === 0) {
        return {
          ...prev,
          scheduleType: 'single',
          schedules: []
        };
      }
      
      // Check if the current start date's day of week matches the day being removed
      const currentStartDate = prev.startDate instanceof Timestamp 
        ? prev.startDate.toDate() 
        : prev.startDate;
      const currentStartDateDay = currentStartDate.getDay();
      const isRemovingCurrentDay = scheduleToRemove.dayOfWeek === currentStartDateDay;
      
      // Check if the day being removed is the only instance of that day in the schedules
      const remainingDaysOfWeek = updatedSchedules.map((s: ClassSchedule) => s.dayOfWeek);
      const dayStillExists = remainingDaysOfWeek.includes(currentStartDateDay);
      
      // If we're removing the day that matches the current start date and it doesn't exist in other schedules
      if (isRemovingCurrentDay && !dayStillExists && updatedSchedules.length > 0) {
        // Update the start date to the next occurrence of the first remaining day
        const nextOccurrence = getNextDayOccurrence(updatedSchedules[0].dayOfWeek);
        
        return {
          ...prev,
          schedules: updatedSchedules,
          startDate: nextOccurrence,
          // Reset end date if it's now before the start date
          ...(prev.endDate && 
             (prev.endDate instanceof Timestamp 
              ? prev.endDate.toDate() < nextOccurrence 
              : prev.endDate < nextOccurrence) 
             ? { endDate: null } : {})
        };
      }
      
      return {
        ...prev,
        schedules: updatedSchedules
      };
    });
  };

  const handleEditScheduleChange = (index: number, field: keyof ClassSchedule, value: string | number) => {
    if (!editingClass) return;
    
    setEditingClass((prev: any) => {
      const updatedSchedules = [...prev.schedules];
      updatedSchedules[index] = {
        ...updatedSchedules[index],
        [field]: value
      };
      
      // If changing day of week, update start date if needed
      if (field === 'dayOfWeek') {
        // When day of week is changed, we need to update the start date if it's currently
        // set to a day that doesn't match any of the schedules
        const newDayOfWeek = value as number;
        
        // Get all selected days of week from schedules (including the newly updated one)
        const selectedDays = updatedSchedules.map(schedule => schedule.dayOfWeek);
        
        // Check if the current start date's day of week is in the selected days
        const currentStartDate = prev.startDate instanceof Timestamp 
          ? prev.startDate.toDate() 
          : prev.startDate;
        const currentStartDateDay = currentStartDate.getDay();
        const isCurrentStartDateValid = selectedDays.includes(currentStartDateDay);
        
        // If the current start date is not valid anymore, update it to the next occurrence of the new day
        if (!isCurrentStartDateValid) {
          const nextOccurrence = getNextDayOccurrence(newDayOfWeek);
          
          return {
            ...prev,
            schedules: updatedSchedules,
            startDate: nextOccurrence,
            // Reset end date if it's now before the start date
            ...(prev.endDate && 
               (prev.endDate instanceof Timestamp 
                ? prev.endDate.toDate() < nextOccurrence 
                : prev.endDate < nextOccurrence) 
               ? { endDate: null } : {})
          };
        }
      } else if (field === 'startTime') {
        // Parse the selected start time
        const [startTimeStr, startPeriod] = value.toString().split(' ');
        const [startHours, startMinutes] = startTimeStr.split(':').map(Number);
        
        // Create Date objects for start and end times
        const startDate = new Date();
        startDate.setHours(startPeriod === 'PM' && startHours !== 12 ? startHours + 12 : (startPeriod === 'AM' && startHours === 12 ? 0 : startHours), startMinutes);
        
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Add 1 hour
        
        // Format end time in 12-hour format
        const endTime = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        
        updatedSchedules[index].endTime = endTime;
      } else if (field === 'endTime') {
        // Parse both times
        const [startTimeStr, startPeriod] = updatedSchedules[index].startTime.split(' ');
        const [endTimeStr, endPeriod] = value.toString().split(' ');
        const [startHours, startMinutes] = startTimeStr.split(':').map(Number);
        const [endHours, endMinutes] = endTimeStr.split(':').map(Number);

        // Create Date objects for comparison
        const startDate = new Date();
        const endDate = new Date();
        
        startDate.setHours(
          startPeriod === 'PM' && startHours !== 12 ? startHours + 12 : (startPeriod === 'AM' && startHours === 12 ? 0 : startHours),
          startMinutes
        );
        endDate.setHours(
          endPeriod === 'PM' && endHours !== 12 ? endHours + 12 : (endPeriod === 'AM' && endHours === 12 ? 0 : endHours),
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
          
          updatedSchedules[index].startTime = newStartTime;
        }
      }
      
      return {
        ...prev,
        schedules: updatedSchedules
      };
    });
  };

  return (
    <div className="flex-1">
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className={styles.headings.h1}>{t.manageClasses}</h1>
          <div className="relative">
            <button
              onClick={async () => {
                if (!isModalOpen) {
                  await fetchAllUsers();
                  const today = new Date();
                  setNewClass({
                    scheduleType: 'single',
                    dayOfWeek: 1,
                    startTime: '09:00 AM',
                    endTime: '10:00 AM',
                    schedules: [],
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
                    },
                    frequency: {
                      type: 'weekly',
                      every: 1
                    }
                  });
                }
                setIsModalOpen(!isModalOpen);
              }}
              className={classNames(
                isModalOpen 
                  ? "bg-gray-200 hover:bg-gray-300 text-gray-800" 
                  : styles.buttons.primary,
                "focus:outline-none focus:ring-2 focus:ring-offset-2",
                isModalOpen ? "focus:ring-gray-500" : "focus:ring-indigo-500"
              )}
            >
              {isModalOpen ? (
                <span className="text-xl">&times;</span>
              ) : (
                t.addNewClass
              )}
            </button>
          </div>
        </div>

        {/* Add Class Form */}
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} paddingTop="20px">
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
                    <label className={styles.form.label}>
                      {t.students}
                    </label>
                    <Select
                      isMulti
                      value={studentOptions.filter(option => 
                        newClass.studentEmails.includes(option.value)
                      )}
                      onChange={handleStudentChange}
                      options={studentOptions}
                      className="mt-1"
                      classNamePrefix="select"
                      styles={customSelectStyles}
                    />
                  </div>
                  
                  {/* Add frequency selection here */}
                  <div>
                    <label className={styles.form.label}>Class Frequency</label>
                    <div className="space-y-2">
                      <select
                        value={newClass.frequency.type}
                        onChange={(e) => {
                          const type = e.target.value as 'weekly' | 'biweekly' | 'custom';
                          setNewClass((prev: typeof newClass) => ({
                            ...prev,
                            frequency: {
                              type,
                              every: type === 'weekly' ? 1 : type === 'biweekly' ? 2 : prev.frequency.every
                            }
                          }));
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      >
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Every 2 weeks</option>
                        <option value="custom">Custom</option>
                      </select>
                      
                      {newClass.frequency.type === 'custom' && (
                        <div className="flex items-center mt-1">
                          <span className="text-gray-800 mr-2">Every</span>
                          <input
                            type="number"
                            min="1"
                            value={newClass.frequency.every}
                            onChange={(e) => {
                              const every = parseInt(e.target.value) || 1;
                              setNewClass((prev: typeof newClass) => ({
                                ...prev,
                                frequency: {
                                  ...prev.frequency,
                                  every: Math.max(1, every)
                                }
                              }));
                            }}
                            className="block w-20 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          />
                          <span className="text-gray-800 ml-2">weeks</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="md:col-span-2 mb-4">
                    <label className={styles.form.label}>Schedule Type</label>
                    <div className="flex items-center space-x-4 mt-2">
                      <label className="inline-flex items-center">
                        <input
                          type="radio"
                          className="form-radio h-4 w-4 text-indigo-600"
                          checked={newClass.scheduleType === 'single'}
                          onChange={() => setNewClass((prev: typeof newClass) => ({
                            ...prev,
                            scheduleType: 'single'
                          }))}
                        />
                        <span className="ml-2 text-gray-800">Single Day</span>
                      </label>
                      <label className="inline-flex items-center">
                        <input
                          type="radio"
                          className="form-radio h-4 w-4 text-indigo-600"
                          checked={newClass.scheduleType === 'multiple'}
                          onChange={() => {
                            // If switching to multiple and no schedules yet, add the current day/time as first schedule
                            const initialSchedules: ClassSchedule[] = [];
                            if (newClass.scheduleType === 'single') {
                              initialSchedules.push({
                                dayOfWeek: newClass.dayOfWeek,
                                startTime: newClass.startTime,
                                endTime: newClass.endTime
                              });
                            }
                            
                            setNewClass((prev: typeof newClass) => ({
                              ...prev,
                              scheduleType: 'multiple',
                              schedules: prev.schedules.length > 0 ? prev.schedules : initialSchedules
                            }));
                          }}
                        />
                        <span className="ml-2 text-gray-800">Multiple Days</span>
                      </label>
                    </div>
                  </div>
                  {newClass.scheduleType === 'single' ? (
                    <>
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
                        
                        setNewClass((prev: typeof newClass) => ({ 
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
                    </>
                  ) : (
                    <div className="md:col-span-2">
                      <div className="flex justify-between items-center mb-2">
                        <label className={styles.form.label}>Class Schedule</label>
                        <button
                          type="button"
                          onClick={handleAddSchedule}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          Add Day
                        </button>
                      </div>
                      
                      {newClass.schedules.length === 0 ? (
                        <div className="text-center py-4 text-gray-500 border border-dashed border-gray-300 rounded-md">
                          No schedules added. Click "Add Day" to add a class day.
                        </div>
                      ) : (
                        <div className="space-y-4 mt-2">
                          {newClass.schedules.map((schedule: ClassSchedule, index: number) => (
                            <div key={index} className="p-4 border border-gray-200 rounded-md bg-gray-50">
                              <div className="flex justify-between items-center mb-3">
                                <h4 className="text-sm font-medium text-gray-700">Day {index + 1}</h4>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSchedule(index)}
                                  className="text-red-600 hover:text-red-800 bg-transparent"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              </div>
                              <div className="grid grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700">Day</label>
                                  <select
                                    value={schedule.dayOfWeek}
                                    onChange={(e) => handleScheduleChange(index, 'dayOfWeek', parseInt(e.target.value))}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                  >
                                    {DAYS_OF_WEEK.map((day, dayIndex) => (
                                      <option key={day} value={dayIndex}>{day}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700">Start Time</label>
                                  <select
                                    value={schedule.startTime}
                                    onChange={(e) => handleScheduleChange(index, 'startTime', e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                  >
                                    {timeOptions.map(time => (
                                      <option key={time} value={time}>{time}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700">End Time</label>
                                  <select
                                    value={schedule.endTime}
                                    onChange={(e) => handleScheduleChange(index, 'endTime', e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                  >
                                    {timeOptions.map(time => (
                                      <option key={time} value={time}>{time}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="md:col-span-2 flex space-x-4">
                    <div className="flex-1">
                      <label className={styles.form.label}>{t.classStartDate || "Class Start Date"}</label>
                      <DatePicker
                        selected={newClass.startDate}
                        onChange={(date: Date | null) => {
                          if (date) {
                            setNewClass((prev: typeof newClass) => ({
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
                        filterDate={(date) => {
                          // For single schedule, only allow selecting dates that match the selected day of week
                          if (newClass.scheduleType === 'single') {
                            return date.getDay() === newClass.dayOfWeek;
                          }
                          
                          // For multiple schedules, only allow selecting dates that match any of the selected days
                          if (newClass.scheduleType === 'multiple' && newClass.schedules.length > 0) {
                            const selectedDays = newClass.schedules.map((schedule: ClassSchedule) => schedule.dayOfWeek);
                            return selectedDays.includes(date.getDay());
                          }
                          
                          return true; // Allow all dates if no schedules defined yet
                        }}
                      />
                      {newClass.scheduleType === 'multiple' && newClass.schedules.length > 0 && (
                        <p className="mt-1 text-xs text-gray-500">
                          Only {newClass.schedules.map((s: ClassSchedule) => DAYS_OF_WEEK[s.dayOfWeek]).join(', ')} dates can be selected
                        </p>
                      )}
                      {newClass.scheduleType === 'single' && (
                        <p className="mt-1 text-xs text-gray-500">
                          Only {DAYS_OF_WEEK[newClass.dayOfWeek]} dates can be selected
                        </p>
                      )}
                    </div>
                    <div className="flex-1">
                      <label className={styles.form.label}>{t.endDate || "Class End Date"} <span className="text-gray-500 text-xs">({t.optional})</span></label>
                      <DatePicker
                        selected={newClass.endDate}
                        onChange={(date: Date | null) => {
                          setNewClass((prev: typeof newClass) => ({
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
                  <div className="md:col-span-2">
                    <label className={styles.form.label}>{t.notes}</label>
                    <textarea
                      value={newClass.notes}
                      onChange={(e) => setNewClass((prev: typeof newClass) => ({ ...prev, notes: e.target.value }))}
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
                        setNewClass((prev: typeof newClass) => {
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
                            
                            setNewClass((prev: typeof newClass) => ({
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
                          
                          setNewClass((prev: typeof newClass) => ({
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
                          onChange={(e) => setNewClass((prev: typeof newClass) => ({
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
                      onChange={(e) => setNewClass((prev: typeof newClass) => ({
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
                      onChange={(e) => setNewClass((prev: typeof newClass) => ({
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
                      onChange={(e) => setNewClass((prev: typeof newClass) => ({
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
                  onClick={() => setIsModalOpen(false)}
                  disabled={isCreating}
                  className={`mr-3 px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${isCreating ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {t.cancel || "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className={`${styles.buttons.primary} ${isCreating ? 'opacity-80' : ''} flex items-center justify-center`}
                >
                  {isCreating ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {"Creating..."}
                    </>
                  ) : (
                    t.createNewClass
                  )}
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
            <div className="hidden md:flex justify-end mb-2">
              <div className="text-sm text-gray-500 flex items-center pr-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Scroll horizontally to see all columns
              </div>
            </div>
            <div className="relative">
              {/* Left fade indicator */}
              <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none hidden md:block"></div>
              
              <div className="table-container overflow-x-auto overflow-y-auto max-h-[600px] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-400 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-gray-500">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th scope="col" className={styles.table.header}>
                        {t.dayAndTime}
                      </th>
                      <th scope="col" className={styles.table.header}>
                        {t.courseType}
                      </th>
                      <th scope="col" className={styles.table.header}>
                        Frequency
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
                          {classItem.scheduleType === 'single' ? (
                            <>
                          {getDayName(classItem.dayOfWeek, t)}<br />
                          {classItem.startTime} - {classItem.endTime}
                            </>
                          ) : (
                            <div className="max-h-32 overflow-y-auto">
                              <div className="font-medium mb-1">Multiple Days:</div>
                              {classItem.schedules && classItem.schedules.length > 0 ? (
                                <div className="space-y-1">
                                  {classItem.schedules.map((schedule: ClassSchedule, index: number) => (
                                    <div key={index} className="text-sm">
                                      <span className="font-medium">{DAYS_OF_WEEK[schedule.dayOfWeek]}:</span>{' '}
                                      {schedule.startTime} - {schedule.endTime}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-gray-500 italic">No schedule details</div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className={styles.table.cell}>
                          {classItem.courseType}
                        </td>
                        <td className={styles.table.cell}>
                          {classItem.frequency?.type === 'weekly' ? 'Weekly' : 
                           classItem.frequency?.type === 'biweekly' ? 'Every 2 weeks' : 
                           `Every ${classItem.frequency?.every || 1} weeks`}
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
                              disabled={deletingClassId === classItem.id}
                              className={`${styles.buttons.danger} ${deletingClassId === classItem.id ? 'opacity-80' : ''} flex items-center justify-center`}
                            >
                              {deletingClassId === classItem.id ? (
                                <>
                                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  {"Deleting..."}
                                </>
                              ) : (
                                t.delete
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                    <label className={styles.form.label}>
                      {t.students}
                    </label>
                    <Select
                      isMulti
                      value={studentOptions.filter(option => editingClass?.studentEmails.includes(option.value))}
                      onChange={(selected: MultiValue<SelectOption>) => {
                        const selectedEmails = selected ? selected.map(option => option.value) : [];
                        const courseType = selectedEmails.length === 1 ? 'Individual' : 
                                          selectedEmails.length === 2 ? 'Pair' : 'Group';
                        setEditingClass((prev: any) => ({ 
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
                  
                  {/* Add frequency selection here */}
                  <div className="md:col-span-2">
                    <label className={styles.form.label}>Class Frequency</label>
                    <div className="flex items-center space-x-4">
                      <select
                        value={editingClass?.frequency?.type || 'weekly'}
                        onChange={(e) => {
                          if (!editingClass) return;
                          const type = e.target.value as 'weekly' | 'biweekly' | 'custom';
                          setEditingClass((prev: any) => ({
                            ...prev,
                            frequency: {
                              type,
                              every: type === 'weekly' ? 1 : type === 'biweekly' ? 2 : editingClass.frequency?.every || 3
                            }
                          }));
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      >
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Every 2 weeks</option>
                        <option value="custom">Custom</option>
                      </select>
                      
                      {editingClass?.frequency?.type === 'custom' && (
                        <div className="flex items-center mt-1">
                          <span className="text-gray-800 mr-2">Every</span>
                          <input
                            type="number"
                            min="1"
                            value={editingClass?.frequency?.every || 3}
                            onChange={(e) => {
                              if (!editingClass) return;
                              const every = parseInt(e.target.value) || 1;
                              setEditingClass((prev: any) => ({
                                ...prev,
                                frequency: {
                                  ...editingClass.frequency,
                                  every: Math.max(1, every)
                                }
                              }));
                            }}
                            className="block w-20 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          />
                          <span className="text-gray-800 ml-2">weeks</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Schedule Type Selection */}
                <div className="md:col-span-2 mb-4">
                  <label className={styles.form.label}>Schedule Type</label>
                  <div className="flex items-center space-x-4 mt-2">
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        className="form-radio h-4 w-4 text-indigo-600"
                        checked={editingClass?.scheduleType === 'single'}
                        onChange={() => {
                          if (!editingClass) return;
                          setEditingClass((prev: any) => ({
                            ...prev,
                            scheduleType: 'single'
                          }));
                        }}
                      />
                      <span className="ml-2 text-gray-800">Single Day</span>
                    </label>
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        className="form-radio h-4 w-4 text-indigo-600"
                        checked={editingClass?.scheduleType === 'multiple'}
                        onChange={() => {
                          if (!editingClass) return;
                          
                          // If switching to multiple and no schedules yet, add the current day/time as first schedule
                          const initialSchedules: ClassSchedule[] = [];
                          if (editingClass.scheduleType === 'single' && editingClass.schedules.length === 0) {
                            initialSchedules.push({
                              dayOfWeek: editingClass.dayOfWeek,
                              startTime: editingClass.startTime,
                              endTime: editingClass.endTime
                            });
                          }
                          
                          setEditingClass((prev: any) => ({
                            ...prev,
                            scheduleType: 'multiple',
                            schedules: editingClass.schedules.length > 0 ? editingClass.schedules : initialSchedules
                          }));
                        }}
                      />
                      <span className="ml-2 text-gray-800">Multiple Days</span>
                    </label>
                  </div>
                </div>
                
                {/* Schedule Configuration based on type */}
                {editingClass?.scheduleType === 'single' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={styles.form.label}>{t.dayOfWeek}</label>
                      <select
                        value={editingClass?.dayOfWeek}
                        onChange={(e) => {
                          if (!editingClass) return;
                          setEditingClass((prev: any) => ({
                            ...prev,
                            dayOfWeek: parseInt(e.target.value)
                          }));
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      >
                        {DAYS_OF_WEEK.map((day, index) => (
                          <option key={day} value={index}>{day}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex space-x-4 md:col-span-2">
                      <div className="flex-1">
                        <label className={styles.form.label}>{"Start Time"}</label>
                        <select
                          value={editingClass?.startTime}
                          onChange={(e) => {
                            if (!editingClass) return;
                            
                            // Parse the selected start time
                            const startTime = e.target.value;
                            const [time, period] = startTime.split(' ');
                            const [hours, minutes] = time.split(':').map(Number);
                            
                            // Create Date objects for start and end times
                            const startDate = new Date();
                            startDate.setHours(period === 'PM' && hours !== 12 ? hours + 12 : (period === 'AM' && hours === 12 ? 0 : hours), minutes);
                            
                            const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Add 1 hour
                            
                            // Format end time in 12-hour format
                            const endTime = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                            
                            setEditingClass((prev: any) => ({
                              ...prev,
                              startTime,
                              endTime
                            }));
                          }}
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
                          value={editingClass?.endTime}
                          onChange={(e) => {
                            if (!editingClass) return;
                            
                            // Parse both times
                            const [startTime, startPeriod] = editingClass.startTime.split(' ');
                            const [endTime, endPeriod] = e.target.value.split(' ');
                            const [startHours, startMinutes] = startTime.split(':').map(Number);
                            const [endHours, endMinutes] = endTime.split(':').map(Number);

                            // Create Date objects for comparison
                            const startDate = new Date();
                            const endDate = new Date();
                            
                            startDate.setHours(
                              startPeriod === 'PM' && startHours !== 12 ? startHours + 12 : (startPeriod === 'AM' && startHours === 12 ? 0 : startHours),
                              startMinutes
                            );
                            endDate.setHours(
                              endPeriod === 'PM' && endHours !== 12 ? endHours + 12 : (endPeriod === 'AM' && endHours === 12 ? 0 : endHours),
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
                              
                              setEditingClass((prev: any) => ({
                                ...prev,
                                startTime: newStartTime,
                                endTime: e.target.value
                              }));
                            } else {
                              setEditingClass((prev: any) => ({
                                ...prev,
                                endTime: e.target.value
                              }));
                            }
                          }}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        >
                          {timeOptions.map(time => (
                            <option key={time} value={time}>{time}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className={styles.form.label}>Class Schedule</label>
                      <button
                        type="button"
                        onClick={handleAddScheduleToEdit}
                        className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Add Day
                      </button>
                    </div>
                    
                    {editingClass?.schedules.length === 0 ? (
                      <div className="text-center py-4 text-gray-500 border border-dashed border-gray-300 rounded-md">
                        No schedules added. Click "Add Day" to add a class day.
                      </div>
                    ) : (
                      <div className="space-y-4 mt-2">
                        {editingClass?.schedules.map((schedule: ClassSchedule, index: number) => (
                          <div key={index} className="p-4 border border-gray-200 rounded-md bg-gray-50">
                            <div className="flex justify-between items-center mb-3">
                              <h4 className="text-sm font-medium text-gray-700">Day {index + 1}</h4>
                              <button
                                type="button"
                                onClick={() => handleRemoveScheduleFromEdit(index)}
                                className="text-red-600 hover:text-red-800 bg-transparent"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700">Day</label>
                                <select
                                  value={schedule.dayOfWeek}
                                  onChange={(e) => handleEditScheduleChange(index, 'dayOfWeek', parseInt(e.target.value))}
                                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                >
                                  {DAYS_OF_WEEK.map((day, dayIndex) => (
                                    <option key={day} value={dayIndex}>{day}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700">Start Time</label>
                                <select
                                  value={schedule.startTime}
                                  onChange={(e) => handleEditScheduleChange(index, 'startTime', e.target.value)}
                                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                >
                                  {timeOptions.map(time => (
                                    <option key={time} value={time}>{time}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700">End Time</label>
                                <select
                                  value={schedule.endTime}
                                  onChange={(e) => handleEditScheduleChange(index, 'endTime', e.target.value)}
                                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                >
                                  {timeOptions.map(time => (
                                    <option key={time} value={time}>{time}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Date Pickers */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={styles.form.label}>{t.classStartDate || "Class Start Date"}</label>
                    <DatePicker
                      selected={editingClass?.startDate}
                      onChange={(date: Date | null) => {
                        if (!editingClass || !date) return;
                        setEditingClass((prev: any) => ({
                          ...prev,
                          startDate: date,
                          // Reset end date if it's now before the start date
                          ...(editingClass.endDate && editingClass.endDate < date ? { endDate: null } : {})
                        }));
                      }}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      showTimeSelect={false}
                      dateFormat="MMMM d, yyyy"
                      minDate={new Date()}
                      filterDate={(date) => {
                        if (!editingClass) return true;
                        
                        // For single schedule, only allow selecting dates that match the selected day of week
                        if (editingClass.scheduleType === 'single') {
                          return date.getDay() === editingClass.dayOfWeek;
                        }
                        
                        // For multiple schedules, only allow selecting dates that match any of the selected days
                        if (editingClass.scheduleType === 'multiple' && editingClass.schedules.length > 0) {
                          const selectedDays = editingClass.schedules.map((schedule: ClassSchedule) => schedule.dayOfWeek);
                          return selectedDays.includes(date.getDay());
                        }
                        
                        return true; // Allow all dates if no schedules defined yet
                      }}
                    />
                    {editingClass?.scheduleType === 'multiple' && editingClass.schedules.length > 0 && (
                      <p className="mt-1 text-xs text-gray-500">
                        Only {editingClass.schedules.map((s: ClassSchedule) => DAYS_OF_WEEK[s.dayOfWeek]).join(', ')} dates can be selected
                      </p>
                    )}
                    {editingClass?.scheduleType === 'single' && (
                      <p className="mt-1 text-xs text-gray-500">
                        Only {DAYS_OF_WEEK[editingClass.dayOfWeek]} dates can be selected
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={styles.form.label}>{t.endDate || "Class End Date"} <span className="text-gray-500 text-xs">({t.optional})</span></label>
                    <DatePicker
                      selected={editingClass?.endDate}
                      onChange={(date: Date | null) => {
                        if (!editingClass) return;
                        setEditingClass((prev: any) => ({
                          ...prev,
                          endDate: date
                        }));
                      }}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      showTimeSelect={false}
                      dateFormat="MMMM d, yyyy"
                      minDate={editingClass?.startDate}
                      isClearable={true}
                      placeholderText={t.noEndDate || "No end date"}
                    />
                  </div>
                </div>
                
                <div>
                  <label className={styles.form.label}>{t.notes}</label>
                  <textarea
                    value={editingClass?.notes}
                    onChange={(e) => {
                      if (!editingClass) return;
                      setEditingClass((prev: any) => ({
                        ...prev,
                        notes: e.target.value
                      }));
                    }}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    rows={3}
                  />
                </div>
              </div>
            </div>
            
            {/* Buttons */}
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setEditingClass(null)}
                disabled={isSaving}
                className={`${styles.buttons.cancel} ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {t.cancel}
              </button>
              <button
                onClick={handleSaveChanges}
                disabled={isSaving}
                className={`${styles.buttons.primary} ${isSaving ? 'opacity-80' : ''} flex items-center justify-center`}
              >
                {isSaving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {"Saving..."}
                  </>
                ) : (
                  t.save
                )}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}; 