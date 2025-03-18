import { ClassSession } from './scheduleUtils';
import { ClassMaterial } from '../types/interfaces';
import { updateClassMaterialItem } from './classMaterialsUtils';
import { getMonthKey } from './calendarUtils';
import { toast } from 'react-hot-toast';
import { debugLog } from './debugUtils';

export interface MaterialsState {
  classMaterials: Record<string, ClassMaterial[]>;
  deletingMaterial: { [materialId: string]: boolean };
  loadedMaterialMonths: Set<string>;
}

interface UpdateMaterialsParams {
  classId: string;
  date: Date;
  materials: ClassMaterial[];
  state: MaterialsState;
  setState: (updates: Partial<MaterialsState>) => void;
  selectedDayDetails: {
    date: Date;
    classes: ClassSession[];
    paymentsDue: any[];
    materials: Record<string, ClassMaterial[]>;
  } | null;
  setSelectedDayDetails: (details: any) => void;
  upcomingClasses: ClassSession[];
  pastClasses: ClassSession[];
  setUpcomingClasses: (classes: ClassSession[]) => void;
  setPastClasses: (classes: ClassSession[]) => void;
}

export const updateMaterialsState = async ({
  classId,
  date,
  materials,
  state,
  setState,
  selectedDayDetails,
  setSelectedDayDetails,
  upcomingClasses,
  pastClasses,
  setUpcomingClasses,
  setPastClasses
}: UpdateMaterialsParams) => {
  try {
    // Update the materials state for all relevant sections
    setState({
      classMaterials: {
        ...state.classMaterials,
        [classId]: materials
      }
    });

    // Update selected day details if they exist and match the current class
    if (selectedDayDetails && selectedDayDetails.classes.some(c => c.id === classId)) {
      setSelectedDayDetails({
        ...selectedDayDetails,
        materials: {
          ...selectedDayDetails.materials,
          [classId]: materials
        }
      });
    }

    // Update upcoming and past classes to include the new materials
    setUpcomingClasses(
      upcomingClasses.map(c => 
        c.id === classId 
          ? { ...c, materials } 
          : c
      )
    );

    setPastClasses(
      pastClasses.map(c => 
        c.id === classId 
          ? { ...c, materials } 
          : c
      )
    );

    // Update the loaded material months to ensure we don't reload unnecessarily
    const monthKey = getMonthKey(date);
    setState({
      loadedMaterialMonths: new Set([...state.loadedMaterialMonths, monthKey])
    });
    
    toast.success('Materials updated successfully');
  } catch (error) {
    console.error('Error updating materials:', error);
    toast.error('Error updating materials');
  }
};

interface DeleteMaterialParams {
  material: ClassMaterial;
  index: number;
  classId: string;
  type: 'slides' | 'link';
  itemIndex?: number;
  currentUser: any;
  isAdmin: boolean;
  state: MaterialsState;
  setState: (updates: Partial<MaterialsState>) => void;
  selectedDayDetails: any;
  setSelectedDayDetails: (details: any) => void;
  upcomingClasses?: ClassSession[];
  pastClasses?: ClassSession[];
  setUpcomingClasses?: (classes: ClassSession[]) => void;
  setPastClasses?: (classes: ClassSession[]) => void;
}

