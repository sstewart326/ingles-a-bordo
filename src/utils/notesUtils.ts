import { ClassSession, User } from './scheduleUtils';
import { updateCachedDocument } from './firebaseUtils';
import { Timestamp } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { User as FirebaseUser } from 'firebase/auth';
import { ClassMaterial } from '../types/interfaces';

interface NotesState {
  editingNotes: { [classId: string]: string };
  savingNotes: { [classId: string]: boolean };
  textareaRefs: { [key: string]: HTMLTextAreaElement | null };
  editingPrivateNotes: { [classId: string]: string };
  savingPrivateNotes: { [classId: string]: boolean };
}

interface UpdateNotesParams {
  classSession: ClassSession;
  state: NotesState;
  setState: (updates: Partial<NotesState>) => void;
  currentUser: FirebaseUser | null;
  selectedDayDetails: {
    date: Date;
    classes: ClassSession[];
    paymentsDue: { user: User; classSession: ClassSession }[];
    materials: Record<string, ClassMaterial[]>;
  } | null;
  setSelectedDayDetails: (details: any) => void;
  upcomingClasses: ClassSession[];
  pastClasses: ClassSession[];
  setUpcomingClasses: (classes: ClassSession[]) => void;
  setPastClasses: (classes: ClassSession[]) => void;
  isPrivate?: boolean;
}

export const handleEditNotes = (
  classSession: ClassSession,
  state: NotesState,
  setEditingNotes: (updates: { [classId: string]: string }) => void,
  isPrivate: boolean = false
) => {
  if (isPrivate) {
    setEditingNotes({
      ...state.editingPrivateNotes,
      [classSession.id]: classSession.privateNotes || ''
    });
  } else {
    setEditingNotes({
      ...state.editingNotes,
      [classSession.id]: classSession.notes || ''
    });
  }
};

export const handleSaveNotes = async ({
  classSession,
  state,
  setState,
  currentUser,
  selectedDayDetails,
  setSelectedDayDetails,
  upcomingClasses,
  pastClasses,
  setUpcomingClasses,
  setPastClasses,
  isPrivate = false
}: UpdateNotesParams) => {
  try {
    if (isPrivate) {
      setState({
        savingPrivateNotes: {
          ...state.savingPrivateNotes,
          [classSession.id]: true
        }
      });
    } else {
      setState({
        savingNotes: {
          ...state.savingNotes,
          [classSession.id]: true
        }
      });
    }
    
    // Get the value directly from the textarea ref
    const textareaKey = isPrivate ? `private_${classSession.id}` : classSession.id;
    const textareaValue = state.textareaRefs[textareaKey]?.value || '';
    
    // Convert Firebase Auth User to our custom User type
    const customUser = currentUser ? {
      id: currentUser.uid,
      email: currentUser.email || '',
      name: currentUser.displayName || currentUser.email || '',
      paymentConfig: undefined
    } : null;
    
    // Update in Firebase
    await updateCachedDocument('classes', classSession.id, {
      [isPrivate ? 'privateNotes' : 'notes']: textareaValue,
      updatedAt: Timestamp.now()
    }, { userId: customUser?.id });
    
    // Update local state
    const updateClassList = (classes: ClassSession[]) => 
      classes.map(c => 
        c.id === classSession.id 
          ? { ...c, [isPrivate ? 'privateNotes' : 'notes']: textareaValue } 
          : c
      );
    
    setUpcomingClasses(updateClassList(upcomingClasses));
    setPastClasses(updateClassList(pastClasses));
    
    if (selectedDayDetails && selectedDayDetails.classes) {
      setSelectedDayDetails({
        ...selectedDayDetails,
        classes: updateClassList(selectedDayDetails.classes)
      });
    }
    
    // Clear editing state for this class
    if (isPrivate) {
      const newEditingPrivateNotes = { ...state.editingPrivateNotes };
      delete newEditingPrivateNotes[classSession.id];
      setState({
        editingPrivateNotes: newEditingPrivateNotes,
        savingPrivateNotes: {
          ...state.savingPrivateNotes,
          [classSession.id]: false
        }
      });
    } else {
      const newEditingNotes = { ...state.editingNotes };
      delete newEditingNotes[classSession.id];
      setState({
        editingNotes: newEditingNotes,
        savingNotes: {
          ...state.savingNotes,
          [classSession.id]: false
        }
      });
    }
    
    toast.success(isPrivate ? 'Private notes saved successfully' : 'Notes saved successfully');
  } catch (error) {
    console.error(`Error in handleSaveNotes (${isPrivate ? 'private' : 'public'}):`, error);
    toast.error(isPrivate ? 'Error saving private notes' : 'Error saving notes');
    if (isPrivate) {
      setState({
        savingPrivateNotes: {
          ...state.savingPrivateNotes,
          [classSession.id]: false
        }
      });
    } else {
      setState({
        savingNotes: {
          ...state.savingNotes,
          [classSession.id]: false
        }
      });
    }
  }
};

export const handleCancelEditNotes = (
  classId: string,
  state: NotesState,
  setEditingNotes: (updates: { [classId: string]: string }) => void,
  isPrivate: boolean = false
) => {
  if (isPrivate) {
    const newEditingPrivateNotes = { ...state.editingPrivateNotes };
    delete newEditingPrivateNotes[classId];
    setEditingNotes(newEditingPrivateNotes);
  } else {
    const newEditingNotes = { ...state.editingNotes };
    delete newEditingNotes[classId];
    setEditingNotes(newEditingNotes);
  }
}; 