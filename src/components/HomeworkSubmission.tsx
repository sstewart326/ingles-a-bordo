import React, { useState, useEffect, ChangeEvent, FormEvent, useCallback } from 'react';
import { 
  getHomeworkSubmission, 
  submitHomework, 
  validateHomeworkFile,
  deleteHomeworkSubmissionFile,
  subscribeToHomeworkChanges,
  clearHomeworkCache,
  notifyHomeworkChange
} from '../utils/homeworkUtils';
import { FaUpload, FaFile, FaTrash } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { Homework, HomeworkSubmission as HomeworkSubmissionType } from '../types/interfaces';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';

interface HomeworkSubmissionProps {
  homework: Homework;
  studentEmail: string;
}

export const HomeworkSubmission: React.FC<HomeworkSubmissionProps> = ({
  homework,
  studentEmail
}) => {  
  const { language } = useLanguage();
  const t = useTranslation(language);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [textResponse, setTextResponse] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submission, setSubmission] = useState<HomeworkSubmissionType | null>(null);
  const [deletingFile, setDeletingFile] = useState<number | null>(null);
  // Add a refresh counter to force re-fetches
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Memoize fetchSubmission with useCallback
  const fetchSubmission = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      
      // Clear cache if forcing a refresh
      if (forceRefresh) {
        console.log("HomeworkSubmission: Forcing cache clear for submission refresh");
        clearHomeworkCache();
      }
      
      const existingSubmission = await getHomeworkSubmission(homework.id, studentEmail);
      console.log('HomeworkSubmission: Fetched submission', existingSubmission);
      
      if (existingSubmission) {
        setSubmission(existingSubmission);
        
        // Pre-fill text response if it exists and no user edits
        if (existingSubmission.textResponse && !textResponse) {
          setTextResponse(existingSubmission.textResponse);
        }
      } else {
        // Clear previous submission state if no submission exists
        setSubmission(null);
      }
    } catch (error) {
      console.error('Error fetching submission:', error);
    } finally {
      setLoading(false);
    }
  }, [homework.id, studentEmail, textResponse]);

  // Initial fetch and when refreshCounter changes
  useEffect(() => {
    fetchSubmission(refreshCounter > 0);
  }, [fetchSubmission, refreshCounter]);

  // Subscribe to homework changes
  useEffect(() => {
    console.log(`HomeworkSubmission: Setting up homework change subscription for homework ${homework.id}`);
    
    // Subscribe to homework changes
    const unsubscribe = subscribeToHomeworkChanges(() => {
      console.log(`HomeworkSubmission: Received homework change notification, refreshing submission`);
      // Force a refresh by incrementing the counter
      setRefreshCounter(prev => prev + 1);
    });
    
    return () => {
      console.log(`HomeworkSubmission: Cleaning up homework change subscription for homework ${homework.id}`);
      unsubscribe();
    };
  }, [homework.id]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const newFiles = Array.from(event.target.files);
      
      // Validate each file
      const errors: { [key: string]: string } = {};
      newFiles.forEach(file => {
        const error = validateHomeworkFile(file);
        if (error) {
          errors[file.name] = error;
        }
      });
      
      // Add only valid files
      const validFiles = newFiles.filter(file => !errors[file.name]);
      
      setFiles(prev => [...prev, ...validFiles]);
      
      // Show errors if any
      if (Object.keys(errors).length > 0) {
        Object.values(errors).forEach(error => {
          toast.error(error);
        });
      }
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    // Validate that at least one field is filled if required
    if (homework.allowTextSubmission && homework.allowFileSubmission && 
        !textResponse.trim() && files.length === 0 && (!submission || (!submission.textResponse && !submission.files?.length))) {
      toast.error(t.error);
      return;
    }
    
    setSubmitting(true);
    
    try {
      const submissionId = await submitHomework(
        homework.id,
        studentEmail,
        textResponse,
        files.length > 0 ? files : undefined
      );
      
      toast.success(t.success);
      
      // Reset file upload state but keep text response
      setFiles([]);
      
      // If this was a first-time submission, we need to explicitly trigger updates
      if (!submission) {
        console.log("HomeworkSubmission: First-time submission completed, ID:", submissionId);
        
        // Clear all caches to force fresh data everywhere
        clearHomeworkCache();
        
        // Force an immediate fetch of the submission
        await fetchSubmission(true);
        
        // Force a counter update to ensure all subscribers are notified
        setRefreshCounter(prev => prev + 2);
        
        // Explicitly notify about homework change a second time to ensure propagation
        setTimeout(() => {
          const classId = homework.classId;
          console.log("HomeworkSubmission: Sending delayed notification for first submission in class:", classId);
          // Import this function at the top if not already there
          // import { notifyHomeworkChange } from '../utils/homeworkUtils';
          notifyHomeworkChange(classId);
        }, 500);
      } else {
        // Regular update for existing submission
        setRefreshCounter(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error submitting homework:', error);
      if (error instanceof Error) {
        toast.error(error.message || t.error);
      } else {
        toast.error(t.error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSubmittedFile = async (index: number) => {
    if (!submission || !submission.id) {
      toast.error(t.error);
      return;
    }
    
    try {
      setDeletingFile(index);
      
      await deleteHomeworkSubmissionFile(submission.id, index);
      
      toast.success(t.fileDeleted);
      
      // Force a refresh to show the updated submission
      setRefreshCounter(prev => prev + 1);
    } catch (error) {
      console.error('Error deleting file:', error);
      if (error instanceof Error) {
        toast.error(error.message || t.error);
      } else {
        toast.error(t.error);
      }
    } finally {
      setDeletingFile(null);
    }
  };

  // Show loading state
  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  // If both submission options are disabled, show a message
  if (!homework.allowTextSubmission && !homework.allowFileSubmission) {
    return (
      <div className="border border-gray-100 rounded-md p-4">
        <p className="text-gray-700">This homework does not require a submission.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Submit Your Work</h3>
      
      {submission && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <div className="flex items-center text-green-700 mb-2">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">Submitted {new Date(submission.submittedAt).toLocaleString()}</span>
          </div>
          <p className="text-sm text-gray-600">You can update your submission below.</p>
          
          {/* Display previously submitted files */}
          {submission.files && submission.files.length > 0 && (
            <div className="mt-3 border-t border-green-200 pt-3">
              <h4 className="text-sm font-medium text-green-800 mb-2">Your Submitted Files:</h4>
              <ul className="bg-white rounded-md border border-green-100 divide-y divide-green-100">
                {submission.files.map((file, index) => (
                  <li key={index} className="p-2 flex items-center justify-between">
                    <div className="flex items-center">
                      <FaFile className="mr-2 text-green-500" />
                      <span className="text-sm">{file.name}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        ({(file.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <a 
                        href={file.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                      >
                        Download
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDeleteSubmittedFile(index)}
                        disabled={deletingFile === index}
                        className={`p-2 rounded text-red-500 hover:bg-red-50 ${
                          deletingFile === index ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        title={t.deleteFile}
                      >
                        {deletingFile === index ? (
                          <svg className="animate-spin h-4 w-4 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <FaTrash />
                        )}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Display previously submitted text response */}
          {submission.textResponse && (
            <div className="mt-3 border-t border-green-200 pt-3">
              <h4 className="text-sm font-medium text-green-800 mb-2">Your Written Response:</h4>
              <div className="bg-white p-3 rounded-md border border-green-100">
                <p className="text-gray-700 whitespace-pre-line">{submission.textResponse}</p>
              </div>
            </div>
          )}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        {/* Text Response Section */}
        {homework.allowTextSubmission && (
          <div className="mb-4">
            <label className="block text-sm text-gray-700 mb-2 font-medium" htmlFor="textResponse">
              {t.homeworkDescription}
            </label>
            <textarea
              id="textResponse"
              value={textResponse}
              onChange={(e) => setTextResponse(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder={t.homeworkDescription}
              rows={6}
            />
          </div>
        )}
        
        {/* File Upload Section */}
        {homework.allowFileSubmission && (
          <div className="mb-4">
            {files.length > 0 && (
              <ul className="bg-gray-50 rounded-md border border-gray-200 divide-y divide-gray-200">
                {files.map((file, index) => (
                  <li key={index} className="p-2 flex items-center justify-between">
                    <div className="flex items-center">
                      <FaFile className="mr-2 text-indigo-500" />
                      <span className="text-sm">{file.name}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        ({(file.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <FaTrash />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        
        <div className="flex justify-end items-center space-x-4">
          {homework.allowFileSubmission && (
            <label className="inline-flex items-center cursor-pointer px-3 py-1.5 border border-indigo-500 rounded text-indigo-500 hover:bg-indigo-50 text-sm">
              <FaUpload className="mr-2" />
              {t.uploadMaterials}
              <input
                type="file"
                onChange={handleFileChange}
                className="hidden"
                multiple
              />
            </label>
          )}
          <button
            type="submit"
            disabled={submitting}
            className={`px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
              submitting
                ? 'bg-indigo-300 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {submitting ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {t.saving}
              </span>
            ) : (
              t.save
            )}
          </button>
        </div>
        
        {/* Feedback Section */}
        {submission?.feedback && (
          <div className="mt-6 p-4 bg-blue-50 rounded-md">
            <h4 className="font-medium text-blue-800 mb-2">{t.feedback}:</h4>
            <p className="text-gray-800 whitespace-pre-line">{submission.feedback}</p>
            {submission.grade && (
              <div className="mt-2">
                <span className="font-medium text-blue-800">{t.grade}: </span>
                <span className="text-gray-800">{submission.grade}</span>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}; 