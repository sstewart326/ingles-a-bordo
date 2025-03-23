import React, { useState, useEffect } from 'react';
import { Homework } from '../types/interfaces';
import { getHomeworkForMonth } from '../utils/homeworkUtils';
import { HomeworkSubmission } from './HomeworkSubmission';
import { FaChevronDown, FaChevronUp, FaFilePdf, FaFileWord, FaFilePowerpoint, FaFileAudio, FaFileVideo, FaFile } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { styles } from '../styles/styleUtils';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';

interface ScheduleHomeworkViewProps {
  classId: string;
  classDate: Date;
  studentEmail: string | null;
  isOpen?: boolean;
}

const ScheduleHomeworkView: React.FC<ScheduleHomeworkViewProps> = ({
  classId,
  classDate,
  studentEmail,
  isOpen = true
}) => {
  const { language } = useLanguage();
  const t = useTranslation(language);
  const [homeworkList, setHomeworkList] = useState<Homework[]>([]);
  const [expandedHomeworkId, setExpandedHomeworkId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHomework = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Get all homework for the month
        const monthHomework = await getHomeworkForMonth(classId, classDate);
        
        // Filter for the specific date
        const dateString = classDate.toISOString().split('T')[0];
        const homeworkForDate = monthHomework.filter(hw => {
          const hwDateStr = hw.classDate.toISOString().split('T')[0];
          return hwDateStr === dateString;
        });
        
        setHomeworkList(homeworkForDate);
      } catch (error) {
        console.error('Error fetching homework:', error);
        setError(t.failedToLoad);
        toast.error(t.failedToLoad);
      } finally {
        setIsLoading(false);
      }
    };

    if (classId && classDate && isOpen) {
      fetchHomework();
    }
  }, [classId, classDate, isOpen, t]);

  const toggleExpandHomework = (homeworkId: string) => {
    setExpandedHomeworkId(expandedHomeworkId === homeworkId ? null : homeworkId);
  };

  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) return <FaFilePdf className="text-red-500" />;
    if (type.includes('word')) return <FaFileWord className="text-blue-500" />;
    if (type.includes('powerpoint')) return <FaFilePowerpoint className="text-orange-500" />;
    if (type.includes('audio')) return <FaFileAudio className="text-purple-500" />;
    if (type.includes('video')) return <FaFileVideo className="text-green-500" />;
    return <FaFile className="text-gray-500" />;
  };

  const formatDate = (date: any) => {
    try {
      // Handle various date formats
      let jsDate: Date;
      
      // If it's already a Date object
      if (date instanceof Date) {
        jsDate = date;
      }
      // If it's a string, convert to Date
      else if (typeof date === 'string') {
        jsDate = new Date(date);
      }
      // If it's a Firestore Timestamp (has toDate method)
      else if (typeof date === 'object' && 'toDate' in date && typeof date.toDate === 'function') {
        jsDate = date.toDate();
      }
      // If it's a number, treat as milliseconds
      else if (typeof date === 'number') {
        jsDate = new Date(date);
      }
      // Default case
      else {
        console.warn('Unknown date format in formatDate:', date);
        return 'Unknown date';
      }
      
      return jsDate.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error, date);
      return 'Error formatting date';
    }
  };

  if (isLoading) {
    return (
      <div className="py-2 flex justify-center">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 text-sm py-2">{error}</div>
    );
  }
  
  if (homeworkList.length === 0) {
    return (
      <div className="text-gray-500 text-sm py-2">No homework assignments for this class.</div>
    );
  }

  return (
    <div className="mt-3">
      <div className={styles.card.label}>Homework</div>
      <div className="mt-1 space-y-2">
        {homeworkList.map((homework) => (
          <div key={homework.id} className="border rounded-md overflow-hidden bg-white shadow-sm">
            <div 
              className="flex justify-between items-center p-3 cursor-pointer bg-indigo-50 hover:bg-indigo-100"
              onClick={() => toggleExpandHomework(homework.id)}
            >
              <div>
                <h4 className="font-medium text-sm text-indigo-900">{homework.title}</h4>
                <p className="text-xs text-indigo-700">
                  Due: {formatDate(homework.classDate)}
                </p>
              </div>
              <div className="flex items-center">
                {expandedHomeworkId === homework.id ? 
                  <FaChevronUp className="h-3 w-3 text-indigo-600" /> : 
                  <FaChevronDown className="h-3 w-3 text-indigo-600" />
                }
              </div>
            </div>
            
            {expandedHomeworkId === homework.id && (
              <div className="p-3 border-t">
                {/* Description */}
                {homework.description && (
                  <div className="mb-3">
                    <h5 className="font-medium text-xs mb-1 text-gray-700">Description:</h5>
                    <div className="border border-gray-100 p-3 rounded-md text-sm whitespace-pre-line text-gray-700">
                      {homework.description}
                    </div>
                  </div>
                )}
                
                {/* Attached Files */}
                {homework.documents && homework.documents.length > 0 && (
                  <div className="mb-3">
                    <h5 className="font-medium text-xs mb-1 text-gray-700">Attached Files:</h5>
                    <ul className="border border-gray-100 p-3 rounded-md text-xs">
                      {homework.documents.map((doc, index) => (
                        <li key={index} className="flex justify-between items-center py-1 border-b last:border-b-0">
                          <div className="flex items-center">
                            {getFileIcon(doc.type)}
                            <span className="ml-1">{doc.name}</span>
                            <span className="text-gray-500 ml-1">
                              ({(doc.size / 1024 / 1024).toFixed(2)} MB)
                            </span>
                          </div>
                          <a 
                            href={doc.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Download
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Submission Section - only shown if student is logged in */}
                {studentEmail ? (
                  <div className="mt-3">
                    <HomeworkSubmission 
                      homework={homework} 
                      studentEmail={studentEmail} 
                    />
                  </div>
                ) : (
                  <div className="bg-yellow-50 p-3 rounded-md text-xs mt-3 border border-yellow-100">
                    <p className="text-yellow-700">Log in to submit your homework.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScheduleHomeworkView; 