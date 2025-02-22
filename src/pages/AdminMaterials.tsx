import { useState, useEffect, ChangeEvent, FormEvent, useCallback } from 'react';
import { getCachedCollection } from '../utils/firebaseUtils';
import { addClassMaterials, validateFile, getClassMaterials } from '../utils/classMaterialsUtils';
import { FaPlus, FaTrash } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { ClassDatePicker } from '../components/ClassDatePicker';
import { cache } from '../utils/cache';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';

interface Class {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  courseType: string;
  notes?: string;
  studentEmails: string[];
  studentIds?: string[]; // Keep for backward compatibility
}

interface ClassMaterial {
  classId: string;
  slides?: string;
  links?: string[];
  createdAt: Date;
  updatedAt: Date;
  classDate: Date;
  studentEmails: string[];
  studentIds?: string[]; // Keep for backward compatibility
}

const getNextClassDate = (classes: Class[]): Date => {
  const now = new Date();
  const today = now.getDay();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  // Sort classes by day of week and time
  const sortedClasses = [...classes].sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    
    // Convert time to minutes for comparison
    const getMinutes = (timeStr: string) => {
      const [time, period] = timeStr.trim().toUpperCase().split(' ');
      const [hours, minutes] = time.split(':').map(Number);
      let totalMinutes = hours * 60 + minutes;
      if (period === 'PM' && hours !== 12) totalMinutes += 12 * 60;
      if (period === 'AM' && hours === 12) totalMinutes = minutes;
      return totalMinutes;
    };
    
    return getMinutes(a.startTime) - getMinutes(b.startTime);
  });

  // Find the next class
  const nextClass = sortedClasses.find(c => {
    if (c.dayOfWeek > today) return true;
    if (c.dayOfWeek === today) {
      const classMinutes = (() => {
        const [time, period] = c.startTime.trim().toUpperCase().split(' ');
        const [hours, minutes] = time.split(':').map(Number);
        let totalMinutes = hours * 60 + minutes;
        if (period === 'PM' && hours !== 12) totalMinutes += 12 * 60;
        if (period === 'AM' && hours === 12) totalMinutes = minutes;
        return totalMinutes;
      })();
      return classMinutes > currentTime;
    }
    return false;
  });

  // If no class found in current week, get the first class of next week
  const targetClass = nextClass || sortedClasses[0];
  if (!targetClass) return now;

  // Calculate the target date
  const result = new Date();
  const daysToAdd = targetClass.dayOfWeek - today + (targetClass.dayOfWeek <= today ? 7 : 0);
  result.setDate(result.getDate() + daysToAdd);
  return result;
};

