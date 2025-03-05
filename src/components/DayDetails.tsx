import { ClassSession, User } from '../utils/scheduleUtils';
import { ClassMaterial } from '../types/interfaces';
import { styles } from '../styles/styleUtils';
import { useTranslation } from '../translations';
import { useLanguage } from '../hooks/useLanguage';
import { FaFilePdf, FaLink, FaPlus, FaTrash } from 'react-icons/fa';
import { PencilIcon } from '@heroicons/react/24/outline';
import { UploadMaterialsForm } from './UploadMaterialsForm';
import Modal from './Modal';

interface DayDetailsProps {
  selectedDayDetails: {
    date: Date;
    classes: ClassSession[];
    paymentsDue: { user: User; classSession: ClassSession }[];
    materials: Record<string, ClassMaterial[]>;
    birthdays?: User[];
  } | null;
  editingNotes: { [classId: string]: string };
  savingNotes: { [classId: string]: boolean };
  deletingMaterial: { [materialId: string]: boolean };
  isAdmin: boolean;
  formatStudentNames: (studentEmails: string[]) => string;
  formatClassTime: (classSession: ClassSession) => string;
  onEditNotes: (classSession: ClassSession) => void;
  onSaveNotes: (classSession: ClassSession) => void;
  onCancelEditNotes: (classId: string) => void;
  onDeleteMaterial: (material: ClassMaterial, index: number, classId: string, type: 'slides' | 'link', itemIndex?: number) => void;
  onOpenUploadForm: (classId: string) => void;
  onCloseUploadForm: () => void;
  visibleUploadForm: string | null;
  textareaRefs: { [key: string]: HTMLTextAreaElement | null };
  onMaterialsUpdate: (classId: string, materials: ClassMaterial[]) => void;
}

export const DayDetails = ({
  selectedDayDetails,
  editingNotes,
  savingNotes,
  deletingMaterial,
  isAdmin,
  formatStudentNames,
  formatClassTime,
  onEditNotes,
  onSaveNotes,
  onCancelEditNotes,
  onDeleteMaterial,
  onOpenUploadForm,
  onCloseUploadForm,
  visibleUploadForm,
  textareaRefs,
  onMaterialsUpdate
}: DayDetailsProps) => {
  const { language } = useLanguage();
  const t = useTranslation(language);

  const renderUploadMaterialsSection = (classSession: ClassSession, date: Date) => (
    <Modal isOpen={visibleUploadForm === classSession.id} onClose={onCloseUploadForm}>
      <UploadMaterialsForm
        classId={classSession.id}
        classDate={date}
        studentEmails={classSession.studentEmails}
        onUploadSuccess={onCloseUploadForm}
        onMaterialsUpdate={(materials) => onMaterialsUpdate(classSession.id, materials)}
      />
    </Modal>
  );

  if (!selectedDayDetails) {
    return (
      <div className="bg-white shadow-md rounded-lg p-4">
        <p className="text-gray-500 text-center py-8">{t.selectDayToViewDetails}</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-md rounded-lg p-4 max-w-md">
      <h2 className={`${styles.headings.h2} text-black mb-4`}>
        {t.dayDetails || 'Day Details'}
      </h2>
      <h3 className={`${styles.headings.h3} text-black`}>
        {selectedDayDetails.date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en', { 
          weekday: 'long', 
          month: 'long', 
          day: 'numeric' 
        })}
      </h3>
      
      {/* Birthdays Section */}
      {selectedDayDetails.birthdays && selectedDayDetails.birthdays.length > 0 && (
        <div className="mt-4 mb-4">
          <div className="flex items-center text-pink-500 mb-2">
            <span className="text-xl mr-2">🎉</span>
            <span className="font-semibold">
              {selectedDayDetails.birthdays.length === 1 ? t.birthday : t.birthdays}
            </span>
          </div>
          <div className="space-y-1">
            {selectedDayDetails.birthdays.map(user => (
              <div key={user.id} className="text-gray-700">
                {user.name}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {selectedDayDetails.classes.length > 0 ? (
        <div className="mt-4 space-y-4">
          {selectedDayDetails.classes.map((classSession) => (
            <div key={classSession.id} className={styles.card.container}>
              <div className="flex justify-between items-start w-full">
                <div className="w-full">
                  <div className="text-sm font-bold text-black mb-2">
                    {selectedDayDetails.date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en', { 
                      weekday: 'long', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
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
                  {selectedDayDetails.materials[classSession.id] && selectedDayDetails.materials[classSession.id].length > 0 && (
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
                        {selectedDayDetails.materials[classSession.id].map((material, index) => (
                          <div key={index} className="flex flex-col space-y-2">
                            {material.slides && material.slides.length > 0 && (
                              <div className="space-y-1">
                                {material.slides.map((slideUrl, slideIndex) => (
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
                                {material.links.map((link, linkIndex) => (
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
                  
                  {/* Add materials link when no materials exist */}
                  {isAdmin && (!selectedDayDetails.materials[classSession.id] || selectedDayDetails.materials[classSession.id].length === 0) && (
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
                        <span className="text-sm">{t.addMaterials}</span>
                      </a>
                    </div>
                  )}
                  {isAdmin && renderUploadMaterialsSection(classSession, selectedDayDetails.date)}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-gray-500">{t.noClassesScheduled}</p>
      )}
      
      {selectedDayDetails.paymentsDue.length > 0 && (
        <div className="mt-6">
          <h3 className={styles.headings.h3}>{t.paymentsDue}</h3>
          <div className="mt-2 space-y-2">
            {selectedDayDetails.paymentsDue.map(({ user, classSession }) => (
              <div key={`${user.id}-${classSession.id}`} className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <div className="font-medium text-yellow-800">{user.name}</div>
                <div className="text-sm text-yellow-700">
                  {t.classOn} {selectedDayDetails.date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en', { weekday: 'long' })} {formatClassTime(classSession)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}; 