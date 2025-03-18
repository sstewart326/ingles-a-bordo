import React, { useState, useEffect } from 'react';
import { Homework } from '../types/interfaces';
import { getHomeworkForDate, deleteHomework, getHomeworkSubmissions, addHomeworkFeedback, getHomeworkForClass, subscribeToHomeworkChanges, updateHomework } from '../utils/homeworkUtils';
import { FaPlus, FaTrash, FaTimes, FaInbox, FaUserGraduate, FaEye } from 'react-icons/fa';
import { HomeworkForm } from './HomeworkForm';
import toast from 'react-hot-toast';
import { styles } from '../styles/styleUtils';

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
  emptyStateMessage = 'No homework assignments found.',
  onAddSuccess,
}) => {
  
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
      // Normalize date to midnight to ensure consistent comparison
      const normalizedDate = new Date(classDate);
      normalizedDate.setHours(0, 0, 0, 0);

      let homework: Homework[];
      if (classDate) {
        homework = await getHomeworkForDate(classId, normalizedDate);
      } else {
        homework = await getHomeworkForClass(classId);
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

  const handleTextSubmissionChange = (checked: boolean) => {
    setEditedAllowTextSubmission(checked);
    setIsFieldsModified(true);
  };

  const handleFileSubmissionChange = (checked: boolean) => {
    setEditedAllowFileSubmission(checked);
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
      <div className={styles.card.label}>Homework</div>
      {isAdmin && !showAddForm && (
        <a 
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleAddHomework();
          }}
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center mt-1"
        >
          <FaPlus className="mr-1 h-3 w-3" />
          <span>Add Homework</span>
        </a>
      )}
      {isAdmin && showAddForm && (
        <a 
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleCloseForm();
          }}
          className="text-sm text-gray-600 hover:text-gray-800 flex items-center mt-1"
        >
          <FaTimes className="mr-1 h-3 w-3" />
          <span>Cancel</span>
        </a>
      )}
      
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
        homeworkList.length === 0 ? (
          <p className="text-gray-700 text-sm mt-1">{emptyStateMessage}</p>
        ) : (
          <div className="mt-1 space-y-2">
            {homeworkList.map((homework) => (
              <div key={homework.id} className="border rounded-md overflow-hidden bg-white shadow-sm">
                <div className="flex justify-between bg-gray-50 p-2">
                  <div className="flex items-center">
                    <div>
                      <h4 className="font-medium text-sm">{homework.title}</h4>
                      <p className="text-xs text-gray-600">
                        {formatDate(homework.classDate)}
                      </p>
                    </div>
                    {/* Show submission badge in the header for admin */}
                    {isAdmin && (
                      <HomeworkSubmissionBadge 
                        homeworkId={homework.id} 
                        isAdmin={isAdmin} 
                        isExpanded={false}
                        onToggleExpand={() => {}}
                      />
                    )}
                  </div>
                  
                  {isAdmin && (
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEditHomework(homework)}
                        className="text-blue-500 hover:text-blue-700"
                        title="View Details"
                      >
                        <FaEye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(homework.id)}
                        className="text-red-500 hover:text-red-700"
                        title="Delete Homework"
                        disabled={deletingId === homework.id}
                      >
                        {deletingId === homework.id ? (
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <FaTrash className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
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
                <div className="text-sm font-medium text-gray-700">Due Date:</div>
                <div className="text-gray-900">{formatDate(selectedHomework.classDate)}</div>
              </div>
              
              {isAdmin ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="homework-title">
                      Title
                    </label>
                    <input
                      type="text"
                      id="homework-title"
                      value={editedHomeworkTitle}
                      onChange={handleTitleChange}
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                      placeholder="Homework title"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="homework-description">
                      Description
                    </label>
                    <textarea
                      id="homework-description"
                      value={editedHomeworkDescription}
                      onChange={handleDescriptionChange}
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                      placeholder="Description of the homework assignment"
                      rows={4}
                    />
                  </div>
                  
                  <div>
                    <span className="block text-sm font-medium text-gray-700 mb-1">Submission Options</span>
                    <div className="flex flex-col space-y-2">
                      <label className="inline-flex items-center">
                        <input 
                          type="checkbox" 
                          checked={editedAllowTextSubmission}
                          onChange={(e) => handleTextSubmissionChange(e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                        />
                        <span className="ml-2 text-sm text-gray-700">Allow text submissions</span>
                      </label>
                      <label className="inline-flex items-center">
                        <input 
                          type="checkbox" 
                          checked={editedAllowFileSubmission}
                          onChange={(e) => handleFileSubmissionChange(e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                        />
                        <span className="ml-2 text-sm text-gray-700">Allow file submissions</span>
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {selectedHomework.description && (
                    <div>
                      <div className="text-sm font-medium text-gray-700">Description:</div>
                      <div className="bg-gray-50 p-3 rounded border border-gray-200 whitespace-pre-line mt-1">
                        {selectedHomework.description}
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <div className="text-sm font-medium text-gray-700">Submission Options:</div>
                    <div className="flex space-x-4 mt-1">
                      <div className={`px-2 py-1 rounded ${selectedHomework.allowTextSubmission ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        Text: {selectedHomework.allowTextSubmission ? 'Allowed' : 'Not Allowed'}
                      </div>
                      <div className={`px-2 py-1 rounded ${selectedHomework.allowFileSubmission ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        Files: {selectedHomework.allowFileSubmission ? 'Allowed' : 'Not Allowed'}
                      </div>
                    </div>
                  </div>
                </>
              )}
              
              {selectedHomework.documents && selectedHomework.documents.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-700">Attached Files:</div>
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
                  <div className="text-sm font-medium text-gray-700 mb-1">Student Submissions:</div>
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
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Feedback Modal */}
      {editingSubmissionId && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full">
            <h3 className="text-lg font-semibold mb-4">Provide Feedback</h3>
            
            <div className="mb-4">
              <label className="block text-gray-700 mb-2" htmlFor="feedback">
                Feedback
              </label>
              <textarea
                id="feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                rows={5}
                placeholder="Provide feedback to the student..."
              />
            </div>
            
            <div className="mb-6">
              <label className="block text-gray-700 mb-2" htmlFor="grade">
                Grade (Optional)
              </label>
              <input
                id="grade"
                type="text"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="A, B, 90%, Good, etc."
              />
            </div>
            
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setEditingSubmissionId(null);
                  setFeedback('');
                  setGrade('');
                }}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitFeedback}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Submit Feedback
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
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<any | null>(null);
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  
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
    return <p className="text-xs text-gray-500">Loading submissions...</p>;
  }
  
  if (submissions.length === 0) {
    return (
      <div className="bg-gray-50 p-2 rounded-md text-xs text-gray-600 flex items-center">
        <FaInbox className="mr-2 h-3 w-3" />
        <p>No submissions yet.</p>
      </div>
    );
  }
  
  // Calculate submission statistics
  const submittedCount = submissions.length;
  const reviewedCount = submissions.filter(s => s.status === 'reviewed' || s.status === 'graded').length;
  
  // Toggle the modal
  const viewSubmissionDetails = (submission: any) => {
    setSelectedSubmission(submission);
    setShowSubmissionModal(true);
  };
  
  // Format file size
  const formatFileSize = (sizeInBytes: number) => {
    const sizeInMB = sizeInBytes / (1024 * 1024);
    return sizeInMB.toFixed(2) + ' MB';
  };
  
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
    <div className="bg-blue-50 border border-blue-100 rounded-md p-2">
      <div className="flex justify-between items-center mb-2">
        <h5 className="font-medium text-xs text-blue-800">Student Submissions</h5>
        <div className="flex items-center space-x-2">
          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
            {submittedCount} Total
          </span>
          <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-medium">
            {reviewedCount} Reviewed
          </span>
        </div>
      </div>
      
      {/* Simple list view of submissions */}
      <div className="bg-white rounded border border-blue-100 overflow-hidden">
        {submissions.map((submission) => (
          <div 
            key={submission.id}
            className="px-3 py-2 border-b border-blue-100 last:border-b-0 flex justify-between items-center hover:bg-blue-50 cursor-pointer"
            onClick={() => viewSubmissionDetails(submission)}
          >
            <div className="overflow-hidden">
              <div className="text-xs font-medium truncate">{submission.studentEmail}</div>
              <div className="text-xs text-gray-500">{formatDate(submission.submittedAt)}</div>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                submission.status === 'submitted' 
                  ? 'bg-blue-100 text-blue-800' 
                  : submission.status === 'reviewed' || submission.status === 'graded'
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {submission.status.charAt(0).toUpperCase() + submission.status.slice(1)}
                {submission.grade && ` (${submission.grade})`}
              </span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onEditFeedback(submission.id, submission.feedback, submission.grade);
                }}
                className="text-blue-600 hover:text-blue-800 text-xs font-medium"
              >
                {submission.feedback ? 'Edit' : 'Feedback'}
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {/* Submission Details Modal */}
      {showSubmissionModal && selectedSubmission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowSubmissionModal(false)}>
          <div className="bg-white rounded-lg shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-semibold text-gray-900">Submission Details</h3>
              <button 
                onClick={() => setShowSubmissionModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path>
                </svg>
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <div className="text-sm font-medium text-gray-700">Student:</div>
                <div className="text-gray-900">{selectedSubmission.studentEmail}</div>
              </div>
              
              <div>
                <div className="text-sm font-medium text-gray-700">Submitted:</div>
                <div className="text-gray-900">{formatDate(selectedSubmission.submittedAt)}</div>
              </div>
              
              <div>
                <div className="text-sm font-medium text-gray-700">Status:</div>
                <div className="text-gray-900">
                  <span className={`inline-flex items-center px-2 py-1 rounded text-sm font-medium ${
                    selectedSubmission.status === 'submitted' 
                      ? 'bg-blue-100 text-blue-800' 
                      : selectedSubmission.status === 'reviewed' || selectedSubmission.status === 'graded'
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {selectedSubmission.status.charAt(0).toUpperCase() + selectedSubmission.status.slice(1)}
                    {selectedSubmission.grade && ` (${selectedSubmission.grade})`}
                  </span>
                </div>
              </div>
              
              {selectedSubmission.textResponse && (
                <div>
                  <div className="text-sm font-medium text-gray-700">Response:</div>
                  <div className="bg-gray-50 p-3 rounded border border-gray-200 whitespace-pre-line mt-1">
                    {selectedSubmission.textResponse}
                  </div>
                </div>
              )}
              
              {selectedSubmission.files && selectedSubmission.files.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-700">Files:</div>
                  <ul className="bg-gray-50 rounded border border-gray-200 divide-y divide-gray-200 mt-1">
                    {selectedSubmission.files.map((file: any, index: number) => (
                      <li key={index} className="p-2 flex items-center justify-between">
                        <a 
                          href={file.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-blue-600 hover:underline truncate mr-2 flex-1"
                        >
                          {file.name}
                        </a>
                        <span className="text-gray-500 text-sm whitespace-nowrap">
                          ({formatFileSize(file.size)})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {selectedSubmission.feedback && (
                <div>
                  <div className="text-sm font-medium text-gray-700">Feedback:</div>
                  <div className="bg-gray-50 p-3 rounded border border-gray-200 whitespace-pre-line mt-1">
                    {selectedSubmission.feedback}
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-200 flex justify-end">
              <button 
                onClick={() => onEditFeedback(selectedSubmission.id, selectedSubmission.feedback, selectedSubmission.grade)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                {selectedSubmission.feedback ? 'Edit Feedback' : 'Add Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 