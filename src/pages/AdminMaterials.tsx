import { useState, useEffect, ChangeEvent, FormEvent, useCallback, useRef } from 'react';
import { getCachedCollection } from '../utils/firebaseUtils';
import { addClassMaterials, validateFile, getClassMaterials } from '../utils/classMaterialsUtils';
import { FaPlus, FaTrash } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { ClassDatePicker } from '../components/ClassDatePicker';
import { cache } from '../utils/cache';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { where } from 'firebase/firestore';
import { styles, classNames } from '../styles/styleUtils';
import { ClassMaterial, Class, User } from '../types/interfaces';
import { useSearchParams } from 'react-router-dom';

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
  const [users, setUsers] = useState<User[]>([]);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'view' | 'upload'>('view');
  const uploadSectionRef = useRef<HTMLDivElement>(null);

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
        
        // Fetch all users that are students in any class
        const allStudentEmails = new Set<string>();
        classesData.forEach(c => {
          if (c.studentEmails && c.studentEmails.length > 0) {
            c.studentEmails.forEach(email => allStudentEmails.add(email));
          }
        });

        // Only fetch users if we have student emails
        let usersData: User[] = [];
        if (allStudentEmails.size > 0) {
          try {
            usersData = await getCachedCollection<User>('users', [
              where('email', 'in', Array.from(allStudentEmails))
            ], {
              includeIds: true
            });
          } catch (error) {
            console.error('Failed to fetch users:', error);
            // Continue execution even if user fetch fails
          }
        }

        setUsers(usersData);
        
        // Validate that we have IDs and proper time format
        const validClasses = classesData.filter(c => c.id && c.startTime);
        setClasses(validClasses);
        
        // Check for date parameter
        const dateParam = searchParams.get('date');
        if (dateParam) {
          try {
            const date = new Date(dateParam);
            if (!isNaN(date.getTime())) {
              setSelectedDate(date);
            }
          } catch (error) {
            console.error('Invalid date parameter:', error);
          }
        }
        
        // Check for classId in URL parameters
        const classIdParam = searchParams.get('classId');
        if (classIdParam) {
          const classFromParam = validClasses.find(c => c.id === classIdParam);
          if (classFromParam) {
            setSelectedClass(classFromParam);
          }
        }
        
        // Check for tab parameter
        const tabParam = searchParams.get('tab');
        if (tabParam === 'upload') {
          setActiveTab('upload');
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching classes:', error);
        toast.error('Failed to load classes');
        setLoading(false);
      }
    };

    fetchClasses();
  }, [searchParams]);

  // Effect to scroll to upload section when tab is set to upload
  useEffect(() => {
    if (activeTab === 'upload' && uploadSectionRef.current) {
      // Add a small delay to ensure the component is rendered
      setTimeout(() => {
        uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [activeTab, selectedClass]);

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
            <p>{t.loading}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className={classNames(styles.headings.h1)}>{t.classMaterialsTitle}</h1>
        
        {/* Date Selection */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">{t.selectDateLabel}</h2>
          <div className="max-w-2xl mx-auto">
            <ClassDatePicker
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
              classInfo={selectedClass ? {
                ...selectedClass,
                startDate: selectedClass.startDate || { toDate: () => new Date() }
              } : { 
                id: '', 
                dayOfWeek: 0, 
                startTime: '', 
                endTime: '', 
                studentEmails: [],
                courseType: '',
                startDate: { toDate: () => new Date() }
              }}
              availableClasses={classes.map(cls => ({
                ...cls,
                startDate: cls.startDate || { toDate: () => new Date() }
              }))}
              allowPastDates={true}
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
                        // Find the student for this class
                        const student = users.find(u => classItem.studentEmails.includes(u.email));
                        const displayText = student?.name || student?.email || t.unknownEmail;
                        return (
                          <option key={classItem.id} value={classItem.id}>
                            {displayText} ({classItem.startTime} - {classItem.endTime})
                          </option>
                        );
                      })}
                  </select>
                </div>
              </div>
            )}

            {selectedClass && (
              <>
                {/* Tabs */}
                <div className="max-w-2xl mx-auto mb-6">
                  <div className="flex gap-2">
                    <button
                      className={`py-2 px-4 font-medium text-sm rounded-md bg-[var(--brand-color)] text-[var(--header-bg)] hover:bg-[var(--brand-color-dark)] hover:text-white transition-colors`}
                      onClick={() => setActiveTab('view')}
                    >
                      {t.existingMaterials || "View Materials"}
                    </button>
                    <button
                      className={`py-2 px-4 font-medium text-sm rounded-md bg-[var(--brand-color)] text-[var(--header-bg)] hover:bg-[var(--brand-color-dark)] hover:text-white transition-colors`}
                      onClick={() => setActiveTab('upload')}
                    >
                      {t.uploadMaterials || "Upload Materials"}
                    </button>
                  </div>
                </div>

                {activeTab === 'upload' && (
                  /* Materials Upload */
                  <div className="max-w-2xl mx-auto" ref={uploadSectionRef}>
                    <h2 className="text-xl font-semibold mb-6">{t.uploadMaterials}</h2>
                    
                    <div className="bg-white rounded-lg p-6 border border-gray-200">
                      <form onSubmit={handleSubmit} className="space-y-6">
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
                              file:bg-[var(--brand-color-light)] file:text-[var(--header-bg)]
                              hover:file:bg-[var(--brand-color-hover)]"
                          />
                        </div>

                        {/* Links Management */}
                        <div className="space-y-4">
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
                              className="px-4 py-2 bg-[var(--brand-color)] text-[var(--header-bg)] rounded hover:bg-[var(--brand-color-dark)]"
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
                          className="w-full bg-[var(--brand-color)] text-[var(--header-bg)] py-3 px-6 rounded-lg font-semibold
                            hover:bg-[var(--brand-color-dark)] hover:text-white disabled:bg-gray-400 disabled:cursor-not-allowed
                            transition duration-200"
                        >
                          {uploading ? t.uploading : t.uploadMaterials}
                        </button>
                      </form>
                    </div>
                  </div>
                )}

                {activeTab === 'view' && (
                  /* Existing Materials */
                  <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">{t.existingMaterials}</h2>
                    {existingMaterials.length > 0 ? (
                      <div className="space-y-4">
                        {existingMaterials.map((material, index) => (
                          <div key={index} className="p-4 border rounded-lg">
                            <div className="flex items-center justify-between">
                              <h3 className="font-medium">{t.materialsForDate} {new Date(material.classDate).toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}</h3>
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
                    ) : (
                      <div className="text-center py-8 text-gray-600">
                        {t.noMaterialsFound}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            
            {!selectedClass && (
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