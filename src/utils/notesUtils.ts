import { ClassSession } from './scheduleUtils';
import { setCachedDocument, updateCachedDocument, getCachedCollection } from './firebaseUtils';
import { Timestamp, where, collection, query, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { db } from '../config/firebase';
import { cache } from './cache';

export interface ClassNote {
  id: string;
  notes: string;
  privateNotes: string;
  updatedAt: Timestamp;
  month: string;
  day: number;
  classId: string;
  classTime: string;
  classTimezone: string;
  teacherId: string;
}

interface NotesState {
  editingNotes: { [classId: string]: string };
  savingNotes: { [classId: string]: boolean };
  textareaRefs: { [key: string]: HTMLTextAreaElement | null };
  editingPrivateNotes: { [classId: string]: string };
  savingPrivateNotes: { [classId: string]: boolean };
}

interface UpdateNotesParams {
  classSession: ClassSession;
  note?: string;
  privateNote?: string;
  teacherId: string;
}

// Simple pub/sub for notes changes
type NotesChangeListener = (monthKey: string, note: ClassNote) => void;
const notesChangeListeners: NotesChangeListener[] = [];
let activeNotesSubscriptions: { [monthKey: string]: () => void } = {};

// Subscribe to notes changes
export const subscribeToNotesChanges = (listener: NotesChangeListener): () => void => {
  notesChangeListeners.push(listener);
  
  // Return unsubscribe function
  return () => {
    const index = notesChangeListeners.indexOf(listener);
    if (index !== -1) {
      notesChangeListeners.splice(index, 1);
    }
  };
};

// Notify all listeners about notes changes
export const notifyNotesChange = (monthKey: string, note: ClassNote): void => {
  
  // Invalidate cache for notes collection
  cache.invalidate('classNotes');
  
  // Notify all listeners
  notesChangeListeners.forEach(listener => {
    try {
      listener(monthKey, note);
    } catch (error) {
      console.error('Error in notes change listener:', error);
    }
  });
};

// Subscribe to real-time updates for a specific month's notes
export const subscribeToMonthNotes = (year: number, month: number, teacherId: string): () => void => {
  const monthStr = month.toString().padStart(2, '0');
  const monthKey = `${year}-${monthStr}`;
  
  // If we already have an active subscription for this month, return it
  if (activeNotesSubscriptions[monthKey]) {
    return () => {};
  }
  
  
  // Create a query for notes in this month for this teacher
  const notesQuery = query(
    collection(db, 'classNotes'),
    where('month', '==', monthKey),
    where('teacherId', '==', teacherId)
  );
  
  // Start listening to changes
  const unsubscribe = onSnapshot(notesQuery, (snapshot) => {
    
    if (snapshot.docChanges().length > 0) {
      // Process each change
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added' || change.type === 'modified') {
          const noteData = change.doc.data() as ClassNote;
          noteData.id = change.doc.id;
          
          // Notify listeners about the specific note change
          notifyNotesChange(monthKey, noteData);
        }
      });
    }
  }, (error) => {
    console.error('Error in notes subscription:', error);
  });
  
  // Store the unsubscribe function
  activeNotesSubscriptions[monthKey] = unsubscribe;
  
  // Return a function to unsubscribe
  return () => {
    if (activeNotesSubscriptions[monthKey]) {
      activeNotesSubscriptions[monthKey]();
      delete activeNotesSubscriptions[monthKey];
    }
  };
};