const AdminMaterials = () => {
  const { language } = useLanguage();
  const t = useTranslation(language);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [links, setLinks] = useState<string[]>([]);
  const [newLink, setNewLink] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [existingMaterials, setExistingMaterials] = useState<ClassMaterial[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchMaterialsAndStudents = useCallback(async () => {
    if (!selectedClass || !selectedClass.id) {
      return;
    }

    const date = new Date(selectedDate);
    if (isNaN(date.getTime())) {
      return;
    }

    try {
      setLoading(true);

      // Fetch materials for the selected date
      const materials = await getClassMaterials(selectedClass.id, date);
      // Convert materials to include studentEmails if they don't have it
      const updatedMaterials = materials.map(material => ({
        ...material,
        studentEmails: material.studentEmails || material.studentIds || []
      }));
      setExistingMaterials(updatedMaterials);

    } catch (error) {
      if (error instanceof Error) {
        toast.error(`Failed to load data: ${error.message}`);
      } else {
        toast.error('Failed to load materials');
      }
      setExistingMaterials([]);
    } finally {
      setLoading(false);
    }
  }, [selectedClass, selectedDate]);

  useEffect(() => {
    if (selectedClass && selectedDate) {
      fetchMaterialsAndStudents();
    }
  }, [selectedClass, selectedDate, fetchMaterialsAndStudents]);

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        // Clear the cache before fetching to ensure we get fresh data with IDs
        cache.clearAll();
        const classesData = await getCachedCollection<Class>('classes', [], { includeIds: true });
        
        // Validate that we have IDs and proper time format
        const invalidClasses = classesData.filter(c => {
          // Check for missing ID
          if (!c.id) return true;
          
          // Check time format
          if (!c.startTime || !c.endTime) return true;
          
          // Validate time format (both 12-hour and 24-hour)
          const validateTime = (timeStr: string) => {
            timeStr = timeStr.trim().toUpperCase();
            // 12-hour format (HH:MM AM/PM)
            if (timeStr.includes('AM') || timeStr.includes('PM')) {
              return /^(0?[1-9]|1[0-2]):[0-5][0-9]\s*(AM|PM)$/.test(timeStr);
            }
            // 24-hour format (HH:MM)
            return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr);
          };

          if (!validateTime(c.startTime) || !validateTime(c.endTime)) {
            console.error('Invalid time format for class:', { 
              id: c.id, 
              startTime: c.startTime, 
              endTime: c.endTime 
            });
            return true;
          }
          
          return false;
        });

        if (invalidClasses.length > 0) {
          console.error('Invalid classes found:', invalidClasses);
          toast.error('Error loading classes: Invalid data format');
          return;
        }
        
        setClasses(classesData);
        // Set the initial date to the next class date
        setSelectedDate(getNextClassDate(classesData));
      } catch {
        toast.error('Failed to load classes');
      } finally {
        setLoading(false);
      }
    };

    fetchClasses();
  }, []);

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    // Clear selection when date changes
    setSelectedClass(null);
    setLinks([]);
    setNewLink('');
    setExistingMaterials([]);
  };

  const handleClassSelect = (classId: string) => {
    // Validate that classes array is not empty
    if (!classes || classes.length === 0) {
      toast.error('No classes available');
      return;
    }

    // Validate that classes have proper IDs
    const classesWithoutIds = classes.filter(c => !c.id);
    if (classesWithoutIds.length > 0) {
      toast.error('Data error: Some classes are missing IDs');
      return;
    }

    const selectedClassData = classes.find(c => c.id === classId);

    if (selectedClassData) {
      setSelectedClass(selectedClassData);
    } else {
      setSelectedClass(null);
      toast.error('Could not find the selected class');
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedClass) {
      toast.error('Please select a class');
      return;
    }

    if (!selectedFile && links.length === 0) {
      toast.error('Please upload a file or add at least one link');
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

      // Create date object for the selected date and set the time from the class schedule
      const classDateTime = new Date(selectedDate);
      // Validate the date is valid before proceeding
      if (isNaN(classDateTime.getTime())) {
        toast.error('Invalid class date selected');
        return;
      }

      // Parse time handling both 12-hour and 24-hour formats
      const timeStr = selectedClass.startTime.trim().toUpperCase();
      let hours: number;
      let minutes: number;

      // Check if time is in 12-hour format (contains AM/PM)
      if (timeStr.includes('AM') || timeStr.includes('PM')) {
        const [time, period] = timeStr.split(' ');
        const [h, m] = time.split(':').map(num => parseInt(num, 10));
        
        if (isNaN(h) || isNaN(m) || h < 1 || h > 12 || m < 0 || m > 59) {
          console.error('Invalid 12-hour time values:', { hours: h, minutes: m, timeStr });
          toast.error('Invalid class time values');
          return;
        }

        // Convert to 24-hour format
        hours = h % 12;
        if (period === 'PM') hours += 12;
        minutes = m;
      } else {
        // 24-hour format
        const [h, m] = timeStr.split(':').map(num => parseInt(num, 10));
        
        if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
          console.error('Invalid 24-hour time values:', { hours: h, minutes: m, timeStr });
          toast.error('Invalid class time values');
          return;
        }

        hours = h;
        minutes = m;
      }

      // Set the time
      classDateTime.setHours(hours, minutes, 0, 0);

      // Final validation before upload
      if (isNaN(classDateTime.getTime())) {
        toast.error('Invalid date/time combination');
        return;
      }

      await addClassMaterials(
        selectedClass.id,
        classDateTime,
        selectedClass.studentEmails,
        selectedFile || undefined,
        links
      );
      toast.success('Materials uploaded successfully');
      await fetchMaterialsAndStudents();
      
      // Reset form
      setSelectedFile(null);
      setLinks([]);
      setNewLink('');
      
      // Reset file input
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch {
      console.error('Failed to upload materials');
      toast.error('Failed to upload materials');
    } finally {
      setUploading(false);
    }
  };

  const handleAddLink = () => {
    if (newLink && !links.includes(newLink)) {
      setLinks([...links, newLink]);
      setNewLink('');
    }
  };

  const handleRemoveLink = (indexToRemove: number) => {
    setLinks(prevLinks => {
      return prevLinks.filter((_, i) => i !== indexToRemove);
    });
  };

  if (loading && !selectedClass) {
    return (
      <div className="flex-1 bg-white">
        <div className="container mx-auto px-4">
          <div className="py-8 text-center">
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-white">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <h1 className="text-2xl font-bold mb-6">{t.classMaterialsTitle}</h1>
        
        {/* Date Selection */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">{t.selectDateLabel}</h2>
          <div className="max-w-2xl mx-auto">
            <ClassDatePicker
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
              classInfo={selectedClass || { id: '', dayOfWeek: 0, startTime: '', endTime: '', studentEmails: [] }}
              availableClasses={classes}
            />
          </div>
        </div>

        {selectedDate && (
          <div className="mb-8">
            {/* Class Selection Dropdown */}
            {classes.filter(c => c.dayOfWeek === selectedDate.getDay()).length > 0 && (
              <div className="max-w-2xl mx-auto mb-6">
                <h2 className="text-xl font-semibold mb-4">
                  {t.selectClass} {selectedDate.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en-US')}
                </h2>
                <div className="relative">
                  <select
                    value={selectedClass?.id || ''}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      handleClassSelect(selectedId);
                    }}
                    className="w-full p-2 border rounded-lg bg-white cursor-pointer"
                  >
                    <option value="" disabled>{t.selectClass}...</option>
                    {classes
                      .filter(c => c.dayOfWeek === selectedDate.getDay())
                      .map(classItem => {
                        const displayText = `${classItem.courseType || t.class} (${classItem.startTime} - ${classItem.endTime})`;
                        return (
                          <option key={classItem.id} value={classItem.id}>
                            {displayText}
                          </option>
                        );
                      })}
                  </select>
                </div>
              </div>
            )}

            {selectedClass ? (
              <>
                {/* Materials Upload */}
                <div className="mb-8">
                  <h2 className="text-xl font-semibold mb-4">{t.uploadMaterials}</h2>
                  
                  <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
                    {/* File Upload */}
                    <div className="mb-4">
                      <input
                        type="file"
                        onChange={handleFileChange}
                        accept=".pdf,.doc,.docx,.ppt,.pptx"
                        className="block w-full text-sm text-gray-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-full file:border-0
                          file:text-sm file:font-semibold
                          file:bg-blue-50 file:text-blue-700
                          hover:file:bg-blue-100"
                      />
                    </div>

                    {/* Links Management */}
                    <div className="space-y-4 mb-6">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newLink}
                          onChange={(e) => setNewLink(e.target.value)}
                          placeholder={t.addLinkPlaceholder}
                          className="flex-1 p-2 border rounded"
                        />
                        <button
                          type="button"
                          onClick={handleAddLink}
                          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                          <FaPlus />
                        </button>
                      </div>

                      {/* Links List */}
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

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={uploading || (!selectedFile && links.length === 0)}
                      className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold
                        hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed
                        transition duration-200"
                    >
                      {uploading ? t.uploading : t.uploadMaterials}
                    </button>
                  </form>
                </div>

                {/* Existing Materials */}
                {existingMaterials.length > 0 && (
                  <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">{t.existingMaterials}</h2>
                    <div className="space-y-4">
                      {existingMaterials.map((material, index) => (
                        <div key={index} className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between">
                            <h3 className="font-medium">{t.materialsForDate} {new Date(material.classDate).toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en-US')}</h3>
                            {material.slides && (
                              <a
                                href={material.slides}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-blue-500 hover:text-blue-600"
                              >
                                {t.downloadSlides}
                              </a>
                            )}
                          </div>
                          {material.links && material.links.length > 0 && (
                            <div className="mt-2">
                              <p className="font-medium mb-2">{t.usefulLinks}:</p>
                              <ul className="space-y-2">
                                {material.links.map((link, linkIndex) => (
                                  <li key={linkIndex} className="flex items-center gap-2 p-2 bg-gray-50 rounded hover:bg-gray-100">
                                    <a
                                      href={link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:text-blue-800 break-all"
                                    >
                                      {link}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-gray-600">
                {t.selectDateWithClass}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminMaterials; 