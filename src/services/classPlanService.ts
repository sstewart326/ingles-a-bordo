import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  getDoc, 
  query, 
  where, 
  Timestamp, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { ClassPlan, ClassPlanItem, ClassPlanTemplate } from '../types/interfaces';
import { v4 as uuidv4 } from 'uuid';

const COLLECTION_PLANS = 'classPlans';
const COLLECTION_TEMPLATES = 'classPlanTemplates';

// Get all class plans for a specific student and month/year
export const getStudentClassPlans = async (studentEmail: string, month: number, year: number): Promise<ClassPlan[]> => {
  try {
    const plansRef = collection(db, COLLECTION_PLANS);
    const q = query(
      plansRef, 
      where('studentEmail', '==', studentEmail),
      where('month', '==', month),
      where('year', '==', year)
    );
    
    const querySnapshot = await getDocs(q);
    const plans: ClassPlan[] = [];
    
    querySnapshot.forEach((doc) => {
      plans.push({ id: doc.id, ...doc.data() } as ClassPlan);
    });
    
    return plans;
  } catch (error) {
    throw error;
  }
};

// Get all class plans for a specific student (without month/year filtering)
export const getAllStudentClassPlans = async (studentEmail: string): Promise<ClassPlan[]> => {
  try {
    const plansRef = collection(db, COLLECTION_PLANS);
    const q = query(
      plansRef, 
      where('studentEmail', '==', studentEmail)
    );
    
    const querySnapshot = await getDocs(q);
    const plans: ClassPlan[] = [];
    
    querySnapshot.forEach((doc) => {
      plans.push({ id: doc.id, ...doc.data() } as ClassPlan);
    });
    
    // Sort plans by year (descending) and month (descending)
    plans.sort((a, b) => {
      if (a.year !== b.year) {
        return b.year - a.year; // Most recent year first
      }
      return b.month - a.month; // Most recent month first
    });
    
    return plans;
  } catch (error) {
    throw error;
  }
};

// Create a new class plan
export const createClassPlan = async (
  studentEmail: string, 
  month: number, 
  year: number, 
  createdBy: string
): Promise<string> => {
  try {
    
    const newPlan = {
      studentEmail,
      month,
      year,
      items: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy
    };
    
    const docRef = await addDoc(collection(db, COLLECTION_PLANS), newPlan);
    return docRef.id;
  } catch (error) {
    throw error;
  }
};

// Add an item to a class plan
export const addClassPlanItem = async (
  planId: string, 
  title: string, 
  description?: string
): Promise<string> => {
  try {
    
    const planRef = doc(db, COLLECTION_PLANS, planId);
    const planDoc = await getDoc(planRef);
    
    if (!planDoc.exists()) {
      throw new Error('Class plan not found');
    }
    
    const plan = planDoc.data() as ClassPlan;
    const newItem: ClassPlanItem = {
      id: uuidv4(),
      title,
      description,
      completed: false
    };
    
    const items = [...(plan.items || []), newItem];
    
    await updateDoc(planRef, {
      items,
      updatedAt: serverTimestamp()
    });
    
    return newItem.id;
  } catch (error) {
    throw error;
  }
};

