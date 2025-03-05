import { ClassSession } from '../utils/scheduleUtils';
import { ClassMaterial } from '../types/interfaces';
import { styles } from '../styles/styleUtils';
import { useTranslation } from '../translations';
import { useLanguage } from '../hooks/useLanguage';
import { FaFilePdf, FaLink, FaPlus, FaTrash } from 'react-icons/fa';
import { PencilIcon } from '@heroicons/react/24/outline';
import { UploadMaterialsForm } from './UploadMaterialsForm';
import Modal from './Modal';

interface ClassSectionProps {
  title: string;
  classes: ClassSession[];
  classMaterials: Record<string, ClassMaterial[]>;
  editingNotes: { [classId: string]: string };
  savingNotes: { [classId: string]: boolean };
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
  onDeleteMaterial: (material: ClassMaterial, index: number, classId: string, type: 'slides' | 'link', itemIndex?: number) => void;
  onOpenUploadForm: (classId: string) => void;
  onCloseUploadForm: () => void;
  visibleUploadForm: string | null;
  textareaRefs: { [key: string]: HTMLTextAreaElement | null };
  pageSize: number;
  currentPage: number;
  onPageChange: (newPage: number) => void;
  sectionRef: React.RefObject<HTMLDivElement | null>;
}

export const ClassSection = ({
  title,
  classes,
  classMaterials,
  editingNotes,
  savingNotes,
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
  onDeleteMaterial,
  onOpenUploadForm,
  onCloseUploadForm,
  visibleUploadForm,
  textareaRefs,
  pageSize,
  currentPage,
  onPageChange,
  sectionRef
}: ClassSectionProps) => {
  const { language } = useLanguage();
  const t = useTranslation(language);
  const startIndex = currentPage * pageSize;
  const displayedClasses = classes.slice(startIndex, startIndex + pageSize);
  const hasMore = startIndex + pageSize < classes.length;

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
            {displayedClasses.map((classSession) => (
              <div key={classSession.id} className={styles.card.container}>
                <div className="flex justify-between items-start w-full">
                  <div className="w-full">
                    <div className="text-sm font-bold text-black mb-2">
                      {formatClassDate(title === t.upcomingClasses ? getNextClassDate(classSession) : getPreviousClassDate(classSession))}
                    </div>
                    <div className={styles.card.title}>
                      {formatStudentNames(classSession.studentEmails)}
                    </div>
                    <div className={styles.card.subtitle}>
                      {formatClassTime(classSession)}
                    </div>
                    
                    {/* Notes section */}
                    <div className="mt-2 w-full">
                      <div className={styles.card.label}>{t.notes || 'Notes'}</div>
                      
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
                    
                    {/* Materials Section */}
                    {classMaterials[classSession.id] && classMaterials[classSession.id].length > 0 && (
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
                          {classMaterials[classSession.id].map((material, index) => (
                            <div key={index} className="flex flex-col space-y-2">
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
                                      <span className="text-sm truncate">{link}</span>
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
            ))}
            
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