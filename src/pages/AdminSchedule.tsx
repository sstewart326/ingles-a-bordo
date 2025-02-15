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
  endDate?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface SelectOption {
  value: string;
  label: string;
}

type SelectStyles = StylesConfig<SelectOption, true>;

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

const timeOptions = generateTimeOptions();

export const AdminSchedule = () => {
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
    endDate: null as Date | null
  });

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // First fetch users
        await fetchAllUsers();
        // Then fetch classes
        await fetchClasses();
      } catch (error) {
        console.error('Error loading data:', error);
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
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

  const studentOptions = users.map(user => ({
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

  return (
    <div className="flex-1 bg-white">
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-black">Manage Classes</h1>
          <div className="relative">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Add New Class
            </button>
          </div>
        </div>

        {showAddForm && (
          <div className="bg-white shadow-md rounded-lg p-4 mb-6">
            <h2 className="text-lg font-semibold mb-4">Create New Class</h2>
            <form onSubmit={handleCreateClass} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Day of Week</label>
                  <select
                    value={newClass.dayOfWeek}
                    onChange={(e) => setNewClass(prev => ({ ...prev, dayOfWeek: parseInt(e.target.value) }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  >
                    {DAYS_OF_WEEK.map((day, index) => (
                      <option key={day} value={index}>{day}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    End Date <span className="text-gray-500 font-normal">(Optional)</span>
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
                    <label className="block text-sm font-medium text-gray-700">Start Time</label>
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
                    <label className="block text-sm font-medium text-gray-700">End Time</label>
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
                  <label className="block text-sm font-medium text-gray-700">Students</label>
                  <Select
                    isMulti
                    value={studentOptions.filter(option => 
                      newClass.studentEmails.includes(option.value)
                    )}
                    onChange={handleStudentChange}
                    options={studentOptions}
                    className="mt-1"
                    classNamePrefix="select"
                    placeholder="Select students..."
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
                <label className="block text-sm font-medium text-gray-700">Notes</label>
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
                  Create Class
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Day & Time
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Course Type
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Students
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    End Date
                  </th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
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
                              {student.name}{student.status === 'pending' ? ' (Pending)' : ''}
                            </div>
                          ) : (
                            <div key={`${classItem.id}-${email}`} className="mb-1 text-red-500">
                              Unknown Email: {email}
                            </div>
                          );
                        })}
                        {(!classItem.studentEmails || classItem.studentEmails.length === 0) && (
                          <div key={`${classItem.id}-no-students`} className="text-gray-500 italic">No students assigned</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {classItem.endDate?.toDate().toLocaleDateString() || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                      <button
                        onClick={() => handleDeleteClass(classItem.id)}
                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}; 