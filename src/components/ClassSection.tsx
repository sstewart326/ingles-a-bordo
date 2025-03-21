import React, { useState } from 'react';
import { ClassSession } from '../utils/scheduleUtils';
import { ClassMaterial, Homework } from '../types/interfaces';
import { styles } from '../styles/styleUtils';
import { FaLink, FaTrash, FaFilePowerpoint } from 'react-icons/fa';
import { PencilIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import Modal from './Modal';
import { UploadMaterialsForm } from './UploadMaterialsForm';
import { debugMaterials, debugClassSession } from '../utils/debugUtils';
import { HomeworkManager } from './HomeworkManager';

// We can now use ClassSession directly since it includes all the properties we need
type ExtendedClassSession = ClassSession;

interface ClassSectionProps {
  title: string;
  classes: ClassSession[];
  classMaterials: Record<string, ClassMaterial[]>;
  editingNotes: { [classId: string]: string };
  savingNotes: { [classId: string]: boolean };
  editingPrivateNotes: { [classId: string]: string };
  savingPrivateNotes: { [classId: string]: boolean };
  deletingMaterial: { [materialId: string]: boolean };
  isAdmin: boolean;
  formatStudentNames: (studentEmails: string[]) => string;
  formatClassTime: (classSession: ClassSession) => string;
  formatClassDate: (date: Date | null) => string;
  onEditNotes: (classSession: ClassSession) => void;
  onSaveNotes: (classSession: ClassSession) => void;
  onCancelEditNotes: (classId: string) => void;
  onEditPrivateNotes: (classSession: ClassSession) => void;
  onSavePrivateNotes: (classSession: ClassSession) => void;
  onCancelEditPrivateNotes: (classId: string) => void;
  onDeleteMaterial: (material: ClassMaterial, index: number, classId: string, type?: 'slides' | 'link', itemIndex?: number) => void;
  onOpenUploadForm: (classId: string) => void;
  onCloseUploadForm: () => void;
  visibleUploadForm: string | null;
  textareaRefs: { [key: string]: HTMLTextAreaElement | null };
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  sectionRef: React.RefObject<HTMLDivElement | null>;
  selectedDate?: Date;
  homeworkByClassId?: Record<string, Homework[]>;
  refreshHomework?: () => Promise<void>;
  hideDateDisplay?: boolean;
  noContainer?: boolean; // Add this prop to optionally hide the container
  t: {
    upcomingClasses: string;
    pastClasses: string;
    noUpcomingClasses: string;
    noPastClasses: string;
    addNotes: string;
    addPrivateNotes: string;
    materials: string;
    addMaterials: string;
    slides: string;
    link: string;
    previous: string;
    next: string;
    notes: string;
    notesInfo: string;
    cancel: string;
    noNotes: string;
    edit: string;
    privateNotes: string;
    privateNotesInfo: string;
  };
}

export const ClassSection = ({
  title,
  classes,
  classMaterials,
  editingNotes,
  savingNotes,
  editingPrivateNotes,
  savingPrivateNotes,
  deletingMaterial,
  isAdmin,
  formatStudentNames,
  formatClassTime,
  formatClassDate,
  onEditNotes,
  onSaveNotes,
  onCancelEditNotes,
  onEditPrivateNotes,
  onSavePrivateNotes,
  onCancelEditPrivateNotes,
  onDeleteMaterial,
  onOpenUploadForm,
  onCloseUploadForm,
  visibleUploadForm,
  textareaRefs,
  pageSize,
  currentPage,
  onPageChange,
  sectionRef,
  selectedDate,
  refreshHomework,
  hideDateDisplay = false,
  noContainer = false, // Default to false to maintain backward compatibility
  t
}: ClassSectionProps) => {
  const [activeTooltips, setActiveTooltips] = useState<{[key: string]: boolean}>({});
  
  const toggleTooltip = (key: string) => {
    setActiveTooltips(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };
  
  // Calculate pagination
  const startIndex = currentPage * pageSize;
  const endIndex = startIndex + pageSize;
  
  // Create an expanded list of classes with separate entries for each date
  const expandedClasses: ClassSession[] = [];
  classes.forEach(classSession => {
    // If the class already has _displayDate set (like in DayDetails), use it directly
    if (classSession._displayDate) {
      expandedClasses.push(classSession);
      return;
    }
    
    const dates = classSession.dates || [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const nowTime = now.getTime();
    
    // Calculate dates for 7 days ago and 7 days from now
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    const sevenDaysAgoTime = sevenDaysAgo.getTime();
    
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(now.getDate() + 7);
    const sevenDaysFromNowTime = sevenDaysFromNow.getTime();
    
    let relevantDates: Date[] = [];
    if (title === t.upcomingClasses) {
      // Get all upcoming dates for upcoming classes within the next 7 days
      relevantDates = dates
        .map(d => d instanceof Date ? d : new Date(d))
        .filter(dateTime => {
          dateTime.setHours(0, 0, 0, 0);
          return dateTime.getTime() >= nowTime && dateTime.getTime() <= sevenDaysFromNowTime;
        })
        .sort((a, b) => a.getTime() - b.getTime()); // Sort chronologically
    } else {
      // Get all past dates for past classes within the last 7 days
      relevantDates = dates
        .map(d => d instanceof Date ? d : new Date(d))
        .filter(dateTime => {
          dateTime.setHours(0, 0, 0, 0);
          return dateTime.getTime() < nowTime && dateTime.getTime() >= sevenDaysAgoTime;
        })
        .sort((a, b) => b.getTime() - a.getTime()); // Sort reverse chronologically (most recent first)
    }
    
    // Add each date as a separate class entry
    if (relevantDates.length > 0) {
      relevantDates.forEach(date => {
        // Create a new class object with the correct dayOfWeek for the date
        const updatedClass = {
          ...classSession,
          _displayDate: date, // Add the display date
          dayOfWeek: date.getDay(), // Set the correct dayOfWeek based on the date
          // Convert dates back to strings for compatibility
          dates: classSession.dates?.map(d => d instanceof Date ? d.toISOString() : d)
        };
        expandedClasses.push(updatedClass);
      });
    }
  });
  
  // Sort the expanded classes by date
  if (title === t.upcomingClasses) {
    // Sort upcoming classes by date (closest first)
    expandedClasses.sort((a, b) => {
      const dateA = (a as any)._displayDate?.getTime() || 0;
      const dateB = (b as any)._displayDate?.getTime() || 0;
      return dateA - dateB;
    });
  } else {
    // Sort past classes by date (most recent first)
    expandedClasses.sort((a, b) => {
      const dateA = (a as any)._displayDate?.getTime() || 0;
      const dateB = (b as any)._displayDate?.getTime() || 0;
      return dateB - dateA;
    });
  }
  
  // Use the expanded classes for pagination
  const displayedClasses = expandedClasses.slice(startIndex, endIndex);
  const totalPages = Math.ceil(expandedClasses.length / pageSize);
  
  // Log only the first class's materials to avoid spam
  if (displayedClasses.length > 0) {
    const firstClass = displayedClasses[0];
    debugClassSession(firstClass, 0);
    if (classMaterials[firstClass.id]) {
      debugMaterials(firstClass.id, classMaterials[firstClass.id], 'classMaterials prop');
    }
  }

  const handlePageChange = (newPage: number) => {
    if (newPage >= 0 && newPage < totalPages) {
      onPageChange(newPage);
    }
  };

  const renderUploadMaterialsSection = (classSession: ClassSession, date: Date | null | undefined) => {
    // Use the provided date, falling back to selectedDate or current date if not available
    const dateToUse = date instanceof Date ? date : (selectedDate || new Date());
    
    // Create a UTC date to avoid timezone issues
    const year = dateToUse.getFullYear();
    const month = dateToUse.getMonth();
    const day = dateToUse.getDate();
    const utcDate = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
    
    // Create a unique ID for this class-date combination
    const uniqueId = `${classSession.id}-${dateToUse.getTime()}`;
    
    return (
      <Modal isOpen={visibleUploadForm === uniqueId} onClose={onCloseUploadForm}>
        <UploadMaterialsForm
          classId={classSession.id}
          classDate={utcDate}
          studentEmails={classSession.studentEmails}
          onUploadSuccess={onCloseUploadForm}
        />
      </Modal>
    );
  };

  // Content to render
  const content = (
    <>
      {title && <h2 className={styles.headings.h2}>{title}</h2>}
      <div className="mt-4 space-y-4">
        {displayedClasses.length === 0 ? (
          <p className="text-gray-500">
            {title ? (title === t.upcomingClasses ? t.noUpcomingClasses : t.noPastClasses) : t.noUpcomingClasses}
          </p>
        ) : (
          <>
            {displayedClasses.map((classSession) => {
              // Get the date from the _displayDate property
              const date = (classSession as any)._displayDate || selectedDate || new Date();
              
              return (
                <div key={`${classSession.id}-${date.getTime ? date.getTime() : Date.now()}`} className={styles.card.container}>
                  <div className="flex justify-between items-start w-full">
                    <div className="w-full">
                      {!hideDateDisplay && (
                        <div className="text-sm font-bold text-black mb-2">
                          {formatClassDate(date)}
                        </div>
                      )}
                      <div className={styles.card.title}>
                        {formatStudentNames(classSession.studentEmails)}
                      </div>
                      <div className={styles.card.subtitle}>
                        {formatClassTime(classSession)}
                      </div>
                      
                      {/* Notes section */}
                      <div className="mt-4 w-full">
                        <div className={styles.card.label}>
                          {t.notes || 'Notes'}
                          <span className="inline-block ml-1 relative group">
                            <InformationCircleIcon 
                              className="h-4 w-4 text-gray-400 inline-block hover:text-gray-600 cursor-pointer" 
                              onClick={() => toggleTooltip(`notes-${classSession.id}-${date.getTime()}`)}
                            />
                            <span className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 w-36 p-1.5 bg-gray-800 text-white text-xs rounded shadow-lg ${activeTooltips[`notes-${classSession.id}-${date.getTime()}`] ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} z-10 whitespace-normal pointer-events-none transition-opacity duration-150 normal-case`}>
                              {t.notesInfo || 'Notes will be shared with students'}
                              <span className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-800"></span>
                            </span>
                          </span>
                        </div>
                        
                        {editingNotes[classSession.id] !== undefined ? (
                          <div className="mt-1 w-full">
                            <textarea
                              ref={(el) => { textareaRefs[`${classSession.id}-${date.getTime()}-notes`] = el; }}
                              defaultValue={editingNotes[classSession.id]}
                              className="w-full p-2 border border-gray-300 rounded text-sm"
                              rows={3}
                            />
                            <div className="flex justify-end mt-2 space-x-2">
                              <button
                                onClick={() => onCancelEditNotes(classSession.id)}
                                className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                disabled={savingNotes[classSession.id]}
                              >
                                {t.cancel || 'Cancel'}
                              </button>
                              <button
                                onClick={() => onSaveNotes(classSession)}
                                className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                                disabled={savingNotes[classSession.id]}
                              >
                                {savingNotes[classSession.id] 
                                  ? 'Saving...' 
                                  : 'Save'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-gray-700 text-sm mt-1 flex items-center">
                            <span>{classSession.notes || (t.noNotes || 'No notes available')}</span>
                            {!editingNotes[classSession.id] && (
                              <PencilIcon
                                onClick={() => onEditNotes(classSession)}
                                className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer ml-1 flex-shrink-0"
                                title={t.edit || 'Edit'}
                              />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Private Notes section */}
                      <div className="mt-4 w-full">
                        <div className={styles.card.label}>
                          {t.privateNotes || 'Private notes'}
                          <span className="inline-block ml-1 relative group">
                            <InformationCircleIcon 
                              className="h-4 w-4 text-gray-400 inline-block hover:text-gray-600 cursor-pointer" 
                              onClick={() => toggleTooltip(`private-notes-${classSession.id}-${date.getTime()}`)}
                            />
                            <span className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 w-36 p-1.5 bg-gray-800 text-white text-xs rounded shadow-lg ${activeTooltips[`private-notes-${classSession.id}-${date.getTime()}`] ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} z-10 whitespace-normal pointer-events-none transition-opacity duration-150 normal-case`}>
                              {t.privateNotesInfo || 'Private notes will not be shared with students'}
                              <span className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-800"></span>
                            </span>
                          </span>
                        </div>
                        
                        {editingPrivateNotes[classSession.id] !== undefined ? (
                          <div className="mt-1 w-full">
                            <textarea
                              ref={(el) => { textareaRefs[`${classSession.id}-${date.getTime()}-private_notes`] = el; }}
                              defaultValue={editingPrivateNotes[classSession.id]}
                              className="w-full p-2 border border-gray-300 rounded text-sm"
                              rows={3}
                            />
                            <div className="flex justify-end mt-2 space-x-2">
                              <button
                                onClick={() => onCancelEditPrivateNotes(classSession.id)}
                                className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                disabled={savingPrivateNotes[classSession.id]}
                              >
                                {t.cancel || 'Cancel'}
                              </button>
                              <button
                                onClick={() => onSavePrivateNotes(classSession)}
                                className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                                disabled={savingPrivateNotes[classSession.id]}
                              >
                                {savingPrivateNotes[classSession.id] 
                                  ? 'Saving...' 
                                  : 'Save'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-gray-700 text-sm mt-1 flex items-center">
                            <span>{classSession.privateNotes || (t.noNotes || 'No private notes available')}</span>
                            {!editingPrivateNotes[classSession.id] && (
                              <PencilIcon
                                onClick={() => onEditPrivateNotes(classSession)}
                                className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer ml-1 flex-shrink-0"
                                title={t.edit || 'Edit'}
                              />
                            )}
                          </div>
                        )}
                      </div>
                      
                      {/* Materials Section */}
                      {/* Always show Materials section for admins, or if materials exist */}
                      {(isAdmin || 
                        (classMaterials[classSession.id] && classMaterials[classSession.id].length > 0) || 
                        (classSession.materials && classSession.materials.length > 0)
                      ) && (
                        <div className="mt-3">
                          <div className="flex justify-between items-center">
                            {/* Always show Materials title for consistency */}
                            <div className={styles.card.label}>{t.materials || "Materials"}</div>
                            {isAdmin && (
                              <a 
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  onOpenUploadForm(`${classSession.id}-${date.getTime()}`);
                                }}
                                className="text-sm text-blue-600 hover:text-blue-800"
                              >
                                {t.addMaterials}
                              </a>
                            )}
                          </div>

                          {/* Materials content */}
                          <div className="mt-2">
                            {((classMaterials[classSession.id] && classMaterials[classSession.id].length > 0) ||
                              (classSession.materials && classSession.materials.length > 0)) ? (
                              <div className="space-y-2">
                                {(() => {
                                  // First get materials from either source
                                  const materialsFromClass = classSession.materials || [];
                                  const materialsFromMap = classMaterials[classSession.id] || [];
                                  
                                  // Only log in development and not for every class
                                  if (process.env.NODE_ENV === 'development' && Math.random() < 0.1) {
                                    console.log('ClassSection - Materials for class', classSession.id, {
                                      materialsFromClass: materialsFromClass.length,
                                      materialsFromMap: materialsFromMap.length,
                                      date: date.toISOString().split('T')[0]
                                    });
                                  }
                                  
                                  // For performance, use a Set to track already added material IDs
                                  const addedMaterialIds = new Set<string>();
                                  const allMaterials: ClassMaterial[] = [];
                                  
                                  // First add materials from the class (higher priority)
                                  materialsFromClass.forEach(material => {
                                    if (material.id) {
                                      addedMaterialIds.add(material.id);
                                    }
                                    allMaterials.push(material);
                                  });
                                  
                                  // Then add materials from the map if not already added
                                  materialsFromMap.forEach(material => {
                                    if (!material.id || !addedMaterialIds.has(material.id)) {
                                      allMaterials.push(material);
                                    }
                                  });
                                  
                                  // Filter by date - create a function to avoid repeating this logic
                                  const isForCurrentDate = (material: ClassMaterial): boolean => {
                                    // If the material has no date, show it on all dates (legacy support)
                                    if (!material.classDate) return true;
                                    
                                    // Compare dates at midnight for consistency
                                    const materialDate = material.classDate instanceof Date 
                                      ? material.classDate 
                                      : new Date(material.classDate);
                                    
                                    const materialDay = new Date(materialDate.getFullYear(), materialDate.getMonth(), materialDate.getDate());
                                    const displayDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                                    
                                    return materialDay.getTime() === displayDay.getTime();
                                  };
                                  
                                  return allMaterials.filter(isForCurrentDate);
                                })().map((material, index) => (
                                  <div key={`material-${index}`} className="flex flex-col space-y-2">
                                    {material.slides && material.slides.length > 0 && (
                                      <div className="space-y-1">
                                        {material.slides.map((slideUrl: string, slideIndex: number) => (
                                          <div 
                                            key={slideIndex}
                                            className="flex items-center group"
                                          >
                                            <FaFilePowerpoint className="mr-2 text-blue-600" />
                                            <a 
                                              href={slideUrl} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:text-blue-800"
                                            >
                                              <span className="text-sm">{t.slides || "Slides"} {material.slides && material.slides.length > 1 ? `(${slideIndex + 1}/${material.slides.length})` : ''}</span>
                                            </a>
                                            {isAdmin && (
                                              <button
                                                onClick={(_) => {
                                                  onDeleteMaterial(material, index, classSession.id, 'slides', slideIndex);
                                                }}
                                                disabled={deletingMaterial[material.classId + index + '_slide_' + slideIndex]}
                                                className="ml-2 text-red-500 hover:text-red-700 transition-colors duration-200 bg-transparent border-0 p-0"
                                                title="Delete material"
                                              >
                                                <FaTrash className="h-2.5 w-2.5" />
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    
                                    {material.links && material.links.length > 0 && (
                                      <div className="space-y-1">
                                        {material.links.map((link: string, linkIndex: number) => (
                                          <div 
                                            key={linkIndex}
                                            className="flex items-center group"
                                          >
                                            <FaLink className="mr-2 text-blue-600" />
                                            <a 
                                              href={link} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:text-blue-800"
                                            >
                                              <span className="text-sm truncate max-w-[200px]">{link}</span>
                                            </a>
                                            {isAdmin && (
                                              <button
                                                onClick={(_) => {
                                                  onDeleteMaterial(material, index, classSession.id, 'link', linkIndex);
                                                }}
                                                disabled={deletingMaterial[material.classId + index + '_link_' + linkIndex]}
                                                className="ml-2 text-red-500 hover:text-red-700 transition-colors duration-200 bg-transparent border-0 p-0"
                                                title="Delete link"
                                              >
                                                <FaTrash className="h-2.5 w-2.5" />
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-gray-500 text-sm">
                                <span>No materials available</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Material upload modal */}
                      {isAdmin && renderUploadMaterialsSection(classSession, date)}

                      {/* Homework Section */}
                      <HomeworkManager
                        classId={classSession.id}
                        classDate={date} 
                        isAdmin={isAdmin}
                        onAddSuccess={refreshHomework}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            
            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="flex justify-center space-x-2 mt-4">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 0}
                  className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50"
                >
                  {t.previous || 'Previous'}
                </button>
                <span className="px-3 py-1">
                  {currentPage + 1} / {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages - 1}
                  className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50"
                >
                  {t.next || 'Next'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );

  // Conditionally render with or without the container based on the noContainer prop
  return noContainer ? (
    <div ref={sectionRef}>
      {content}
    </div>
  ) : (
    <div className="max-w-2xl bg-white rounded-lg p-6 shadow-md border border-gray-200" ref={sectionRef}>
      {content}
    </div>
  );
}; 