// Update a class plan item
export const updateClassPlanItem = async (
  planId: string, 
  itemId: string, 
  updates: Partial<Omit<ClassPlanItem, 'id'>>
): Promise<void> => {
  try {
    
    const planRef = doc(db, COLLECTION_PLANS, planId);
    const planDoc = await getDoc(planRef);
    
    if (!planDoc.exists()) {
      throw new Error('Class plan not found');
    }
    
    const plan = planDoc.data() as ClassPlan;
    
    // Helper function to recursively find and update an item
    const findAndUpdateItem = (items: ClassPlanItem[]): [boolean, ClassPlanItem[]] => {
      const updatedItems = [...items];
      let found = false;
      
      for (let i = 0; i < updatedItems.length; i++) {
        // Check if this is the item we're looking for
        if (updatedItems[i].id === itemId) {
          // If marking as completed, add completion date
          if (updates.completed === true && !updatedItems[i].completed) {
            updates.completedDate = Timestamp.now();
          }
          
          // Create a copy of the current item
          const updatedItem = { ...updatedItems[i], ...updates };
          
          // If marking as incomplete, remove the completedDate field entirely
          if (updates.completed === false && updatedItem.completedDate) {
            delete updatedItem.completedDate;
          }
          
          updatedItems[i] = updatedItem;
          found = true;
          break;
        }
        
        // If this item has children, recursively search them
        const children = updatedItems[i].children || [];
        if (children.length > 0) {
          const [childFound, updatedChildren] = findAndUpdateItem(children);
          if (childFound) {
            updatedItems[i] = {
              ...updatedItems[i],
              children: updatedChildren
            };
            found = true;
            break;
          }
        }
      }
      
      return [found, updatedItems];
    };
    
    const [found, updatedItems] = findAndUpdateItem(plan.items);
    
    if (!found) {
      throw new Error('Item not found in class plan');
    }
    
    await updateDoc(planRef, {
      items: updatedItems,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    throw error;
  }
};

// Delete a class plan item
export const deleteClassPlanItem = async (planId: string, itemId: string): Promise<void> => {
  try {
    
    const planRef = doc(db, COLLECTION_PLANS, planId);
    const planDoc = await getDoc(planRef);
    
    if (!planDoc.exists()) {
      throw new Error('Class plan not found');
    }
    
    const plan = planDoc.data() as ClassPlan;
    
    // Helper function to recursively find and delete an item
    const findAndDeleteItem = (items: ClassPlanItem[]): [boolean, ClassPlanItem[]] => {
      // First check if the item is at this level
      const filteredItems = items.filter(item => item.id !== itemId);
      
      // If we removed an item, return the filtered array
      if (filteredItems.length < items.length) {
        return [true, filteredItems];
      }
      
      // Otherwise, recursively check children
      const updatedItems = [...items];
      let found = false;
      
      for (let i = 0; i < updatedItems.length; i++) {
        const children = updatedItems[i].children || [];
        if (children.length > 0) {
          const [childFound, updatedChildren] = findAndDeleteItem(children);
          if (childFound) {
            updatedItems[i] = {
              ...updatedItems[i],
              children: updatedChildren
            };
            found = true;
            break;
          }
        }
      }
      
      return [found, updatedItems];
    };
    
    const [found, updatedItems] = findAndDeleteItem(plan.items);
    
    if (!found) {
      throw new Error('Item not found in class plan');
    }
    
    await updateDoc(planRef, {
      items: updatedItems,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    throw error;
  }
};

// Delete an entire class plan
export const deleteClassPlan = async (planId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, COLLECTION_PLANS, planId));
  } catch (error) {
    throw error;
  }
};

// Get all templates
export const getClassPlanTemplates = async (): Promise<ClassPlanTemplate[]> => {
  try {
    const templatesRef = collection(db, COLLECTION_TEMPLATES);
    const querySnapshot = await getDocs(templatesRef);
    const templates: ClassPlanTemplate[] = [];
    
    querySnapshot.forEach((doc) => {
      templates.push({ id: doc.id, ...doc.data() } as ClassPlanTemplate);
    });
    
    return templates;
  } catch (error) {
    throw error;
  }
};

// Create a template from a class plan
export const createClassPlanTemplate = async (
  name: string,
  items: ClassPlanItem[],
  createdBy: string
): Promise<string> => {
  try {
    
    // Helper function to recursively process items and their children
    const processItems = (items: ClassPlanItem[]): any[] => {
      return items.map(item => {
        const templateItem: any = {
          title: item.title,
          description: item.description || ''
        };
        
        // Process children if they exist
        if (item.children && item.children.length > 0) {
          templateItem.children = processItems(item.children);
          templateItem.isExpanded = true;
        }
        
        return templateItem;
      });
    };
    
    // Process the items to remove id, completed, and completedDate
    const templateItems = processItems(items);
    
    const newTemplate = {
      name,
      items: templateItems,
      createdAt: serverTimestamp(),
      createdBy
    };
    
    const docRef = await addDoc(collection(db, COLLECTION_TEMPLATES), newTemplate);
    return docRef.id;
  } catch (error) {
    throw error;
  }
};

// Apply a template to a class plan
export const applyTemplateToClassPlan = async (
  planId: string,
  templateId: string
): Promise<void> => {
  try {
    
    const planRef = doc(db, COLLECTION_PLANS, planId);
    const templateRef = doc(db, COLLECTION_TEMPLATES, templateId);
    
    const [planDoc, templateDoc] = await Promise.all([
      getDoc(planRef),
      getDoc(templateRef)
    ]);
    
    if (!planDoc.exists()) {
      throw new Error('Class plan not found');
    }
    
    if (!templateDoc.exists()) {
      throw new Error('Template not found');
    }
    
    const template = templateDoc.data() as ClassPlanTemplate;
    
    // Helper function to recursively convert template items to class plan items
    const convertTemplateItems = (templateItems: any[]): ClassPlanItem[] => {
      return templateItems.map(item => {
        const newItem: ClassPlanItem = {
          id: uuidv4(),
          title: item.title,
          description: item.description || '',
          completed: false
        };
        
        // Process children if they exist
        if (item.children && item.children.length > 0) {
          newItem.children = convertTemplateItems(item.children);
          newItem.isExpanded = item.isExpanded || true;
        }
        
        return newItem;
      });
    };
    
    // Convert template items to class plan items
    const newItems = convertTemplateItems(template.items);
    
    await updateDoc(planRef, {
      items: newItems,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    throw error;
  }
};

// Delete a template
export const deleteClassPlanTemplate = async (templateId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, COLLECTION_TEMPLATES, templateId));
  } catch (error) {
    throw error;
  }
};

