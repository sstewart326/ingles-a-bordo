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
        startDate: today.toISOString().split('T')[0]
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
        })
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
          startDate: today.toISOString().split('T')[0]
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
      paymentConfig: classItem.paymentConfig
    });
  };

  // Function to handle saving all changes
  const handleSaveChanges = async () => {
    if (!editingClass) return;

    try {
      const updateData = {
        dayOfWeek: editingClass.dayOfWeek,
        startTime: editingClass.startTime,
        endTime: editingClass.endTime,
        courseType: editingClass.courseType,
        notes: editingClass.notes,
        studentEmails: editingClass.studentEmails,
        startDate: Timestamp.fromDate(editingClass.startDate),
        endDate: editingClass.endDate ? Timestamp.fromDate(editingClass.endDate) : null,
        paymentConfig: editingClass.paymentConfig,
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
      return {
        ...prev,
        startTime,
        // Automatically set end time to be 1 hour after start time
        endTime: adjustTime(startTime, 1)
      };
    });
  };

  const handleEditEndTimeChange = (endTime: string) => {
    setEditingClass(prev => {
      if (!prev) return prev;
      
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
          endTime
        };
      }

      return {
        ...prev,
        endTime
      };
    });
  };

  if (loading) {
    return <div className="text-center p-4">Loading...</div>;
  }

  const renderMobileCard = (classItem: Class) => (
    <div key={classItem.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
      <div className="space-y-2">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-semibold">{DAYS_OF_WEEK[classItem.dayOfWeek]}</div>
            <div>{classItem.startTime} - {classItem.endTime}</div>
            <div className="mt-2">
              <div className="font-medium">{t.courseType}</div>
              <div>{classItem.courseType}</div>
            </div>
            <div className="mt-2">
              <div className="font-medium">{t.students}</div>
              <div className="max-h-24 overflow-y-auto">
                {classItem.studentEmails?.map(email => {
                  const student = users.find(u => u.email === email);
                  return student ? (
                    <div key={`${classItem.id}-${email}`} className="mb-1">
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
              <div className="font-medium">{t.startDate}</div>
              <div>{classItem.startDate.toDate().toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en')}</div>
            </div>
            {classItem.endDate && (
              <div className="mt-2">
                <div className="font-medium">{t.endDate}</div>
                <div>{classItem.endDate.toDate().toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en')}</div>
              </div>
            )}
            <div className="mt-2">
              <div className="font-medium">{t.notes}</div>
              <div>{classItem.notes || t.noNotes}</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => openEditModal(classItem)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm"
            >
              {t.edit}
            </button>
            <button
              onClick={() => handleDeleteClass(classItem.id)}
              className="btn-delete-soft"
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
          <h1 className="text-2xl font-bold text-black">{t.manageClasses}</h1>
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
                      startDate: today.toISOString().split('T')[0]
                    }
                  });
                }
                setShowAddForm(!showAddForm);
              }}
              className={`${
                showAddForm 
                  ? "bg-gray-200 hover:bg-gray-300 text-gray-800" 
                  : "bg-indigo-600 hover:bg-indigo-700 text-white"
              } px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                showAddForm ? "focus:ring-gray-500" : "focus:ring-indigo-500"
              }`}
            >
              {showAddForm ? (
                <span className="text-xl">&times;</span>
              ) : (
                t.addNewClass
              )}
            </button>
          </div>
        </div>

        {showAddForm && (
          <div className="bg-white shadow-md rounded-lg p-4 mb-6">
            <h2 className="text-lg font-semibold mb-4">{t.createNewClass}</h2>
            <form onSubmit={handleCreateClass} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t.dayOfWeek}</label>
                  <select
                    value={newClass.dayOfWeek}
                    onChange={(e) => {
                      const newDayOfWeek = parseInt(e.target.value);
                      const nextOccurrence = getNextDayOccurrence(newDayOfWeek);
                      setNewClass(prev => ({ 
                        ...prev, 
                        dayOfWeek: newDayOfWeek,
                        startDate: nextOccurrence
                      }));
                    }}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  >
                    {DAYS_OF_WEEK.map((day, index) => (
                      <option key={day} value={index}>{day}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t.startDate}</label>
                  <DatePicker
                    selected={newClass.startDate}
                    onChange={(date: Date | null) => setNewClass(prev => ({ ...prev, startDate: date || new Date() }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    {t.endDate} <span className="text-gray-500 font-normal">({t.optional})</span>
                  </label>
                  <DatePicker
                    selected={newClass.endDate}
                    onChange={(date: Date | null) => setNewClass(prev => ({ ...prev, endDate: date || null }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    isClearable={true}
                  />
                </div>
                <div className="flex space-x-4 md:col-span-2">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700">{t.time}</label>
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
                    <label className="block text-sm font-medium text-gray-700">{t.time}</label>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t.students}</label>
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
                  <label className="block text-sm font-medium text-gray-700">{t.paymentConfiguration}</label>
                  <div className="mt-2 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">{t.paymentStartDate}</label>
                      <DatePicker
                        selected={new Date(newClass.paymentConfig.startDate)}
                        onChange={(date: Date | null) => {
                          if (date) {
                            // Store just the date portion in YYYY-MM-DD format
                            const dateStr = date.toISOString().split('T')[0];
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
                      />
                    </div>
                    <div>
                      <select
                        value={newClass.paymentConfig.type}
                        onChange={(e) => setNewClass(prev => ({
                          ...prev,
                          paymentConfig: {
                            ...prev.paymentConfig,
                            type: e.target.value as 'weekly' | 'monthly',
                            // Set default values based on type
                            weeklyInterval: e.target.value === 'weekly' ? 1 : null,
                            monthlyOption: e.target.value === 'monthly' ? 'first' : null
                          }
                        }))}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      >
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    {newClass.paymentConfig.type === 'weekly' && (
                      <div>
                        <label htmlFor="weeklyInterval" className="block text-sm font-medium text-gray-700">
                          {t.weeklyInterval}
                        </label>
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
                      </div>
                    )}
                    {newClass.paymentConfig.type === 'monthly' && (
                      <div>
                        <label htmlFor="monthlyOption" className="block text-sm font-medium text-gray-700">
                          {t.selectPaymentDay}
                        </label>
                        <select
                          id="monthlyOption"
                          value={newClass.paymentConfig.monthlyOption || 'first'}
                          onChange={(e) => setNewClass(prev => ({
                            ...prev,
                            paymentConfig: {
                              ...prev.paymentConfig,
                              monthlyOption: e.target.value as 'first' | 'fifteen' | 'last'
                            }
                          }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        >
                          <option value="first">{t.firstDayMonth}</option>
                          <option value="fifteen">{t.fifteenthDayMonth}</option>
                          <option value="last">{t.lastDayMonth}</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t.notes}</label>
                <textarea
                  value={newClass.notes}
                  onChange={(e) => setNewClass(prev => ({ ...prev, notes: e.target.value }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  rows={3}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  {t.createNewClass}
                </button>
              </div>
            </form>
          </div>
        )}

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
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t.dayAndTime}
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t.courseType}
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t.students}
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t.startDate}
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t.endDate}
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t.actions}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {classes.map((classItem) => (
                    <tr key={classItem.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>{DAYS_OF_WEEK[classItem.dayOfWeek]}</div>
                        <div>{classItem.startTime} - {classItem.endTime}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {classItem.courseType}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="max-h-24 overflow-y-auto">
                          {classItem.studentEmails?.map(email => {
                            const student = users.find(u => u.email === email);
                            return student ? (
                              <div key={`${classItem.id}-${email}`} className="mb-1">
                                {student.name}{student.status === 'pending' ? ` (${t.pending})` : ''}
                              </div>
                            ) : (
                              <div key={`${classItem.id}-${email}`} className="mb-1 text-red-500">
                                {t.unknownEmail}: {email}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {classItem.startDate.toDate().toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {classItem.endDate ? classItem.endDate.toDate().toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en') : t.noEndDate}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => openEditModal(classItem)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm"
                          >
                            {t.edit}
                          </button>
                          <button
                            onClick={() => handleDeleteClass(classItem.id)}
                            className="btn-delete-soft"
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
        {editingClass && (
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">{t.edit} {t.class}</h2>
                <button
                  onClick={() => setEditingClass(null)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 w-8 h-8 rounded-md text-xl font-medium flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t.dayOfWeek}</label>
                  <select
                    value={editingClass.dayOfWeek}
                    onChange={(e) => setEditingClass(prev => ({ ...prev!, dayOfWeek: parseInt(e.target.value) }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  >
                    {DAYS_OF_WEEK.map((day, index) => (
                      <option key={day} value={index}>{day}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">{t.time}</label>
                    <select
                      value={editingClass.startTime}
                      onChange={(e) => handleEditStartTimeChange(e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    >
                      {timeOptions.map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">{t.time}</label>
                    <select
                      value={editingClass.endTime}
                      onChange={(e) => handleEditEndTimeChange(e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    >
                      {timeOptions.map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">{t.courseType}</label>
                  <select
                    value={editingClass.courseType}
                    onChange={(e) => setEditingClass(prev => ({ ...prev!, courseType: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  >
                    <option value="Individual">Individual</option>
                    <option value="Pair">Pair</option>
                    <option value="Group">Group</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">{t.students}</label>
                  <Select
                    isMulti
                    value={studentOptions.filter(option => editingClass.studentEmails.includes(option.value))}
                    onChange={(selected: MultiValue<SelectOption>) => {
                      const selectedEmails = selected ? selected.map(option => option.value) : [];
                      setEditingClass(prev => ({ ...prev!, studentEmails: selectedEmails }));
                    }}
                    options={studentOptions}
                    className="mt-1"
                    classNamePrefix="select"
                    styles={customSelectStyles}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">{t.startDate}</label>
                    <DatePicker
                      selected={editingClass.startDate}
                      onChange={(date: Date | null) => setEditingClass(prev => ({ ...prev!, startDate: date || new Date() }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {t.endDate} <span className="text-gray-500 font-normal">({t.optional})</span>
                    </label>
                    <DatePicker
                      selected={editingClass.endDate}
                      onChange={(date: Date | null) => setEditingClass(prev => ({ ...prev!, endDate: date }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      isClearable
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">{t.notes}</label>
                  <textarea
                    value={editingClass.notes}
                    onChange={(e) => setEditingClass(prev => ({ ...prev!, notes: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    rows={3}
                  />
                </div>

                <div className="flex justify-end gap-2 mt-6">
                  <button
                    onClick={() => setEditingClass(null)}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm"
                  >
                    {t.cancel}
                  </button>
                  <button
                    onClick={handleSaveChanges}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm"
                  >
                    {t.save}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 