export const handleSaveNotes = async ({
  classSession,
  note,
  privateNote,
  teacherId
}: UpdateNotesParams) => {
  // Update in Firebase
  try {
    // Return early if no display date is available
    if (!classSession._displayDate) {
      toast.error("Error saving notes: Missing date information");
      return;
    }

    const month = classSession._displayDate.getMonth() + 1;
    const twoDigitMonth = month.toString().padStart(2, '0');
    const monthKey = `${classSession._displayDate.getFullYear()}-${twoDigitMonth}`;
    let noteId = '';
    
    // Check if notes already exist for this specific class, date, and time
    const existingNotes = await getCachedCollection('classNotes', [
      where('classId', '==', classSession.id),
      where('day', '==', classSession._displayDate.getDate()),
      where('month', '==', monthKey),
      where('classTime', '==', classSession.startTime)
    ]);
    
    // Create the note data, preserving any existing content if we're only updating one field
    let noteData: any = {
      updatedAt: Timestamp.now(),
      month: monthKey,
      day: classSession._displayDate.getDate(),
      classId: classSession.id,
      classTime: classSession.startTime,
      classTimezone: classSession.timezone,
      teacherId: teacherId
    };
    
    if (existingNotes && existingNotes.length > 0) {
      const existingDoc = existingNotes[0];
      noteId = existingDoc.id;
      
      // If updating public notes, include that in the update
      if (note !== undefined) {
        noteData.notes = note || '';
      } else if (existingDoc.notes) {
        // Otherwise preserve existing public notes
        noteData.notes = existingDoc.notes;
      }
      
      // If updating private notes, include that in the update
      if (privateNote !== undefined) {
        noteData.privateNotes = privateNote || '';
      } else if (existingDoc.privateNotes) {
        // Otherwise preserve existing private notes
        noteData.privateNotes = existingDoc.privateNotes; 
      }
      
      // Update existing notes
      await updateCachedDocument('classNotes', existingDoc.id, noteData);
    } else {
      // For new notes, include both fields
      noteData.notes = note || '';
      noteData.privateNotes = privateNote || '';
      
      // Use the class ID combined with date and time as the document ID for better predictability
      noteId = `${classSession.id}-${classSession._displayDate.getFullYear()}${twoDigitMonth}${classSession._displayDate.getDate().toString().padStart(2, '0')}-${classSession.startTime.replace(':', '')}`;
      
      // Create new notes
      await setCachedDocument('classNotes', noteId, noteData);
    }
    
    // Fetch the saved note to ensure we have the complete, accurate data to notify clients
    const docRef = doc(db, 'classNotes', noteId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const savedNote = { id: docSnap.id, ...docSnap.data() } as ClassNote;
      
      // Notify all listeners about the change to trigger real-time updates
      notifyNotesChange(monthKey, savedNote);
    }
    
    toast.success("Notes saved successfully");
  } catch (error) {
    toast.error("Error saving notes");
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

/**
 * Fetches all class notes for a specific month and teacher
 * This allows prefetching notes data for a calendar view
 * 
 * @param month - Month number (1-12)
 * @param year - Full year (e.g., 2023)
 * @param teacherId - ID of the teacher whose notes to fetch
 * @returns Promise resolving to an array of class notes
 */
export const fetchNotesByMonthAndTeacher = async (month: number, year: number, teacherId: string): Promise<ClassNote[]> => {
  try {
    // Format month to match the stored format (YYYY-MM)
    const twoDigitMonth = month.toString().padStart(2, '0');
    const monthFormatted = `${year}-${twoDigitMonth}`;
    
    // Query class notes by month and teacherId
    const notes = await getCachedCollection<ClassNote>('classNotes', [
      where('month', '==', monthFormatted),
      where('teacherId', '==', teacherId)
    ]);
    
    return notes || [];
  } catch (error) {
    console.error('Error fetching notes by month and teacher:', error);
    toast.error("Error loading class notes");
    return [];
  }
};

/**
 * Finds a matching note from prefetched notes for a specific class session
 * 
 * @param classSession - The class session to find notes for
 * @param prefetchedNotes - Array of notes previously fetched with fetchNotesByMonthAndTeacher
 * @returns The matching note object or null if no match found
 */
export const findNoteForClassSession = (
  classSession: ClassSession, 
  prefetchedNotes: ClassNote[]
): ClassNote | null => {
  if (!classSession._displayDate || !prefetchedNotes?.length) {
    return null;
  }
  
  const day = classSession._displayDate.getDate();
  const month = classSession._displayDate.getMonth() + 1;
  const twoDigitMonth = classSession._displayDate.getFullYear() + '-' + 
                month.toString().padStart(2, '0');
  
  // Find a matching note by classId, day, month and time
  return prefetchedNotes.find(note => 
    note.classId === classSession.id &&
    note.day === day &&
    note.month === twoDigitMonth &&
    note.classTime === classSession.startTime
  ) || null;
};

/**
 * Loads class notes for a specific class session, using prefetched data if available
 * This creates a more efficient way to access notes when rendering calendar views
 *
 * @param classSession - The class session to find notes for
 * @param prefetchedNotes - Optional array of notes previously fetched with fetchNotesByMonthAndTeacher
 * @returns Promise resolving to the note object or null if no notes exist
 */
export const loadClassNotesFromPrefetched = async (
  classSession: ClassSession,
  prefetchedNotes?: ClassNote[]
): Promise<ClassNote | null> => {
  // If we have prefetched notes, try to find a match first
  if (prefetchedNotes?.length && classSession._displayDate) {
    const matchingNote = findNoteForClassSession(classSession, prefetchedNotes);
    if (matchingNote) {
      return matchingNote;
    }
  }
  
  // If no prefetched data or no match found, fall back to direct query
  if (!classSession._displayDate) {
    return null;
  }
  
  try {
    const month = classSession._displayDate?.getMonth() + 1;
    const twoDigitMonth = month.toString().padStart(2, '0');
    const monthFormatted = `${classSession._displayDate.getFullYear()}-${twoDigitMonth}`;
    
    const notes = await getCachedCollection<ClassNote>('classNotes', [
      where('classId', '==', classSession.id),
      where('day', '==', classSession._displayDate.getDate()),
      where('month', '==', monthFormatted),
      where('classTime', '==', classSession.startTime)
    ]);
    
    return notes && notes.length > 0 ? notes[0] : null;
  } catch (error) {
    console.error('Error loading class notes:', error);
    return null;
  }
}; 