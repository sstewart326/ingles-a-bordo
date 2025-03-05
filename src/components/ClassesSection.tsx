import { useRef } from 'react';
import { ClassSection } from './ClassSection';
import { ClassSession } from '../utils/scheduleUtils';
import { ClassMaterial } from '../types/interfaces';

interface ClassesSectionProps {
  upcomingClasses: ClassSession[];
  pastClasses: ClassSession[];
  classMaterials: Record<string, ClassMaterial[]>;
  editingNotes: { [classId: string]: string };
  savingNotes: { [classId: string]: boolean };
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
  onDeleteMaterial: (material: ClassMaterial, index: number, classId: string, type?: 'slides' | 'link', itemIndex?: number) => void;
  onOpenUploadForm: (classId: string) => void;
  onCloseUploadForm: () => void;
  visibleUploadForm: string | null;
  textareaRefs: { [key: string]: HTMLTextAreaElement | null };
  onUpcomingClassesPageChange: (page: number) => void;
  onPastClassesPageChange: (page: number) => void;
  t: {
    upcomingClasses: string;
    pastClasses: string;
  };
}

export const ClassesSection = ({
  upcomingClasses,
  pastClasses,
  classMaterials,
  editingNotes,
  savingNotes,
  deletingMaterial,
  isAdmin,
  isMobileView,
  upcomingClassesPage,
  pastClassesPage,
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
  onUpcomingClassesPageChange,
  onPastClassesPageChange,
  t
}: ClassesSectionProps) => {
  const upcomingClassesSectionRef = useRef<HTMLDivElement | null>(null);
  const pastClassesSectionRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      {/* Past Classes section */}
      <div>
        <ClassSection
          title={t.pastClasses}
          classes={pastClasses}
          classMaterials={classMaterials}
          editingNotes={editingNotes}
          savingNotes={savingNotes}
          deletingMaterial={deletingMaterial}
          isAdmin={isAdmin}
          formatStudentNames={formatStudentNames}
          formatClassTime={formatClassTime}
          formatClassDate={formatClassDate}
          getNextClassDate={getNextClassDate}
          getPreviousClassDate={getPreviousClassDate}
          onEditNotes={onEditNotes}
          onSaveNotes={onSaveNotes}
          onCancelEditNotes={onCancelEditNotes}
          onDeleteMaterial={onDeleteMaterial}
          onOpenUploadForm={onOpenUploadForm}
          onCloseUploadForm={onCloseUploadForm}
          visibleUploadForm={visibleUploadForm}
          textareaRefs={textareaRefs}
          pageSize={isMobileView ? 2 : 3}
          currentPage={pastClassesPage}
          onPageChange={onPastClassesPageChange}
          sectionRef={pastClassesSectionRef}
        />
      </div>

      {/* Upcoming Classes section */}
      <div className="mt-8 lg:mt-0">
        <ClassSection
          title={t.upcomingClasses}
          classes={upcomingClasses}
          classMaterials={classMaterials}
          editingNotes={editingNotes}
          savingNotes={savingNotes}
          deletingMaterial={deletingMaterial}
          isAdmin={isAdmin}
          formatStudentNames={formatStudentNames}
          formatClassTime={formatClassTime}
          formatClassDate={formatClassDate}
          getNextClassDate={getNextClassDate}
          getPreviousClassDate={getPreviousClassDate}
          onEditNotes={onEditNotes}
          onSaveNotes={onSaveNotes}
          onCancelEditNotes={onCancelEditNotes}
          onDeleteMaterial={onDeleteMaterial}
          onOpenUploadForm={onOpenUploadForm}
          onCloseUploadForm={onCloseUploadForm}
          visibleUploadForm={visibleUploadForm}
          textareaRefs={textareaRefs}
          pageSize={isMobileView ? 2 : 3}
          currentPage={upcomingClassesPage}
          onPageChange={onUpcomingClassesPageChange}
          sectionRef={upcomingClassesSectionRef}
        />
      </div>
    </>
  );
}; 