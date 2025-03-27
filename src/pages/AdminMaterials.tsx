import { useState, useEffect, ChangeEvent, FormEvent, useCallback, useRef } from 'react';
import { addClassMaterials, getClassMaterials } from '../utils/classMaterialsUtils';
import { FaPlus, FaTrash } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { ClassDatePicker } from '../components/ClassDatePicker';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { styles, classNames } from '../styles/styleUtils';
import { ClassMaterial, Class, User } from '../types/interfaces';
import { getDocs, collection } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuthWithMasquerade } from '../hooks/useAuthWithMasquerade';

const AdminMaterials = () => {
  const { language } = useLanguage();
  const t = useTranslation(language);
  const { currentUser } = useAuthWithMasquerade();
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [links, setLinks] = useState<string[]>([]);
  const [newLink, setNewLink] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [existingMaterials, setExistingMaterials] = useState<ClassMaterial[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [users] = useState<User[]>([]);
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

      // Fetch materials for the selected date using teacherId
      const materials = await getClassMaterials(selectedClass.id, date, currentUser?.uid);
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
  }, [selectedClass, selectedDate, currentUser?.uid]);

  useEffect(() => {
    if (selectedClass && selectedDate) {
      fetchMaterialsAndStudents();
    }
  }, [selectedClass, selectedDate, fetchMaterialsAndStudents]);

  const fetchClasses = async () => {
    try {
      setLoading(true);
      const classesCollection = await getDocs(collection(db, 'classes'));
      const classesData = classesCollection.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class));
      setClasses(classesData);
    } catch (error) {
      console.error('Error fetching classes:', error);
      toast.error('Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

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
    if (!selectedClass || !selectedDate) {
      toast.error('Please select a class and date');
      return;
    }

    if (!currentUser) {
      toast.error('You must be logged in to upload materials');
      return;
    }

    if (!selectedFile && links.length === 0) {
      toast.error('Please add at least one file or link');
      return;
    }

    setUploading(true);

    try {
      // Create a new date at noon UTC to avoid timezone issues
      const classDateTime = new Date(Date.UTC(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        12, 0, 0, 0
      ));

      // Warn if the selected date doesn't match the class schedule
      if (selectedClass.schedules) {
        // For classes with multiple schedules
        const matchingSchedule = selectedClass.schedules.find(s => s.dayOfWeek === selectedDate.getDay());
        if (!matchingSchedule) {
          console.warn(
            `Warning: Selected date (${selectedDate.toDateString()}) has day of week ${selectedDate.getDay()}, ` +
            `but class schedules are for days: ${selectedClass.schedules.map(s => s.dayOfWeek).join(', ')}`
          );
        }
      } else if (selectedClass.dayOfWeek !== selectedDate.getDay()) {
        // For classes with a single schedule
        console.warn(
          `Warning: Selected date (${selectedDate.toDateString()}) has day of week ${selectedDate.getDay()}, ` +
          `but class is scheduled for day ${selectedClass.dayOfWeek}`
        );
      }

      await addClassMaterials(
        selectedClass.id,
        classDateTime,
        selectedFile ? [selectedFile] : undefined,
        links,
        selectedClass.studentEmails,
        currentUser.uid
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
        <div className="mb-8 mt-6">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow p-4 pt-12 mt-4 relative">
              <h2 className="text-xl font-semibold absolute top-4 left-4">{t.selectDateLabel}</h2>
              <ClassDatePicker
                selectedDate={selectedDate}
                onDateSelect={handleDateSelect}
                classInfo={selectedClass ? {
                  ...selectedClass,
                  timezone: 'UTC',
                  startDate: selectedClass.startDate
                } : { 
                  id: '', 
                  dayOfWeek: 0, 
                  startTime: '', 
                  endTime: '', 
                  studentEmails: [],
                  timezone: 'UTC',
                  startDate: { toDate: () => new Date() }
                }}
                availableClasses={classes.map(cls => ({
                  ...cls,
                  startDate: cls.startDate
                }))}
                allowPastDates={true}
              />
            </div>
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
                        const displayText = student?.name || t.unknownEmail;
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
                                  href={material.slides[0]}
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