export const handleDeleteMaterial = async ({
  material,
  index,
  classId,
  type,
  itemIndex,
  currentUser,
  isAdmin,
  state,
  setState,
  selectedDayDetails,
  setSelectedDayDetails,
  upcomingClasses,
  pastClasses,
  setUpcomingClasses,
  setPastClasses
}: DeleteMaterialParams) => {
  if (!currentUser || !isAdmin) {
    toast.error('Not authorized');
    return;
  }

  // Validate required parameters
  if (!material || !classId || (type === 'slides' && typeof itemIndex !== 'number') || (type === 'link' && typeof itemIndex !== 'number')) {
    toast.error('Missing required parameters for deletion');
    debugLog('Missing required parameters for deletion', { material, index, classId, type, itemIndex });
    return;
  }

  try {
    // Set deleting state
    const deletingKey = type === 'slides' 
      ? `${material.classId || classId}${index}_slide_${itemIndex}`
      : `${material.classId || classId}${index}_link_${itemIndex}`;
    
    setState({
      deletingMaterial: {
        ...state.deletingMaterial,
        [deletingKey]: true
      }
    });

    // ============== STEP 1: Update the material in the database ==============
    
    // Ensure we have a valid classId to match the Firestore document
    const documentClassId = material.classId || classId;
    
    // Ensure we have a valid date for the material
    let materialDate: Date;
    if (material.classDate instanceof Date) {
      materialDate = material.classDate;
    } else if (typeof material.classDate === 'string') {
      materialDate = new Date(material.classDate);
    } else if (material.classDate && typeof material.classDate === 'object' && 'toDate' in material.classDate) {
      // Handle Firestore Timestamp
      materialDate = (material.classDate as { toDate: () => Date }).toDate();
    } else {
      // If we don't have a valid date, use the current date as a fallback
      console.warn('No valid date found for material, using current date as fallback');
      materialDate = new Date();
    }
    
    // Log for debugging
    debugLog(`Deleting material item: type=${type}, itemIndex=${itemIndex}, classId=${documentClassId}, date=${materialDate.toISOString()}`);
    
    // Call the utility function to update the material
    if (type === 'slides' && typeof itemIndex === 'number') {
      await updateClassMaterialItem(documentClassId, materialDate, 'removeSlides', undefined, itemIndex);
    } else if (type === 'link' && typeof itemIndex === 'number') {
      await updateClassMaterialItem(documentClassId, materialDate, 'removeLink', itemIndex);
    }
    
    // Dispatch an event to notify other components about the materials update
    const updateEvent = new CustomEvent('materials-updated', {
      detail: {
        classId: documentClassId,
        date: materialDate,
        action: 'delete',
        timestamp: Date.now()
      }
    });
    window.dispatchEvent(updateEvent);
    
    // ============== STEP 2: Handle class ID variants ==============
    
    // Extract the base class ID to handle all variants
    const baseClassId = classId.includes('-') ? classId.split('-')[0] : classId;
    
    // Create a list of all class IDs that need to be updated
    const classIdsToUpdate = [
      classId, // Original class ID
      baseClassId, // Base class ID
    ];
    
    // Add any class IDs from upcoming and past classes that start with the base ID
    if (upcomingClasses) {
      upcomingClasses.forEach(c => {
        if (c.id.startsWith(baseClassId) && !classIdsToUpdate.includes(c.id)) {
          classIdsToUpdate.push(c.id);
        }
      });
    }
    
    if (pastClasses) {
      pastClasses.forEach(c => {
        if (c.id.startsWith(baseClassId) && !classIdsToUpdate.includes(c.id)) {
          classIdsToUpdate.push(c.id);
        }
      });
    }
    
    const uniqueClassIdsToUpdate = [...new Set(classIdsToUpdate)];
    console.log('Update materials for these class IDs after deletion:', uniqueClassIdsToUpdate);
    
    // ============== STEP 3: Create updated materials ==============
    
    // Start with a copy of the current materials state
    const updatedMaterialsMap = { ...state.classMaterials };
    
    // Function to update or remove the material
    const updateMaterialsArray = (materials: ClassMaterial[]): ClassMaterial[] => {
      // First, update the material in place
      let newMaterials = materials.map((m: ClassMaterial, i: number) => {
        if (i === index) {
          if (type === 'slides' && typeof itemIndex === 'number' && m.slides) {
            const updatedSlides = [...m.slides];
            updatedSlides.splice(itemIndex, 1);
            return { ...m, slides: updatedSlides };
          } else if (type === 'link' && typeof itemIndex === 'number' && m.links) {
            const updatedLinks = [...m.links];
            updatedLinks.splice(itemIndex, 1);
            return { ...m, links: updatedLinks };
          }
        }
        return m;
      });
      
      // Then, filter out any materials that now have no slides and no links
      newMaterials = newMaterials.filter((m, i) => {
        if (i === index) {
          return (m.slides && m.slides.length > 0) || (m.links && m.links.length > 0);
        }
        return true;
      });
      
      return newMaterials;
    };
    
    // Update all affected class IDs
    uniqueClassIdsToUpdate.forEach(id => {
      if (updatedMaterialsMap[id] && updatedMaterialsMap[id].length > 0) {
        const updated = updateMaterialsArray(updatedMaterialsMap[id]);
        if (updated.length > 0) {
          updatedMaterialsMap[id] = updated;
        } else {
          delete updatedMaterialsMap[id];
        }
      }
    });
    
    // ============== STEP 4: Update state in all places ==============
    
    // Update the class materials state
    setState({ classMaterials: updatedMaterialsMap });
    
    // Update the selected day details if applicable
    if (selectedDayDetails) {
      const updatedDayDetailsMaterials = { ...selectedDayDetails.materials };
      
      // Update materials map in selected day details
      uniqueClassIdsToUpdate.forEach(id => {
        if (updatedDayDetailsMaterials[id] && updatedDayDetailsMaterials[id].length > 0) {
          const updated = updateMaterialsArray(updatedDayDetailsMaterials[id]);
          if (updated.length > 0) {
            updatedDayDetailsMaterials[id] = updated;
          } else {
            delete updatedDayDetailsMaterials[id];
          }
        }
      });
      
      // Update classes in selected day details to also have the correct materials
      const updatedDayDetailsClasses = selectedDayDetails.classes.map((c: ClassSession) => {
        if (uniqueClassIdsToUpdate.includes(c.id)) {
          return {
            ...c,
            materials: updatedMaterialsMap[c.id] || []
          };
        }
        return c;
      });
      
      // Update selected day details with both updated materials and classes
      setSelectedDayDetails({
        ...selectedDayDetails,
        materials: updatedDayDetailsMaterials,
        classes: updatedDayDetailsClasses
      });
    }
    
    // Update upcoming classes if provided
    if (upcomingClasses && setUpcomingClasses) {
      const updatedUpcomingClasses = upcomingClasses.map(c => {
        if (uniqueClassIdsToUpdate.includes(c.id)) {
          return { 
            ...c, 
            materials: updatedMaterialsMap[c.id] || [] 
          };
        }
        return c;
      });
      setUpcomingClasses(updatedUpcomingClasses);
    }
    
    // Update past classes if provided
    if (pastClasses && setPastClasses) {
      const updatedPastClasses = pastClasses.map(c => {
        if (uniqueClassIdsToUpdate.includes(c.id)) {
          return { 
            ...c, 
            materials: updatedMaterialsMap[c.id] || [] 
          };
        }
        return c;
      });
      setPastClasses(updatedPastClasses);
    }
    
    // ============== STEP 5: Fire event for global notification ==============
    // Dispatch a custom event to ensure any components listening for materials changes update
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('materials-updated', { 
        detail: { 
          classId: documentClassId,
          date: materialDate,
          timestamp: new Date().getTime(),
          action: 'delete',
          type,
          itemIndex,
          materialId: material.id || null,
          affectedClassIds: uniqueClassIdsToUpdate
        } 
      }));
      debugLog('Dispatched materials-updated event after delete with details:', {
        classId: documentClassId,
        action: 'delete',
        type,
        affectedClassIds: uniqueClassIdsToUpdate
      });
    }, 300); // Increased timeout to ensure state updates have completed
    
    // Show a single success message based on type
    toast.success(`Material deleted successfully`);
  } catch (error) {
    console.error('Error updating material:', error);
    toast.error('Error deleting material');
  } finally {
    // Clear deleting state
    const deletingKey = type === 'slides' 
      ? `${material.classId || classId}${index}_slide_${itemIndex}`
      : `${material.classId || classId}${index}_link_${itemIndex}`;
    
    setState({
      deletingMaterial: {
        ...state.deletingMaterial,
        [deletingKey]: false
      }
    });
  }
}; 