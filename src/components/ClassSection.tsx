import React, { useState } from 'react';
import { ClassSession } from '../utils/scheduleUtils';
import { ClassMaterial } from '../types/interfaces';
import { styles } from '../styles/styleUtils';
import { FaFilePdf, FaLink, FaPlus, FaTrash } from 'react-icons/fa';
import { PencilIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import Modal from './Modal';
import { UploadMaterialsForm } from './UploadMaterialsForm';
import { debugLog, debugMaterials, debugClassSession } from '../utils/debugUtils';

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
  getNextClassDate: (classSession: ClassSession) => Date | null;
  getPreviousClassDate: (classSession: ClassSession) => Date | null;
  onEditNotes: (classSession: ClassSession) => void;
  onSaveNotes: (classSession: ClassSession) => void;
  onCancelEditNotes: (classId: string) => void;
  onEditPrivateNotes: (classSession: ClassSession) => void;
  onSavePrivateNotes: (classSession: ClassSession) => void;
  onCancelEditPrivateNotes: (classId: string) => void;
  onDeleteMaterial: (material: ClassMaterial, index: number, classId: string, type: 'slides' | 'link', itemIndex?: number) => void;
  onOpenUploadForm: (classId: string) => void;
  onCloseUploadForm: () => void;
  visibleUploadForm: string | null;
  textareaRefs: { [key: string]: HTMLTextAreaElement | null };
  pageSize: number;
  currentPage: number;
  onPageChange: (newPage: number) => void;
  sectionRef: React.RefObject<HTMLDivElement | null>;
  t: any;
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
  getNextClassDate,
  getPreviousClassDate,
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
  t
}: ClassSectionProps) => {
  const [activeTooltips, setActiveTooltips] = useState<{[key: string]: boolean}>({});
  
  const toggleTooltip = (key: string) => {
    setActiveTooltips(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Add debugging logs
  debugLog(`ClassSection rendering: ${title}`);
  debugLog(`Classes count: ${classes.length}`);
  
  // Calculate pagination
  const startIndex = currentPage * pageSize;
  const endIndex = startIndex + pageSize;
  const displayedClasses = classes.slice(startIndex, endIndex);
  const hasMore = startIndex + pageSize < classes.length;
  
  // More debugging logs
  debugLog(`Displayed classes count: ${displayedClasses.length}`);
  
  // Log materials for each class
  displayedClasses.forEach((classSession, index) => {
    debugClassSession(classSession, index);
    debugMaterials(classSession.id, classMaterials[classSession.id], 'classMaterials prop');
    debugMaterials(classSession.id, classSession.materials, 'class.materials property');
  });

  const renderUploadMaterialsSection = (classSession: ClassSession, date: Date) => (
    <Modal isOpen={visibleUploadForm === classSession.id} onClose={onCloseUploadForm}>
      <UploadMaterialsForm
        classId={classSession.id}
        classDate={date}
        studentEmails={classSession.studentEmails}
        onUploadSuccess={onCloseUploadForm}
      />
    </Modal>
  );

  return (
    <div className="max-w-2xl" ref={sectionRef}>
      <h2 className={styles.headings.h2}>{title}</h2>
      <div className="mt-4 space-y-4">
        {displayedClasses.length === 0 ? (
          <p className="text-gray-500">{title === t.upcomingClasses ? t.noUpcomingClasses : t.noPastClasses}</p>
        ) : (
          <>
            {displayedClasses.map((classSession) => {
              // Debug each class session
              debugClassSession(classSession, displayedClasses.indexOf(classSession));
              debugMaterials(classSession.id, classMaterials[classSession.id], 'classMaterials prop');
              debugMaterials(classSession.id, classSession.materials, 'class.materials property');
              
              const date = title === t.upcomingClasses 
                ? getNextClassDate(classSession) 
                : getPreviousClassDate(classSession);
              
              return (
                <div key={classSession.id} className={styles.card.container}>
                  <div className="flex justify-between items-start w-full">
                    <div className="w-full">
                      <div className="text-sm font-bold text-black mb-2">
                        {formatClassDate(date)}
                      </div>
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
                              onClick={() => toggleTooltip(`notes-${classSession.id}`)}
                            />
                            <span className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 w-36 p-1.5 bg-gray-800 text-white text-xs rounded shadow-lg ${activeTooltips[`notes-${classSession.id}`] ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} z-10 whitespace-normal pointer-events-none transition-opacity duration-150 normal-case`}>
                              {t.notesInfo || 'Notes will be shared with students'}
                              <span className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-800"></span>
                            </span>
                          </span>
                        </div>
                        
                        {editingNotes[classSession.id] !== undefined ? (
                          <div className="mt-1 w-full">
                            <textarea
                              ref={(el) => { textareaRefs[classSession.id] = el; }}
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
                              onClick={() => toggleTooltip(`private-notes-${classSession.id}`)}
                            />
                            <span className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 w-36 p-1.5 bg-gray-800 text-white text-xs rounded shadow-lg ${activeTooltips[`private-notes-${classSession.id}`] ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} z-10 whitespace-normal pointer-events-none transition-opacity duration-150 normal-case`}>
                              {t.privateNotesInfo || 'Private notes will not be shared with students'}
                              <span className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-800"></span>
                            </span>
                          </span>
                        </div>
                        
                        {editingPrivateNotes[classSession.id] !== undefined ? (
                          <div className="mt-1 w-full">
                            <textarea
                              ref={(el) => { textareaRefs[`private_${classSession.id}`] = el; }}
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
                      {(classMaterials[classSession.id]?.length > 0 || (classSession.materials && classSession.materials.length > 0)) && (
                        <div className="mt-3">
                          <div className="flex justify-between items-center">
                            <div className={styles.card.label}>{t.materials || "Materials"}</div>
                            {isAdmin && (
                              <a 
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  onOpenUploadForm(classSession.id);
                                }}
                                className="text-sm text-blue-600 hover:text-blue-800"
                              >
                                {t.addMaterials}
                              </a>
                            )}
                          </div>
                          <div className="mt-1 space-y-2">
                            {/* Display materials - prioritize class.materials, fall back to classMaterials */}
                            {((classSession.materials && classSession.materials.length > 0) 
                              ? classSession.materials 
                              : classMaterials[classSession.id] || []
                            ).map((material, index) => (
                              <div key={`material-${index}`} className="flex flex-col space-y-2">
                                {material.slides && material.slides.length > 0 && (
                                  <div className="space-y-1">
                                    {material.slides.map((slideUrl: string, slideIndex: number) => (
                                      <a 
                                        key={slideIndex}
                                        href={slideUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex items-center text-blue-600 hover:text-blue-800 group"
                                      >
                                        <FaFilePdf className="mr-2" />
                                        <span className="text-sm">{t.slides || "Slides"} {material.slides && material.slides.length > 1 ? `(${slideIndex + 1}/${material.slides.length})` : ''}</span>
                                        {isAdmin && (
                                          <button
                                            onClick={(e) => {
                                              e.preventDefault();
                                              onDeleteMaterial(material, index, classSession.id, 'slides', slideIndex);
                                            }}
                                            disabled={deletingMaterial[material.classId + index + '_slide_' + slideIndex]}
                                            className="ml-2 text-red-500 hover:text-red-700 transition-colors duration-200 bg-transparent border-0 p-0"
                                            title="Delete material"
                                          >
                                            <FaTrash className="h-2.5 w-2.5" />
                                          </button>
                                        )}
                                      </a>
                                    ))}
                                  </div>
                                )}
                                
                                {material.links && material.links.length > 0 && (
                                  <div className="space-y-1">
                                    {material.links.map((link: string, linkIndex: number) => (
                                      <a 
                                        key={linkIndex}
                                        href={link} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex items-center text-blue-600 hover:text-blue-800 group"
                                      >
                                        <FaLink className="mr-2" />
                                        <span className="text-sm truncate max-w-[200px]">{link}</span>
                                        {isAdmin && (
                                          <button
                                            onClick={(e) => {
                                              e.preventDefault();
                                              onDeleteMaterial(material, index, classSession.id, 'link', linkIndex);
                                            }}
                                            disabled={deletingMaterial[material.classId + index + '_link_' + linkIndex]}
                                            className="ml-2 text-red-500 hover:text-red-700 transition-colors duration-200 bg-transparent border-0 p-0"
                                            title="Delete link"
                                          >
                                            <FaTrash className="h-2.5 w-2.5" />
                                          </button>
                                        )}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Add Materials Link */}
                      {isAdmin && (!classMaterials[classSession.id] || classMaterials[classSession.id].length === 0) && (
                        <div className="mt-3">
                          <a 
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              onOpenUploadForm(classSession.id);
                            }}
                            className="flex items-center text-blue-600 hover:text-blue-800"
                          >
                            <FaPlus className="mr-2" />
                            <span className="text-sm">{t.addMaterials || 'Add Materials'}</span>
                          </a>
                        </div>
                      )}
                      {isAdmin && renderUploadMaterialsSection(classSession, title === t.upcomingClasses ? getNextClassDate(classSession) || new Date() : getPreviousClassDate(classSession) || new Date())}
                    </div>
                  </div>
                </div>
              );
            })}
            
            {/* Pagination controls */}
            <div className="flex justify-between items-center mt-4">
              <button
                onClick={() => onPageChange(Math.max(0, currentPage - 1))}
                disabled={currentPage === 0}
                className={`px-3 py-1 rounded ${
                  currentPage === 0
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                {t.previous || 'Previous'}
              </button>
              
              <span className="text-sm text-gray-600">
                {startIndex + 1}-{Math.min(startIndex + pageSize, classes.length)} {t.of} {classes.length}
              </span>
              
              <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={!hasMore}
                className={`px-3 py-1 rounded ${
                  !hasMore
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                {t.next || 'Next'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}; 