// Get a specific template by ID
export const getClassPlanTemplate = async (templateId: string): Promise<ClassPlanTemplate> => {
  try {
    const templateRef = doc(db, COLLECTION_TEMPLATES, templateId);
    const templateDoc = await getDoc(templateRef);
    
    if (!templateDoc.exists()) {
      throw new Error('Template not found');
    }
    
    return { id: templateDoc.id, ...templateDoc.data() } as ClassPlanTemplate;
  } catch (error) {
    throw error;
  }
};

// Update a template
export const updateClassPlanTemplate = async (
  templateId: string,
  updates: { name?: string; items?: any[] }
): Promise<void> => {
  try {
    const templateRef = doc(db, COLLECTION_TEMPLATES, templateId);
    
    const updateData: any = {};
    if (updates.name !== undefined) {
      updateData.name = updates.name;
    }
    if (updates.items !== undefined) {
      updateData.items = updates.items;
    }
    
    await updateDoc(templateRef, updateData);
  } catch (error) {
    throw error;
  }
};

/**
 * Add a child item to a class plan item
 * @param classPlanId The ID of the class plan
 * @param parentItemId The ID of the parent item
 * @param title The title of the new child item
 * @param description Optional description for the new child item
 * @param insertBeforeId Optional ID of an existing child to insert the new item before
 */
export const addChildItem = async (
  classPlanId: string,
  parentItemId: string,
  title: string,
  description?: string,
  insertBeforeId?: string
): Promise<void> => {
  try {
    // Get the class plan
    const classPlanRef = doc(db, 'classPlans', classPlanId);
    const classPlanSnap = await getDoc(classPlanRef);
    
    if (!classPlanSnap.exists()) {
      throw new Error('Class plan not found');
    }
    
    const classPlan = classPlanSnap.data() as ClassPlan;
    const newItem: ClassPlanItem = {
      id: uuidv4(),
      title,
      description: description || '',
      completed: false,
      children: [],
      isExpanded: true,
    };
    
    // Find the parent item and add the child
    const updatedItems = findAndAddChild(classPlan.items, parentItemId, newItem, insertBeforeId);
    
    // Update the class plan
    await updateDoc(classPlanRef, {
      items: updatedItems
    });
  } catch (error) {
    console.error('Error adding child item:', error);
    throw error;
  }
};

