import React, { useState, ChangeEvent } from 'react';
import { addClassMaterials, validateFile } from '../utils/classMaterialsUtils';
import toast from 'react-hot-toast';
import { FaTrash } from 'react-icons/fa';

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
  onUploadSuccess,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [links, setLinks] = useState<string[]>([]);
  const [newLink, setNewLink] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedLink = newLink.trim();
    if (!selectedFile && trimmedLink === '') {
      toast.error('Please upload a file or add a link');
      return;
    }

    try {
      setUploading(true);
      if (selectedFile) {
        const validationError = await validateFile(selectedFile);
        if (validationError) {
          toast.error(validationError);
          return;
        }
      }

      const linksToUpload = trimmedLink ? [trimmedLink] : [];
      await addClassMaterials(
        classId,
        classDate,
        studentEmails,
        selectedFile || undefined,
        linksToUpload
      );
      toast.success('Materials uploaded successfully!');
      setSelectedFile(null);
      setNewLink('');

      if (onUploadSuccess) onUploadSuccess();
    } catch (error) {
      console.error('Failed to upload materials:', error);
      toast.error('Failed to upload materials');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLink = (index: number) => {
    const newLinks = links.filter((_, i) => i !== index);
    setLinks(newLinks);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="mb-4">
        <input
          type="file"
          onChange={handleFileChange}
          accept=".pdf,.doc,.docx,.ppt,.pptx"
          className="block w-full text-sm text-gray-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-full file:border-0
            file:text-sm file:font-semibold
            file:bg-[var(--brand-color-light)] file:text-[var(--header-bg)]
            hover:file:bg-[var(--brand-color-hover)]"
        />
      </div>

      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={newLink}
            onChange={(e) => setNewLink(e.target.value)}
            placeholder="Add a link to learning materials"
            className="flex-1 p-2 border rounded"
          />
        </div>

        <div className="space-y-2">
          {links.map((link, index) => (
            <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
              <span className="flex-1 truncate text-gray-800">{link}</span>
              <button
                type="button"
                onClick={() => handleRemoveLink(index)}
                className="text-red-500 hover:text-red-600"
              >
                <FaTrash />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={onUploadSuccess}
          className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={uploading || (!selectedFile && newLink.trim() === '')}
          className="bg-[var(--brand-color)] text-[var(--header-bg)] py-3 px-6 rounded-lg font-semibold
            hover:bg-[var(--brand-color-dark)] hover:text-white disabled:bg-gray-400 disabled:cursor-not-allowed
            transition duration-200"
        >
          {uploading ? 'Uploading...' : 'Upload Materials'}
        </button>
      </div>
    </form>
  );
};

export default UploadMaterialsForm; 