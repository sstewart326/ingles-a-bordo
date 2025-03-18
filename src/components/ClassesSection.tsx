import { useRef } from 'react';
import { ClassSection } from './ClassSection';
import { ClassSession } from '../utils/scheduleUtils';
import { ClassMaterial } from '../types/interfaces';
import { Homework } from '../types/interfaces';

interface ClassesSectionProps {
  upcomingClasses: ClassSession[];
  pastClasses: ClassSession[];
  classMaterials: Record<string, ClassMaterial[]>;
  editingNotes: { [classId: string]: string };
  savingNotes: { [classId: string]: boolean };
  editingPrivateNotes: { [classId: string]: string };
  savingPrivateNotes: { [classId: string]: boolean };
  deletingMaterial: { [materialId: string]: boolean };
  isAdmin: boolean;
  isMobileView: boolean;
  upcomingClassesPage: number;
  pastClassesPage: number;
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
  onDeleteMaterial: (material: ClassMaterial, index: number, classId: string, type?: 'slides' | 'link', itemIndex?: number) => void;
  onOpenUploadForm: (classId: string) => void;
  onCloseUploadForm: () => void;
  visibleUploadForm: string | null;
  textareaRefs: { [key: string]: HTMLTextAreaElement | null };
  onUpcomingClassesPageChange: (page: number) => void;
  onPastClassesPageChange: (page: number) => void;
  selectedDate?: Date;
  homeworkByClassId?: Record<string, Homework[]>;
  refreshHomework?: () => Promise<void>;
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

export const ClassesSection = ({
  upcomingClasses,
  pastClasses,
  classMaterials,
  editingNotes,
  savingNotes,
  editingPrivateNotes,
  savingPrivateNotes,
  deletingMaterial,
  isAdmin,
  isMobileView,
  upcomingClassesPage,
  pastClassesPage,
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
  onUpcomingClassesPageChange,
  onPastClassesPageChange,
  selectedDate,
  homeworkByClassId,
  refreshHomework,
  t
}: ClassesSectionProps) => {
  const upcomingClassesSectionRef = useRef<HTMLDivElement>(null);
  const pastClassesSectionRef = useRef<HTMLDivElement>(null);

  return (
    <>
      {/* Past Classes section */}
      <div ref={pastClassesSectionRef} id="past-classes-section">
        <ClassSection
          title={t.pastClasses}
          classes={pastClasses}
          classMaterials={classMaterials}
          editingNotes={editingNotes}
          savingNotes={savingNotes}
          editingPrivateNotes={editingPrivateNotes}
          savingPrivateNotes={savingPrivateNotes}
          deletingMaterial={deletingMaterial}
          isAdmin={isAdmin}
          formatStudentNames={formatStudentNames}
          formatClassTime={formatClassTime}
          formatClassDate={formatClassDate}
          onEditNotes={onEditNotes}
          onSaveNotes={onSaveNotes}
          onCancelEditNotes={onCancelEditNotes}
          onEditPrivateNotes={onEditPrivateNotes}
          onSavePrivateNotes={onSavePrivateNotes}
          onCancelEditPrivateNotes={onCancelEditPrivateNotes}
          onDeleteMaterial={onDeleteMaterial}
          onOpenUploadForm={onOpenUploadForm}
          onCloseUploadForm={onCloseUploadForm}
          visibleUploadForm={visibleUploadForm}
          textareaRefs={textareaRefs}
          pageSize={isMobileView ? 2 : 3}
          currentPage={pastClassesPage}
          onPageChange={onPastClassesPageChange}
          sectionRef={pastClassesSectionRef}
          t={t}
          selectedDate={selectedDate}
        />
      </div>

      {/* Upcoming Classes section */}
      <div className="mt-8 lg:mt-0" ref={upcomingClassesSectionRef} id="upcoming-classes-section">
        <ClassSection
          title={t.upcomingClasses}
          classes={upcomingClasses}
          classMaterials={classMaterials}
          editingNotes={editingNotes}
          savingNotes={savingNotes}
          editingPrivateNotes={editingPrivateNotes}
          savingPrivateNotes={savingPrivateNotes}
          deletingMaterial={deletingMaterial}
          isAdmin={isAdmin}
          formatStudentNames={formatStudentNames}
          formatClassTime={formatClassTime}
          formatClassDate={formatClassDate}
          onEditNotes={onEditNotes}
          onSaveNotes={onSaveNotes}
          onCancelEditNotes={onCancelEditNotes}
          onEditPrivateNotes={onEditPrivateNotes}
          onSavePrivateNotes={onSavePrivateNotes}
          onCancelEditPrivateNotes={onCancelEditPrivateNotes}
          onDeleteMaterial={onDeleteMaterial}
          onOpenUploadForm={onOpenUploadForm}
          onCloseUploadForm={onCloseUploadForm}
          visibleUploadForm={visibleUploadForm}
          textareaRefs={textareaRefs}
          pageSize={isMobileView ? 2 : 3}
          currentPage={upcomingClassesPage}
          onPageChange={onUpcomingClassesPageChange}
          sectionRef={upcomingClassesSectionRef}
          t={t}
          selectedDate={selectedDate}
        />
      </div>
    </>
  );
}; 