/**
 * Helper function to find a parent item and add a child to it
 * @param items The array of items to search through
 * @param parentId The ID of the parent item
 * @param newChild The new child item to add
 * @param insertBeforeId Optional ID of an existing child to insert the new item before
 */
const findAndAddChild = (
  items: ClassPlanItem[],
  parentId: string,
  newChild: ClassPlanItem,
  insertBeforeId?: string
): ClassPlanItem[] => {
  return items.map(item => {
    if (item.id === parentId) {
      // Initialize children array if it doesn't exist
      const children = item.children || [];
      
      // If insertBeforeId is provided, insert the new child at the correct position
      if (insertBeforeId) {
        const insertIndex = children.findIndex(child => child.id === insertBeforeId);
        if (insertIndex !== -1) {
          // Insert the new child at the specified position
          const updatedChildren = [
            ...children.slice(0, insertIndex),
            newChild,
            ...children.slice(insertIndex)
          ];
          return {
            ...item,
            children: updatedChildren,
            isExpanded: true // Auto-expand when adding a child
          };
        }
      }
      
      // If insertBeforeId is not provided or not found, add to the end
      return {
        ...item,
        children: [...children, newChild],
        isExpanded: true // Auto-expand when adding a child
      };
    }
    
    // If this item has children, recursively search them
    if (item.children && item.children.length > 0) {
      return {
        ...item,
        children: findAndAddChild(item.children, parentId, newChild, insertBeforeId)
      };
    }
    
    // No match, return the item unchanged
    return item;
  });
};

/**
 * Toggle the expanded state of an item
 */
export const toggleItemExpanded = async (
  classPlanId: string,
  itemId: string
): Promise<void> => {
  try {
    // Get the class plan
    const classPlanRef = doc(db, 'classPlans', classPlanId);
    const classPlanSnap = await getDoc(classPlanRef);
    
    if (!classPlanSnap.exists()) {
      throw new Error('Class plan not found');
    }
    
    const classPlan = classPlanSnap.data() as ClassPlan;
    
    // Find the item and toggle its expanded state
    const updatedItems = toggleItemExpandedState(classPlan.items, itemId);
    
    // Update the class plan
    await updateDoc(classPlanRef, {
      items: updatedItems
    });
  } catch (error) {
    console.error('Error toggling item expanded state:', error);
    throw error;
  }
};

/**
 * Helper function to find an item and toggle its expanded state
 */
const toggleItemExpandedState = (
  items: ClassPlanItem[],
  itemId: string
): ClassPlanItem[] => {
  return items.map(item => {
    if (item.id === itemId) {
      return {
        ...item,
        isExpanded: !(item.isExpanded || false)
      };
    }
    
    // If this item has children, recursively search them
    if (item.children && item.children.length > 0) {
      return {
        ...item,
        children: toggleItemExpandedState(item.children, itemId)
      };
    }
    
    // No match, return the item unchanged
    return item;
  });
};

// Insert a new item before an existing one at the top level
export const insertItemBefore = async (
  classPlanId: string,
  beforeItemId: string,
  title: string,
  description?: string
): Promise<void> => {
  try {
    
    const planRef = doc(db, COLLECTION_PLANS, classPlanId);
    const planDoc = await getDoc(planRef);
    
    if (!planDoc.exists()) {
      throw new Error('Class plan not found');
    }
    
    const plan = planDoc.data() as ClassPlan;
    
    // Create the new item
    const newItem: ClassPlanItem = {
      id: uuidv4(),
      title,
      description,
      completed: false
    };
    
    // Find the index of the item to insert before
    const beforeItemIndex = plan.items.findIndex(item => item.id === beforeItemId);
    
    if (beforeItemIndex === -1) {
      throw new Error('Target item not found in class plan');
    }
    
    // Insert the new item at the found position
    const updatedItems = [
      ...plan.items.slice(0, beforeItemIndex),
      newItem,
      ...plan.items.slice(beforeItemIndex)
    ];
    
    await updateDoc(planRef, {
      items: updatedItems,
      updatedAt: serverTimestamp()
    });
    
    return;
  } catch (error) {
    throw error;
  }
}; 