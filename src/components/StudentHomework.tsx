import React, { useState, useEffect } from 'react';
import { Homework } from '../types/interfaces';
import { getHomeworkForStudent } from '../utils/homeworkUtils';
import { HomeworkDisplay } from './HomeworkDisplay';
import toast from 'react-hot-toast';

interface StudentHomeworkProps {
  studentEmail: string;
}

export const StudentHomework: React.FC<StudentHomeworkProps> = ({
  studentEmail
}) => {
  
  const [homeworkList, setHomeworkList] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabView, setTabView] = useState<'upcoming' | 'past'>('upcoming');

  // Fetch homework for this student
  useEffect(() => {
    const fetchHomework = async () => {
      try {
        setLoading(true);
        const homework = await getHomeworkForStudent(studentEmail);
        setHomeworkList(homework);
      } catch (error) {
        console.error('Error fetching homework:', error);
        toast.error('Failed to load homework assignments');
      } finally {
        setLoading(false);
      }
    };
    
    if (studentEmail) {
      fetchHomework();
    }
  }, [studentEmail]);

  // Filter homework into upcoming and past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const upcomingHomework = homeworkList.filter(hw => new Date(hw.classDate) >= today);
  const pastHomework = homeworkList.filter(hw => new Date(hw.classDate) < today);

  // Loading state
  if (loading) {
    return (
      <div className="py-4 flex justify-center">
        <svg className="animate-spin h-6 w-6 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <h2 className="text-xl font-semibold mb-4">Your Homework</h2>
      
      {/* Tab Navigation */}
      <div className="flex border-b mb-4">
        <button
          className={`py-2 px-4 ${tabView === 'upcoming' ? 'border-b-2 border-blue-500 text-blue-600 font-medium' : 'text-gray-500'}`}
          onClick={() => setTabView('upcoming')}
        >
          Upcoming ({upcomingHomework.length})
        </button>
        <button
          className={`py-2 px-4 ${tabView === 'past' ? 'border-b-2 border-blue-500 text-blue-600 font-medium' : 'text-gray-500'}`}
          onClick={() => setTabView('past')}
        >
          Past ({pastHomework.length})
        </button>
      </div>
      
      {/* Homework List */}
      <div>
        {tabView === 'upcoming' ? (
          upcomingHomework.length === 0 ? (
            <p className="text-gray-500 py-2">No upcoming homework assignments.</p>
          ) : (
            upcomingHomework.map(homework => (
              <HomeworkDisplay 
                key={homework.id} 
                homework={homework} 
                studentEmail={studentEmail} 
              />
            ))
          )
        ) : (
          pastHomework.length === 0 ? (
            <p className="text-gray-500 py-2">No past homework assignments.</p>
          ) : (
            pastHomework.map(homework => (
              <HomeworkDisplay 
                key={homework.id} 
                homework={homework} 
                studentEmail={studentEmail} 
              />
            ))
          )
        )}
      </div>
    </div>
  );
}; 