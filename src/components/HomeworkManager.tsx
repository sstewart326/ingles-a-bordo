import React, { useState, useEffect } from 'react';
import { Homework } from '../types/interfaces';
import { getHomeworkForMonth, deleteHomework, getHomeworkSubmissions, addHomeworkFeedback, subscribeToHomeworkChanges, updateHomework } from '../utils/homeworkUtils';
import { FaTrash, FaInbox, FaUserGraduate } from 'react-icons/fa';
import { HomeworkForm } from './HomeworkForm';
import toast from 'react-hot-toast';
import { styles } from '../styles/styleUtils';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';

interface HomeworkManagerProps {
  classId: string;
  classDate: Date;
  isAdmin: boolean;
  className?: string;
  teacherName?: string;
  loadingMessage?: string;
  emptyStateMessage?: string;
  onAddSuccess?: () => void;
  displayMode?: 'normal' | 'compact';
}

// Homework Submission Summary to be displayed in the header
const HomeworkSubmissionBadge: React.FC<{
  homeworkId: string;
  isAdmin: boolean;
  isExpanded: boolean;
  onToggleExpand: (homeworkId: string) => void;
}> = ({ homeworkId, isAdmin, isExpanded, onToggleExpand }) => {
  const [submissionCount, setSubmissionCount] = useState<number | null>(null);
  
  useEffect(() => {
    if (!isAdmin) return;
    
    const fetchSubmissionCount = async () => {
      try {
        const submissions = await getHomeworkSubmissions(homeworkId);
        setSubmissionCount(submissions.length);
      } catch (error) {
        console.error('Error fetching submission count:', error);
      }
    };
    
    fetchSubmissionCount();
  }, [homeworkId, isAdmin]);
  
  if (!isAdmin || submissionCount === null) return null;
  
  if (submissionCount === 0) return null;
  
  return (
    <div 
      className="flex items-center ml-2 cursor-pointer"
      onClick={(e) => {
        e.stopPropagation(); // Prevent event from bubbling to parent elements
        onToggleExpand(homeworkId);
      }}
      title="Click to view submissions"
    >
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium transition-colors duration-200 ${
        isExpanded 
          ? 'bg-blue-500 text-white' 
          : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
      }`}>
        <FaUserGraduate className="mr-1 h-3 w-3" />
        {submissionCount}
      </span>
    </div>
  );
};

export const HomeworkManager: React.FC<HomeworkManagerProps> = ({
  classId,
  classDate,
  isAdmin,
  onAddSuccess,
}) => {
  const { language } = useLanguage();
  const t = useTranslation(language);
  
  const [homeworkList, setHomeworkList] = useState<Homework[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedHomework, setSelectedHomework] = useState<Homework | null>(null);
  const [showHomeworkModal, setShowHomeworkModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [grade, setGrade] = useState('');
  
  // States for editable homework fields
  const [editedHomeworkTitle, setEditedHomeworkTitle] = useState('');
  const [editedHomeworkDescription, setEditedHomeworkDescription] = useState('');
  const [editedAllowTextSubmission, setEditedAllowTextSubmission] = useState(false);
  const [editedAllowFileSubmission, setEditedAllowFileSubmission] = useState(false);
  const [isSavingHomework, setIsSavingHomework] = useState(false);
  const [isFieldsModified, setIsFieldsModified] = useState(false);

  const fetchHomework = async () => {
    setIsLoading(true);
    try {
      let homework: Homework[];
      if (classDate) {
        // Get all homework for the month
        const monthHomework = await getHomeworkForMonth(classId, classDate);
        
        // Filter for the specific date if provided
        const dateString = classDate.toISOString().split('T')[0];
        homework = monthHomework.filter(hw => {
          const hwDateStr = hw.classDate.toISOString().split('T')[0];
          return hwDateStr === dateString;
        });
      } else {
        // If no date provided, get current month's homework
        const now = new Date();
        homework = await getHomeworkForMonth(classId, now);
      }
      setHomeworkList(homework);
    } catch (err) {
      console.error('Error fetching homework:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHomework();
    
    // Subscribe to homework changes for this class
    const unsubscribe = subscribeToHomeworkChanges((_) => {
      // Always refresh when homework changes, regardless of class ID
      // This ensures all homework views stay in sync
      fetchHomework();
    });
    
    // Cleanup subscription on unmount
    return () => unsubscribe();
    
  }, [classId, classDate]);

  const handleAddHomework = () => {
    setShowAddForm(true);
  };

  const handleCloseForm = () => {
    setShowAddForm(false);
  };

  const handleHomeworkAdded = () => {
    fetchHomework();
    setShowAddForm(false);
    
    // Call the parent's onAddSuccess callback if provided
    if (onAddSuccess) {
      console.log(`HomeworkManager: Calling parent's onAddSuccess callback`);
      onAddSuccess();
    }
  };

  const handleDelete = async (homeworkId: string) => {
    try {
      setDeletingId(homeworkId);
      await deleteHomework(homeworkId);
      setHomeworkList(prev => prev.filter(hw => hw.id !== homeworkId));
      toast.success('Homework deleted');
      
      // Call the parent's onAddSuccess callback (which is actually a refresh function)
      if (onAddSuccess) {
        console.log(`HomeworkManager: Calling parent's onAddSuccess callback after deletion`);
        onAddSuccess();
      }
    } catch (error) {
      console.error('Error deleting homework:', error);
      toast.error('Failed to delete homework');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!editingSubmissionId) return;
    
    try {
      await addHomeworkFeedback(editingSubmissionId, feedback, grade);
      toast.success('Feedback submitted');
      setEditingSubmissionId(null);
      setFeedback('');
      setGrade('');
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast.error('Failed to submit feedback');
    }
  };

  // Format the date for display
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleEditHomework = (homework: Homework) => {
    setSelectedHomework(homework);
    setEditedHomeworkTitle(homework.title);
    setEditedHomeworkDescription(homework.description || '');
    setEditedAllowTextSubmission(homework.allowTextSubmission);
    setEditedAllowFileSubmission(homework.allowFileSubmission);
    setIsFieldsModified(false);
    setShowHomeworkModal(true);
  };

  // Update handlers for editable fields
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditedHomeworkTitle(e.target.value);
    setIsFieldsModified(true);
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedHomeworkDescription(e.target.value);
    setIsFieldsModified(true);
  };

  const handleCloseModal = () => {
    if (isFieldsModified) {
      if (window.confirm('You have unsaved changes. Are you sure you want to close?')) {
        setShowHomeworkModal(false);
      }
    } else {
      setShowHomeworkModal(false);
    }
  };

  const handleSaveHomework = async () => {
    if (!selectedHomework) return;
    
    try {
      setIsSavingHomework(true);
      
      // Update the homework in the database
      const updatedHomework = {
        ...selectedHomework,
        title: editedHomeworkTitle,
        description: editedHomeworkDescription,
        allowTextSubmission: editedAllowTextSubmission,
        allowFileSubmission: editedAllowFileSubmission
      };
      
      // Update the homework in Firebase
      await updateHomework(updatedHomework.id, {
        title: editedHomeworkTitle,
        description: editedHomeworkDescription,
        allowTextSubmission: editedAllowTextSubmission,
        allowFileSubmission: editedAllowFileSubmission
      });
      
      // Update local state
      setHomeworkList(prev => 
        prev.map(hw => hw.id === updatedHomework.id ? updatedHomework : hw)
      );
      
      // Update the selected homework
      setSelectedHomework(updatedHomework);
      
      // Reset fields modified flag
      setIsFieldsModified(false);
      
      // Show success message
      toast.success('Homework updated');
      
      // Trigger refresh if needed
      if (onAddSuccess) {
        onAddSuccess();
      }
    } catch (error) {
      console.error('Error updating homework:', error);
      toast.error('Failed to update homework');
    } finally {
      setIsSavingHomework(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="py-2 flex justify-center">
        <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  return (
    <div className="mt-4 w-full overflow-hidden" style={{ position: 'relative', zIndex: 10, boxSizing: 'border-box', maxWidth: '100%' }}>
      <div className="flex justify-between items-center">
        <div className={styles.card.label}>{t.homework}</div>
        {isAdmin && (
          <a 
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handleAddHomework();
            }}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {t.addHomework}
          </a>
        )}
      </div>
      
      {/* Add Homework Form */}
      {isAdmin && showAddForm && (
        <div className="mt-2 bg-gray-50 p-3 rounded-md border border-gray-200">
          <HomeworkForm
            classId={classId}
            classDate={classDate}
            onSuccess={handleHomeworkAdded}
            onCancel={handleCloseForm}
          />
        </div>
      )}
      
      {/* Homework List */}
      {!showAddForm && (
        <div className="mt-2">
          {homeworkList.length === 0 ? (
            <p className="text-gray-700 text-sm">{t.noHomeworkAssignments}</p>
          ) : (
            <div className="space-y-2">
              {homeworkList.map((homework) => (
                <div key={homework.id} className="flex items-center group">
                  <div className="flex items-center flex-1">
                    <a 
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        handleEditHomework(homework);
                      }}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <span className="text-sm truncate">{homework.title}</span>
                    </a>
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(homework.id)}
                        disabled={deletingId === homework.id}
                        className="ml-2 text-red-500 hover:text-red-700 transition-colors duration-200 bg-transparent border-0 p-0"
                        title={t.delete}
                      >
                        {deletingId === homework.id ? (
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <FaTrash className="h-2.5 w-2.5" />
                        )}
                      </button>
                    )}
                    {isAdmin && (
                      <HomeworkSubmissionBadge 
                        homeworkId={homework.id} 
                        isAdmin={isAdmin} 
                        isExpanded={false}
                        onToggleExpand={() => {}}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Homework Details Modal */}
      {showHomeworkModal && selectedHomework && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={handleCloseModal}>
          <div className="bg-white rounded-lg shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-semibold text-gray-900">{selectedHomework.title}</h3>
              <button 
                onClick={handleCloseModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path>
                </svg>
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <div className="text-sm font-medium text-gray-700">{t.dueDate}:</div>
                <div className="text-gray-900">{formatDate(selectedHomework.classDate)}</div>
              </div>
              
              {isAdmin ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="homework-title">
                      {t.homeworkTitle}
                    </label>
                    <input
                      type="text"
                      id="homework-title"
                      value={editedHomeworkTitle}
                      onChange={handleTitleChange}
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                      placeholder={t.homeworkTitle}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="homework-description">
                      {t.homeworkDescription}
                    </label>
                    <textarea
                      id="homework-description"
                      value={editedHomeworkDescription}
                      onChange={handleDescriptionChange}
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                      placeholder={t.homeworkDescription}
                      rows={4}
                    />
                  </div>
                  
                  <div className="flex space-x-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="allow-text"
                        checked={editedAllowTextSubmission}
                        onChange={(e) => {
                          setEditedAllowTextSubmission(e.target.checked);
                          setIsFieldsModified(true);
                        }}
                        className="mr-2"
                      />
                      <label htmlFor="allow-text" className="text-sm text-gray-700">
                        {t.allowTextSubmission}
                      </label>
                    </div>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="allow-file"
                        checked={editedAllowFileSubmission}
                        onChange={(e) => {
                          setEditedAllowFileSubmission(e.target.checked);
                          setIsFieldsModified(true);
                        }}
                        className="mr-2"
                      />
                      <label htmlFor="allow-file" className="text-sm text-gray-700">
                        {t.allowFileSubmission}
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <div className="text-sm font-medium text-gray-700">{t.homeworkDescription}:</div>
                  <div className="mt-1 text-gray-900 whitespace-pre-line">{selectedHomework.description}</div>
                </div>
              )}
              
              {selectedHomework.documents && selectedHomework.documents.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-700">{t.materials}:</div>
                  <ul className="bg-gray-50 rounded border border-gray-200 divide-y divide-gray-200 mt-1">
                    {selectedHomework.documents.map((doc, index) => (
                      <li key={index} className="p-2 flex items-center justify-between">
                        <a 
                          href={doc.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-blue-600 hover:underline truncate mr-2 flex-1"
                        >
                          {doc.name}
                        </a>
                        <span className="text-gray-500 text-sm whitespace-nowrap">
                          ({(doc.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {isAdmin && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-1">{t.homeworkSubmissions}:</div>
                  <HomeworkSubmissionsManager 
                    homeworkId={selectedHomework.id} 
                    onEditFeedback={(submissionId, currentFeedback, currentGrade) => {
                      setEditingSubmissionId(submissionId);
                      setFeedback(currentFeedback || '');
                      setGrade(currentGrade || '');
                    }}
                  />
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-200 flex justify-end space-x-2">
              {isAdmin && (
                <button 
                  onClick={handleSaveHomework}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center"
                  disabled={isSavingHomework || !isFieldsModified}
                >
                  {isSavingHomework ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {t.saving}
                    </>
                  ) : (
                    t.saveChanges
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Feedback Modal */}
      {editingSubmissionId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-lg w-full">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">{t.submitFeedback}</h3>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="grade">
                  {t.grade}
                </label>
                <input
                  type="text"
                  id="grade"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-sm"
                  placeholder={t.grade}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="feedback">
                  {t.feedback}
                </label>
                <textarea
                  id="feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-sm"
                  placeholder={t.feedback}
                  rows={4}
                />
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-200 flex justify-end space-x-2">
              <button 
                onClick={() => setEditingSubmissionId(null)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                {t.cancel}
              </button>
              <button 
                onClick={handleSubmitFeedback}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {t.submitFeedback}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper component to manage student submissions
interface HomeworkSubmissionsManagerProps {
  homeworkId: string;
  onEditFeedback: (submissionId: string, feedback?: string, grade?: string) => void;
}

const HomeworkSubmissionsManager: React.FC<HomeworkSubmissionsManagerProps> = ({
  homeworkId,
  onEditFeedback
}) => {
  const { language } = useLanguage();
  const t = useTranslation(language);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchSubmissions = async () => {
      try {
        setLoading(true);
        const data = await getHomeworkSubmissions(homeworkId);
        setSubmissions(data);
      } catch (error) {
        console.error('Error fetching submissions:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchSubmissions();
  }, [homeworkId]);
  
  if (loading) {
    return <p className="text-xs text-gray-500">{t.loading}</p>;
  }
  
  if (submissions.length === 0) {
    return (
      <div className="bg-gray-50 p-2 rounded-md text-xs text-gray-600 flex items-center">
        <FaInbox className="mr-2 h-3 w-3" />
        <p>{t.noSubmissionsYet}</p>
      </div>
    );
  }
  
  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  return (
    <div className="space-y-2">
      {submissions.map((submission) => (
        <div key={submission.id} className="bg-gray-50 p-2 rounded-md">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm font-medium">{submission.studentName || submission.studentEmail}</div>
              <div className="text-xs text-gray-500">
                {t.submittedOn}: {formatDate(submission.submittedAt)}
              </div>
            </div>
            <button
              onClick={() => onEditFeedback(submission.id, submission.feedback, submission.grade)}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              {submission.feedback ? t.edit : t.submitFeedback}
            </button>
          </div>
          
          {submission.feedback && (
            <div className="mt-2 text-sm">
              <div className="font-medium">{t.feedback}:</div>
              <div className="text-gray-700">{submission.feedback}</div>
              {submission.grade && (
                <div className="mt-1">
                  <span className="font-medium">{t.grade}:</span> {submission.grade}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}; 