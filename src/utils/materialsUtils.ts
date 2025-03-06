import { ClassSession } from './scheduleUtils';
import { ClassMaterial } from '../types/interfaces';
import { updateClassMaterialItem } from './classMaterialsUtils';
import { getMonthKey } from './calendarUtils';
import { toast } from 'react-hot-toast';

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

  try {
    // Set deleting state
    const deletingKey = type === 'slides' 
      ? `${material.classId}${index}_slide_${itemIndex}`
      : `${material.classId}${index}_link_${itemIndex}`;
    
    setState({
      deletingMaterial: {
        ...state.deletingMaterial,
        [deletingKey]: true
      }
    });

    // Call the utility function to update the material
    if (type === 'slides' && typeof itemIndex === 'number') {
      await updateClassMaterialItem(material.classId, material.classDate, 'removeSlides', undefined, itemIndex);
    } else if (type === 'link' && typeof itemIndex === 'number') {
      await updateClassMaterialItem(material.classId, material.classDate, 'removeLink', itemIndex);
    }
    
    // Update local state
    const updatedMaterials = { ...state.classMaterials };
    
    // Check if we need to update or remove the material from local state
    if (updatedMaterials[classId]) {
      // If we're removing slides, update the material
      if (type === 'slides' && typeof itemIndex === 'number' && material.slides) {
        updatedMaterials[classId] = updatedMaterials[classId].map((m: ClassMaterial, i: number) => {
          if (i === index && m.slides) {
            const updatedSlides = [...m.slides];
            updatedSlides.splice(itemIndex, 1);
            return { ...m, slides: updatedSlides };
          }
          return m;
        });
        
        // If this material now has no slides and no links, remove it
        const materialToCheck = updatedMaterials[classId][index];
        if ((!materialToCheck.slides || materialToCheck.slides.length === 0) && 
            (!materialToCheck.links || materialToCheck.links.length === 0)) {
          updatedMaterials[classId] = updatedMaterials[classId].filter((_: ClassMaterial, i: number) => i !== index);
        }
      } 
      // If we're removing a link, update the material
      else if (type === 'link' && typeof itemIndex === 'number') {
        updatedMaterials[classId] = updatedMaterials[classId].map((m: ClassMaterial, i: number) => {
          if (i === index && m.links) {
            const updatedLinks = [...m.links];
            updatedLinks.splice(itemIndex, 1);
            return { ...m, links: updatedLinks };
          }
          return m;
        });
        
        // If this material now has no slides and no links, remove it
        const materialToCheck = updatedMaterials[classId][index];
        if ((!materialToCheck.slides || materialToCheck.slides.length === 0) && 
            (!materialToCheck.links || materialToCheck.links.length === 0)) {
          updatedMaterials[classId] = updatedMaterials[classId].filter((_: ClassMaterial, i: number) => i !== index);
        }
      }
      
      // If no materials left, remove the entry
      if (updatedMaterials[classId].length === 0) {
        delete updatedMaterials[classId];
      }
    }
    
    setState({ classMaterials: updatedMaterials });
    
    // Update selected day details if needed
    if (selectedDayDetails && selectedDayDetails.materials[classId]) {
      const updatedDayDetails = { ...selectedDayDetails };
      
      // Apply the same logic to selectedDayDetails
      if (type === 'slides' && typeof itemIndex === 'number' && material.slides) {
        updatedDayDetails.materials[classId] = updatedDayDetails.materials[classId].map((m: ClassMaterial, i: number) => {
          if (i === index && m.slides) {
            const updatedSlides = [...m.slides];
            updatedSlides.splice(itemIndex, 1);
            return { ...m, slides: updatedSlides };
          }
          return m;
        });
        
        // If this material now has no slides and no links, remove it
        const materialToCheck = updatedDayDetails.materials[classId][index];
        if ((!materialToCheck.slides || materialToCheck.slides.length === 0) && 
            (!materialToCheck.links || materialToCheck.links.length === 0)) {
          updatedDayDetails.materials[classId] = updatedDayDetails.materials[classId].filter((_: ClassMaterial, i: number) => i !== index);
        }
      }
      else if (type === 'link' && typeof itemIndex === 'number') {
        updatedDayDetails.materials[classId] = updatedDayDetails.materials[classId].map((m: ClassMaterial, i: number) => {
          if (i === index && m.links) {
            const updatedLinks = [...m.links];
            updatedLinks.splice(itemIndex, 1);
            return { ...m, links: updatedLinks };
          }
          return m;
        });
        
        // If this material now has no slides and no links, remove it
        const materialToCheck = updatedDayDetails.materials[classId][index];
        if ((!materialToCheck.slides || materialToCheck.slides.length === 0) && 
            (!materialToCheck.links || materialToCheck.links.length === 0)) {
          updatedDayDetails.materials[classId] = updatedDayDetails.materials[classId].filter((_: ClassMaterial, i: number) => i !== index);
        }
      }
      
      // If no materials left, remove the entry
      if (updatedDayDetails.materials[classId].length === 0) {
        delete updatedDayDetails.materials[classId];
      }
      
      setSelectedDayDetails(updatedDayDetails);
    }
    
    // Update upcoming classes if provided
    if (upcomingClasses && setUpcomingClasses) {
      const updatedUpcomingClasses = upcomingClasses.map(c => {
        if (c.id === classId) {
          // If we have updated materials for this class, use them
          if (updatedMaterials[classId]) {
            return { ...c, materials: updatedMaterials[classId] };
          } 
          // If we've deleted all materials for this class, set materials to empty array
          else {
            return { ...c, materials: [] };
          }
        }
        return c;
      });
      setUpcomingClasses(updatedUpcomingClasses);
    }
    
    // Update past classes if provided
    if (pastClasses && setPastClasses) {
      const updatedPastClasses = pastClasses.map(c => {
        if (c.id === classId) {
          // If we have updated materials for this class, use them
          if (updatedMaterials[classId]) {
            return { ...c, materials: updatedMaterials[classId] };
          } 
          // If we've deleted all materials for this class, set materials to empty array
          else {
            return { ...c, materials: [] };
          }
        }
        return c;
      });
      setPastClasses(updatedPastClasses);
    }
    
    toast.success('Material updated successfully');
  } catch (error) {
    console.error('Error updating material:', error);
    toast.error('Error updating material');
  } finally {
    // Clear deleting state
    const deletingKey = type === 'slides' 
      ? `${material.classId}${index}_slide_${itemIndex}`
      : `${material.classId}${index}_link_${itemIndex}`;
    
    setState({
      deletingMaterial: {
        ...state.deletingMaterial,
        [deletingKey]: false
      }
    });
  }
}; 