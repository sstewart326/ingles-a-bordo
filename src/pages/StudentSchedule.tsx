import { useState, useEffect, useCallback } from 'react';
import { collection, query, getDocs, addDoc, deleteDoc, doc, where, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface Class {
  id: string;
  studentIds: string[];
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  courseType: string;
  notes?: string;
  endDate: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

const COURSE_TYPES = ['Individual', 'Pair', 'Group'];
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const logSchedule = (message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[STUDENT-SCHEDULE] ${message}`, data ? data : '');
  }
};

export const StudentSchedule = () => {
  const { currentUser } = useAuth();
  const [students, setStudents] = useState<User[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newClass, setNewClass] = useState<Omit<Class, 'id' | 'studentIds' | 'createdAt' | 'updatedAt'>>({
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '10:00',
    courseType: 'Regular',
    notes: '',
    endDate: Timestamp.fromDate(new Date(new Date().setMonth(new Date().getMonth() + 1)))
  });

  const fetchStudents = useCallback(async () => {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('isAdmin', '==', false));
      const snapshot = await getDocs(q);
      const fetchedStudents = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as User[];
      setStudents(fetchedStudents);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  }, []);

  const fetchClasses = useCallback(async () => {
    try {
      logSchedule('Fetching classes...');
      const classesRef = collection(db, 'classes');
      const snapshot = await getDocs(classesRef);
      logSchedule('Classes snapshot received:', {
        count: snapshot.size,
        docs: snapshot.docs.map(doc => ({
          id: doc.id,
          studentIds: doc.data().studentIds
        }))
      });
      
      const fetchedClasses = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          endDate: data.endDate instanceof Timestamp ? data.endDate : Timestamp.fromDate(new Date(data.endDate)),
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.fromDate(new Date(data.createdAt)),
          updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : Timestamp.fromDate(new Date(data.updatedAt))
        };
      }) as Class[];
      
      logSchedule('Processed classes:', {
        count: fetchedClasses.length,
        classes: fetchedClasses.map(c => ({
          id: c.id,
          dayOfWeek: c.dayOfWeek,
          studentIds: c.studentIds
        }))
      });
      
      setClasses(fetchedClasses);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching classes:', error);
      if (error instanceof Error) {
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      }
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    console.log('StudentSchedule mounted, auth state:', { 
      isAuthenticated: !!currentUser,
      userId: currentUser?.uid,
      email: currentUser?.email 
    });
    fetchStudents();
    fetchClasses();
  }, [currentUser, fetchStudents, fetchClasses]);

  const addClass = async () => {
    if (selectedStudents.length === 0) return;

    try {
      const now = Timestamp.now();
      await addDoc(collection(db, 'classes'), {
        ...newClass,
        studentIds: selectedStudents,
        createdAt: now,
        updatedAt: now
      });

      await fetchClasses();
      setIsModalOpen(false);
      resetNewClass();
    } catch (error) {
      console.error('Error adding class:', error);
    }
  };

  const deleteClass = async (classId: string) => {
    try {
      await deleteDoc(doc(db, 'classes', classId));
      await fetchClasses();
    } catch (error) {
      console.error('Error deleting class:', error);
    }
  };

  const resetNewClass = () => {
    setNewClass({
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:00',
      courseType: 'Regular',
      notes: '',
      endDate: Timestamp.fromDate(new Date(new Date().setMonth(new Date().getMonth() + 1)))
    });
    setSelectedStudents([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="sm:flex sm:items-center">
          <div className="sm:flex-auto">
            <h1 className="text-3xl font-bold text-black">Class Schedule</h1>
          </div>
          <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
            >
              Add Class
            </button>
          </div>
        </div>

        {/* Classes List */}
        <div className="mt-8">
          <div className="space-y-4">
            {classes.map((classItem) => (
              <div key={classItem.id} className="bg-white shadow rounded-lg p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-medium text-black">
                      {DAYS_OF_WEEK[classItem.dayOfWeek]} - {classItem.courseType}
                    </h3>
                    <p className="text-sm text-black">
                      {classItem.startTime} - {classItem.endTime}
                    </p>
                    <p className="text-sm text-black">
                      Ends on: {classItem.endDate.toDate().toLocaleDateString()}
                    </p>
                    {classItem.notes && (
                      <p className="text-sm text-black mt-1">
                        Notes: {classItem.notes}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteClass(classItem.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </div>
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-black">Students:</h4>
                  <div className="mt-2 space-y-2">
                    {classItem.studentIds.map((studentId) => {
                      const student = students.find(s => s.id === studentId);
                      return (
                        <div key={studentId} className="text-sm text-black">
                          {student?.name || student?.email || 'Unknown Student'}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add Class Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-start justify-center z-50 pt-20 px-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-medium text-black mb-4">Add Class</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-black">Students</label>
                  <select
                    multiple
                    value={selectedStudents}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions, option => option.value);
                      setSelectedStudents(selected);
                    }}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white text-black"
                    style={{ minHeight: '100px' }}
                  >
                    {students.map((student) => (
                      <option key={student.id} value={student.id} className="p-1 hover:bg-gray-100 text-black">
                        {student.name || student.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-black">Day of Week</label>
                  <select
                    value={newClass.dayOfWeek}
                    onChange={(e) => setNewClass({...newClass, dayOfWeek: parseInt(e.target.value)})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white text-black"
                  >
                    {DAYS_OF_WEEK.map((day, index) => (
                      <option key={index} value={index} className="p-1 text-black">{day}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-black">Start Time</label>
                  <input
                    type="time"
                    value={newClass.startTime}
                    onChange={(e) => setNewClass({...newClass, startTime: e.target.value})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white text-black"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-black">End Time</label>
                  <input
                    type="time"
                    value={newClass.endTime}
                    onChange={(e) => setNewClass({...newClass, endTime: e.target.value})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white text-black"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-black">Course Type</label>
                  <select
                    value={newClass.courseType}
                    onChange={(e) => setNewClass({...newClass, courseType: e.target.value})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white text-black"
                  >
                    {COURSE_TYPES.map((type) => (
                      <option key={type} value={type} className="p-1 text-black">{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-black">Notes (Optional)</label>
                  <input
                    type="text"
                    value={newClass.notes}
                    onChange={(e) => setNewClass({...newClass, notes: e.target.value})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white text-black"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-black">End Date</label>
                  <input
                    type="date"
                    value={newClass.endDate.toDate().toISOString().split('T')[0]}
                    onChange={(e) => setNewClass({
                      ...newClass,
                      endDate: Timestamp.fromDate(new Date(e.target.value))
                    })}
                    min={new Date().toISOString().split('T')[0]}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white text-black"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    resetNewClass();
                  }}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  Cancel
                </button>
                <button
                  onClick={addClass}
                  disabled={selectedStudents.length === 0}
                  className="rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-gray-300"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 