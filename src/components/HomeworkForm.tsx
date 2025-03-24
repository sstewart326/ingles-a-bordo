import React, { useState, ChangeEvent, FormEvent } from 'react';
import { validateHomeworkFile, addHomework } from '../utils/homeworkUtils';
import { FaTrash, FaCheck, FaUpload, FaFile } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { styles, classNames } from '../styles/styleUtils';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';

interface HomeworkFormProps {
  classId: string;
  classDate: Date;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const HomeworkForm: React.FC<HomeworkFormProps> = ({
  classId,
  classDate,
  onSuccess,
  onCancel
}) => {
  const { language } = useLanguage();
  const t = useTranslation(language);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [allowTextSubmission, setAllowTextSubmission] = useState(true);
  const [allowFileSubmission, setAllowFileSubmission] = useState(true);
  const [uploading, setUploading] = useState(false);

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
    
    if (!title.trim()) {
      toast.error(t.homeworkTitle + ' ' + t.error);
      return;
    }
    
    setUploading(true);
    
    try {
      // Normalize the date to ensure consistent date handling
      const normalizedDate = new Date(classDate);
      normalizedDate.setHours(0, 0, 0, 0);
      const formattedDate = normalizedDate.toISOString().split('T')[0];
      
      console.log(`Creating homework for class "${classId}" on date ${formattedDate}`);
      
      await addHomework(
        classId,
        title,
        description,
        normalizedDate,
        allowTextSubmission,
        allowFileSubmission,
        files
      );
      
      console.log(`Successfully created homework for class "${classId}" on ${formattedDate}`);
      toast.success(t.success);
      
      // Reset form
      setTitle('');
      setDescription('');
      setFiles([]);
      setAllowTextSubmission(true);
      setAllowFileSubmission(true);
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error creating homework:', error);
      if (error instanceof Error) {
        toast.error(error.message || t.error);
      } else {
        toast.error(t.error);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-5 mb-6">
      <h2 className="text-xl font-semibold mb-4">{t.addHomework}</h2>
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-gray-700 mb-2" htmlFor="title">
            {t.homeworkTitle}*
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={classNames("w-full px-3 py-2 border rounded-md", styles.form.input)}
            placeholder={t.homeworkTitle}
            required
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 mb-2" htmlFor="description">
            {t.homeworkDescription}
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={classNames("w-full px-3 py-2 border rounded-md", styles.form.textarea)}
            placeholder={t.homeworkDescription}
            rows={5}
          />
        </div>
        
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-gray-700">
              {t.materials}
            </label>
            <label className="inline-flex items-center cursor-pointer px-4 py-2 border border-blue-500 rounded text-blue-500 hover:bg-blue-100">
              <FaUpload className="mr-2" />
              {t.uploadMaterials}
              <input
                type="file"
                onChange={handleFileChange}
                className="hidden"
                multiple
              />
            </label>
          </div>
          
          {files.length > 0 && (
            <ul className="bg-gray-50 p-3 rounded-md">
              {files.map((file, index) => (
                <li key={index} className="flex justify-between items-center py-2 border-b last:border-b-0">
                  <div className="flex items-center">
                    <FaFile className="mr-2 text-blue-500" />
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
        
        <div className="mb-6 p-4 bg-gray-50 rounded-md">
          <h3 className="font-medium mb-3">{t.submissionType}</h3>
          
          <div className="flex items-center mb-2">
            <input
              id="allowTextSubmission"
              type="checkbox"
              checked={allowTextSubmission}
              onChange={(e) => setAllowTextSubmission(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="allowTextSubmission">
              {t.allowTextSubmission}
            </label>
          </div>
          
          <div className="flex items-center mb-2">
            <input
              id="allowFileSubmission"
              type="checkbox"
              checked={allowFileSubmission}
              onChange={(e) => setAllowFileSubmission(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="allowFileSubmission">
              {t.allowFileSubmission}
            </label>
          </div>
        </div>
        
        <div className="flex justify-end space-x-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-100"
              disabled={uploading}
            >
              {t.cancel}
            </button>
          )}
          
          <button
            type="submit"
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            disabled={uploading}
          >
            {uploading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {t.saving}
              </span>
            ) : (
              <span className="flex items-center">
                <FaCheck className="mr-2" />
                {t.addHomework}
              </span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}; 