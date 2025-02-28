import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import Select, { MultiValue, StylesConfig } from 'react-select';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { 
  getCachedCollection, 
  setCachedDocument, 
  deleteCachedDocument 
} from '../utils/firebaseUtils';
import { Timestamp } from 'firebase/firestore';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';

interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  createdAt: string;
  status?: 'active' | 'pending';
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

export const AdminSchedule = () => {
  const { language } = useLanguage();
  const t = useTranslation(language);
  const DAYS_OF_WEEK = [t.sunday, t.monday, t.tuesday, t.wednesday, t.thursday, t.friday, t.saturday];
  const [classes, setClasses] = useState<Class[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newClass, setNewClass] = useState({
    dayOfWeek: 1,
    startTime: '09:00 AM',
    endTime: '10:00 AM',
    courseType: 'Individual',
    notes: '',
    studentEmails: [] as string[],
    startDate: getNextDayOccurrence(1),
    endDate: null as Date | null
  });
  const [showMobileView, setShowMobileView] = useState(window.innerWidth < 768);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);

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

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      
      const hasHorizontalScroll = target.scrollWidth > target.clientWidth;
      const isScrolledToEnd = target.scrollLeft + target.clientWidth >= target.scrollWidth - 10;
      setShowScrollIndicator(hasHorizontalScroll && !isScrolledToEnd);
    };

    window.addEventListener('resize', handleResize);
    const tableContainer = document.querySelector('.table-container');
    if (tableContainer) {
      tableContainer.addEventListener('scroll', handleScroll);
      // Initial check
      handleScroll({ target: tableContainer } as unknown as Event);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
      if (tableContainer) {
        tableContainer.removeEventListener('scroll', handleScroll);
      }
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
      // Fetch all users (both active and pending)
      const users = await getCachedCollection<User>('users', [], { includeIds: true });
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
      
      const classData = {
        dayOfWeek: newClass.dayOfWeek,
        startTime: newClass.startTime,
        endTime: newClass.endTime,
        courseType: newClass.courseType,
        notes: newClass.notes || '',
        studentEmails: studentEmails,
        startDate: Timestamp.fromDate(newClass.startDate),
        ...(newClass.endDate ? { endDate: Timestamp.fromDate(new Date(newClass.endDate)) } : {}),
        createdAt: now,
        updatedAt: now
      };

      // Generate a unique ID for the new class
      const classId = Date.now().toString();
      await setCachedDocument('classes', classId, classData);
      
      await fetchClasses();
      setShowAddForm(false);
      setNewClass({
        dayOfWeek: 1,
        startTime: '09:00 AM',
        endTime: '10:00 AM',
        courseType: 'Individual',
        notes: '',
        studentEmails: [],
        startDate: getNextDayOccurrence(1),
        endDate: null
      });
      toast.success('Class created successfully');
    } catch (error) {
      console.error('Error creating class:', error);
      toast.error('Failed to create class');
    }
  };

  const handleDeleteClass = async (classId: string) => {
    if (!window.confirm('Are you sure you want to delete this class?')) {
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

  if (loading) {
    return <div className="text-center p-4">Loading...</div>;
  }

  const renderMobileCard = (classItem: Class) => (
    <div key={classItem.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="font-semibold text-gray-900">
            {DAYS_OF_WEEK[classItem.dayOfWeek]}
          </div>
          <div className="text-sm text-gray-600">
            {classItem.startTime} - {classItem.endTime}
          </div>
        </div>
        <button
          onClick={() => handleDeleteClass(classItem.id)}
          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
        >
          {t.delete}
        </button>
      </div>
      
      <div className="space-y-2">
        <div>
          <div className="text-sm font-medium text-gray-500">{t.courseType}</div>
          <div className="text-sm text-gray-900">{classItem.courseType}</div>
        </div>
        
        <div>
          <div className="text-sm font-medium text-gray-500">{t.students}</div>
          <div className="text-sm text-gray-900">
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
            {(!classItem.studentEmails || classItem.studentEmails.length === 0) && (
              <div className="text-gray-500 italic">{t.noStudentsAssigned}</div>
            )}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-gray-500">{t.startDate}</div>
          <div className="text-sm text-gray-900">
            {classItem.startDate.toDate().toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en')}
          </div>
        </div>

        {classItem.endDate && (
          <div>
            <div className="text-sm font-medium text-gray-500">{t.endDate}</div>
            <div className="text-sm text-gray-900">
              {classItem.endDate.toDate().toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en')}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 bg-white">
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-black">{t.manageClasses}</h1>
          <div className="relative">
            <button
              onClick={async () => {
                if (!showAddForm) {
                  await fetchAllUsers();
                  setNewClass(prev => ({
                    ...prev,
                    dayOfWeek: 1,
                    startTime: '09:00 AM',
                    endTime: '10:00 AM',
                    courseType: 'Individual',
                    notes: '',
                    studentEmails: [],
                    startDate: getNextDayOccurrence(1),
                    endDate: null
                  }));
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
          // Mobile card view
          <div className="space-y-4">
            {classes.map(renderMobileCard)}
          </div>
        ) : (
          // Desktop table view
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
                        {DAYS_OF_WEEK[classItem.dayOfWeek]}<br />
                        {classItem.startTime} - {classItem.endTime}
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
                          {(!classItem.studentEmails || classItem.studentEmails.length === 0) && (
                            <div key={`${classItem.id}-no-students`} className="text-gray-500 italic">{t.noStudentsAssigned}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {classItem.startDate.toDate().toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {classItem.endDate?.toDate().toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en') || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                        <button
                          onClick={() => handleDeleteClass(classItem.id)}
                          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                        >
                          {t.delete}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {showScrollIndicator && (
              <div className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none bg-gradient-to-l from-white to-transparent flex items-center justify-center">
                <div className="animate-bounce text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}; 