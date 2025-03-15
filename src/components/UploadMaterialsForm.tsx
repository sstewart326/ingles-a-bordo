import React, { useState, ChangeEvent, useEffect } from 'react';
import { addClassMaterials } from '../utils/classMaterialsUtils';
import toast from 'react-hot-toast';
import { FaTrash } from 'react-icons/fa';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';

interface UploadMaterialsFormProps {
  classId: string;
  classDate: Date;
  studentEmails: string[];
  onUploadSuccess?: () => void;
}

export const UploadMaterialsForm: React.FC<UploadMaterialsFormProps> = ({
  classId,
  classDate,
  studentEmails,
  onUploadSuccess
}) => {
  const [slideFiles, setSlideFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [newLink, setNewLink] = useState('');
  const [uploading, setUploading] = useState(false);
  const { language } = useLanguage();
  const t = useTranslation(language);

  // Add URL validation function
  const isValidUrl = (url: string): boolean => {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleSlideChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSlideFiles(prev => [...prev, ...files]);
    }
  };

  const handleRemoveSlide = (index: number) => {
    setSlideFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddLink = () => {
    const trimmedLink = newLink.trim();
    if (trimmedLink) {
      if (!isValidUrl(trimmedLink)) {
        toast.error(t.invalidUrl);
        return;
      }
      setLinks(prev => [...prev, trimmedLink]);
      setNewLink('');
    }
  };

  const handleRemoveLink = (index: number) => {
    setLinks(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);

    try {
      // Extract the date components directly to avoid timezone issues
      const year = classDate.getFullYear();
      const month = classDate.getMonth();
      const day = classDate.getDate();
      
      // Create a new date using UTC to avoid timezone issues
      const utcDate = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
      
      await addClassMaterials(classId, utcDate, studentEmails, slideFiles, links);
      toast.success('Materials uploaded successfully');
      onUploadSuccess?.();
    } catch (error) {
      console.error('Error uploading materials:', error);
      toast.error('Failed to upload materials');
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Slides Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Upload Slides
        </label>
        <input
          type="file"
          accept=".pdf,.ppt,.pptx"
          onChange={handleSlideChange}
          className="block w-full text-sm text-gray-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0
            file:text-sm file:font-semibold
            file:bg-indigo-50 file:text-indigo-700
            hover:file:bg-indigo-100"
          multiple
        />
        {slideFiles.length > 0 && (
          <div className="mt-2 space-y-2">
            {slideFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                <span className="text-sm text-gray-700">{file.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveSlide(index)}
                  className="text-red-500 hover:text-red-700"
                >
                  <FaTrash />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Links */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Add Links
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            value={newLink}
            onChange={(e) => setNewLink(e.target.value)}
            placeholder="Enter URL"
            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
          <button
            type="button"
            onClick={handleAddLink}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Add
          </button>
        </div>
        {links.length > 0 && (
          <div className="mt-2 space-y-2">
            {links.map((link, index) => (
              <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                <span className="text-sm text-gray-700 truncate">{link}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveLink(index)}
                  className="text-red-500 hover:text-red-700 ml-2"
                >
                  <FaTrash />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={uploading || (slideFiles.length === 0 && links.length === 0)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? 'Uploading...' : 'Upload Materials'}
        </button>
      </div>
    </form>
  );
};

export default UploadMaterialsForm; 