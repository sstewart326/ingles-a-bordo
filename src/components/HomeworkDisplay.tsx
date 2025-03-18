import React, { useState } from 'react';
import { Homework } from '../types/interfaces';
import { FaFilePdf, FaFileWord, FaFilePowerpoint, FaFileAudio, FaFileVideo, FaFile, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { HomeworkSubmission } from './HomeworkSubmission';

interface HomeworkDisplayProps {
  homework: Homework;
  studentEmail: string;
}

export const HomeworkDisplay: React.FC<HomeworkDisplayProps> = ({
  homework,
  studentEmail
}) => {
  const [expanded, setExpanded] = useState(false);

  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) return <FaFilePdf className="text-red-500" />;
    if (type.includes('word')) return <FaFileWord className="text-blue-500" />;
    if (type.includes('powerpoint')) return <FaFilePowerpoint className="text-orange-500" />;
    if (type.includes('audio')) return <FaFileAudio className="text-purple-500" />;
    if (type.includes('video')) return <FaFileVideo className="text-green-500" />;
    return <FaFile className="text-gray-500" />;
  };

  // Format the date for display
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden mb-4">
      {/* Homework Header */}
      <div 
        className="flex justify-between items-center p-4 cursor-pointer bg-blue-50 hover:bg-blue-100"
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <h3 className="font-semibold text-lg text-blue-800">{homework.title}</h3>
          <p className="text-sm text-gray-600">
            Assigned: {formatDate(homework.classDate)}
          </p>
        </div>
        <div className="flex items-center">
          {expanded ? <FaChevronUp /> : <FaChevronDown />}
        </div>
      </div>
      
      {/* Expandable Content */}
      {expanded && (
        <div className="p-4 border-t">
          {/* Description */}
          {homework.description && (
            <div className="mb-4">
              <h4 className="font-medium mb-2">Description:</h4>
              <div className="border border-gray-100 p-3 rounded whitespace-pre-line text-gray-800">
                {homework.description}
              </div>
            </div>
          )}
          
          {/* Attached Files */}
          {homework.documents && homework.documents.length > 0 && (
            <div className="mb-6">
              <h4 className="font-medium mb-2">Attached Files:</h4>
              <ul className="border border-gray-100 p-3 rounded-md">
                {homework.documents.map((doc, index) => (
                  <li key={index} className="flex justify-between items-center py-2 border-b last:border-b-0">
                    <div className="flex items-center">
                      {getFileIcon(doc.type)}
                      <span className="text-sm ml-2">{doc.name}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        ({(doc.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    </div>
                    <a 
                      href={doc.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                    >
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Submission Section */}
          <HomeworkSubmission homework={homework} studentEmail={studentEmail} />
        </div>
      )}
    </div>
  );
}; 