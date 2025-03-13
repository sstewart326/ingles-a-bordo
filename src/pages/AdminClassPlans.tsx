import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import Select from 'react-select';
import { useAuth } from '../hooks/useAuth';
import { 
  getStudentClassPlans, 
  createClassPlan, 
  addClassPlanItem, 
  updateClassPlanItem, 
  deleteClassPlanItem,
  deleteClassPlan,
  getClassPlanTemplates,
  createClassPlanTemplate,
  updateClassPlanTemplate,
  applyTemplateToClassPlan,
  deleteClassPlanTemplate,
  addChildItem,
  toggleItemExpanded,
  insertItemBefore
} from '../services/classPlanService';
import { ClassPlan, ClassPlanItem, ClassPlanTemplate } from '../types/interfaces';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import Modal from '../components/Modal';
import { 
  PlusIcon, 
  TrashIcon, 
  PencilIcon, 
  CheckIcon, 
  DocumentDuplicateIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { styles } from '../styles/styleUtils';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface SelectOption {
  value: string;
  label: string;
}

// Simple tooltip component
const Tooltip = ({ children, text }: { children: React.ReactNode, text: string }) => {
  return (
    <span className="relative inline-flex items-center group">
      <span className="cursor-help">
        {children}
      </span>
      <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-3 py-2 w-56 max-w-xs bg-gray-800 text-white text-sm rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
        {text}
        <span className="absolute w-2 h-2 bg-gray-800 transform rotate-45 left-1/2 -translate-x-1/2 -bottom-1"></span>
      </span>
    </span>
  );
};

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const AdminClassPlans = () => {
  const { currentUser } = useAuth();
  const { language } = useLanguage();
  const t = useTranslation(language);
  
  // State for month/year selection
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth());
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  
  // State for student selection
  const [students, setStudents] = useState<User[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<SelectOption | null>(null);
  
  // State for class plans
  const [classPlan, setClassPlan] = useState<ClassPlan | null>(null);
  const [loading, setLoading] = useState(true);
  
  // State for modals
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);
  const [showDeletePlanModal, setShowDeletePlanModal] = useState(false);
  
  // State for form inputs
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [editingItem, setEditingItem] = useState<ClassPlanItem | null>(null);
  const [editItemTitle, setEditItemTitle] = useState('');
  const [editItemDescription, setEditItemDescription] = useState('');
  
  // State for templates
  const [templates, setTemplates] = useState<ClassPlanTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templateName, setTemplateName] = useState('');
  
  // State for child item modal
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [parentItemId, setParentItemId] = useState<string | null>(null);
  const [insertBeforeId, setInsertBeforeId] = useState<string | null>(null);
  
  // State for insert parent modal
  const [showInsertParentModal, setShowInsertParentModal] = useState(false);
  const [insertBeforeParentId, setInsertBeforeParentId] = useState<string | null>(null);
  
  // State for template viewing and editing
  const [showViewTemplateModal, setShowViewTemplateModal] = useState(false);
  const [showEditTemplateModal, setShowEditTemplateModal] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<ClassPlanTemplate | null>(null);
  const [editTemplateName, setEditTemplateName] = useState('');
  const [templateItems, setTemplateItems] = useState<any[]>([]);
  
  // Fetch all students
  const fetchStudents = useCallback(async () => {
    try {
      const usersRef = collection(db, 'users');
      const querySnapshot = await getDocs(usersRef);
      const fetchedStudents: User[] = [];
      
      querySnapshot.forEach((doc) => {
        const userData = doc.data();
        // Only include non-admin users
        if (!userData.isAdmin) {
          fetchedStudents.push({
            id: doc.id,
            email: userData.email,
            name: userData.name
          });
        }
      });
      
      setStudents(fetchedStudents);
    } catch (error) {
      console.error('Error fetching students:', error);
      toast.error('Failed to load students');
    }
  }, []);
  
  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    try {
      const fetchedTemplates = await getClassPlanTemplates();
      setTemplates(fetchedTemplates);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Failed to load templates');
    }
  }, []);
  
  // Fetch class plan for selected student and month/year
  const fetchClassPlan = useCallback(async () => {
    if (!selectedStudent) return;
    
    setLoading(true);
    try {
      const plans = await getStudentClassPlans(
        selectedStudent.value,
        selectedMonth,
        selectedYear
      );
      
      if (plans.length > 0) {
        setClassPlan(plans[0]);
      } else {
        setClassPlan(null);
      }
    } catch (error) {
      console.error('Error fetching class plan:', error);
      toast.error('Failed to load class plan');
    } finally {
      setLoading(false);
    }
  }, [selectedStudent, selectedMonth, selectedYear]);
  
  // Combined function to create a class plan and add the first item
  const handleAddFirstItem = async () => {
    if (!selectedStudent || !currentUser) return;
    
    try {
      // First create the class plan
      await createClassPlan(
        selectedStudent.value,
        selectedMonth,
        selectedYear,
        currentUser.email || ''
      );
      
      // Fetch the updated plan
      await fetchClassPlan();
      
      // Add the item directly to the newly created plan
      if (classPlan) {
        await addClassPlanItem(classPlan.id, newItemTitle, newItemDescription);
        
        // Fetch the updated plan again
        await fetchClassPlan();
      }
      
      // Reset form and close modal
      setNewItemTitle('');
      setNewItemDescription('');
      setShowAddItemModal(false);
      toast.success('Item added to class plan');
    } catch (error) {
      console.error('Error adding first item:', error);
      toast.error('Failed to add item');
    }
  };
  
  // Add a new item to the class plan
  const handleAddItem = async () => {
    if (!classPlan || !newItemTitle.trim()) return;
    
    try {
      // Use the regular addClassPlanItem to add to the end of the list
      await addClassPlanItem(classPlan.id, newItemTitle, newItemDescription);
      
      await fetchClassPlan();
      setNewItemTitle('');
      setNewItemDescription('');
      setShowAddItemModal(false);
      toast.success('Item added');
    } catch (error) {
      console.error('Error adding item:', error);
      toast.error('Failed to add item');
    }
  };
  
  // Update an existing item
  const handleUpdateItem = async () => {
    if (!classPlan || !editingItem || !editItemTitle.trim()) return;
    
    try {
      await updateClassPlanItem(classPlan.id, editingItem.id, {
        title: editItemTitle,
        description: editItemDescription
      });
      
      await fetchClassPlan();
      setEditingItem(null);
      setEditItemTitle('');
      setEditItemDescription('');
      setShowEditItemModal(false);
      toast.success('Item updated');
    } catch (error) {
      console.error('Error updating item:', error);
      toast.error('Failed to update item');
    }
  };
  
  // Toggle item completion status
  const handleToggleComplete = async (item: ClassPlanItem) => {
    if (!classPlan) return;
    
    try {
      await updateClassPlanItem(classPlan.id, item.id, {
        completed: !item.completed
      });
      
      await fetchClassPlan();
      toast.success(item.completed ? 'Item marked as incomplete' : 'Item marked as completed');
    } catch (error) {
      console.error('Error toggling item completion:', error);
      toast.error('Failed to update item');
    }
  };
  
  // Delete an item
  const handleDeleteItem = async (itemId: string) => {
    if (!classPlan) return;
    
    try {
      await deleteClassPlanItem(classPlan.id, itemId);
      await fetchClassPlan();
      toast.success('Item deleted');
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error('Failed to delete item');
    }
  };
  
  // Open edit modal for an item
  const handleEditItem = (item: ClassPlanItem) => {
    setEditingItem(item);
    setEditItemTitle(item.title);
    setEditItemDescription(item.description || '');
    setShowEditItemModal(true);
  };
  
  // Create a new empty template
  const handleCreateNewTemplate = async () => {
    if (!templateName.trim() || !currentUser) return;
    
    try {
      // Create a template with empty items array
      await createClassPlanTemplate(
        templateName,
        [], // Empty items array
        currentUser.email || ''
      );
      
      await fetchTemplates();
      setTemplateName('');
      setShowTemplateModal(false);
      toast.success('Template created successfully. You can now add items to it.');
    } catch (error) {
      console.error('Error creating empty template:', error);
      toast.error('Failed to create template');
    }
  };
  
  // Apply a template to the current plan
  const handleApplyTemplate = async () => {
    if (!classPlan || !selectedTemplate) return;
    
    try {
      await applyTemplateToClassPlan(classPlan.id, selectedTemplate);
      await fetchClassPlan();
      setSelectedTemplate('');
      setShowApplyTemplateModal(false);
      toast.success('Template applied');
    } catch (error) {
      console.error('Error applying template:', error);
      toast.error('Failed to apply template');
    }
  };
  
  // Create a new class plan and apply a template to it
  const handleApplyTemplateToNewPlan = async () => {
    if (!selectedStudent || !currentUser || !selectedTemplate) return;
    
    try {
      // First create the class plan
      const newPlanId = await createClassPlan(
        selectedStudent.value,
        selectedMonth,
        selectedYear,
        currentUser.email || ''
      );
      
      // Immediately apply the template to the new plan without fetching in between
      await applyTemplateToClassPlan(newPlanId, selectedTemplate);
      
      // Now fetch the updated plan with the template applied
      await fetchClassPlan();
      
      setShowApplyTemplateModal(false);
      toast.success('Plan created with template');
    } catch (error) {
      console.error('Error creating plan with template:', error);
      toast.error('Failed to create plan with template');
    }
  };
  
  // Delete a template
  const handleDeleteTemplate = async (templateId: string) => {
    try {
      await deleteClassPlanTemplate(templateId);
      setTemplates(templates.filter(t => t.id !== templateId));
      toast.success('Template deleted successfully');
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    }
  };
  
  // Save template edits
  const handleSaveTemplateEdits = async () => {
    if (!currentTemplate || !editTemplateName.trim()) return;
    
    try {
      await updateClassPlanTemplate(currentTemplate.id, {
        name: editTemplateName,
        items: templateItems
      });
      
      setTemplates(templates.map(t => 
        t.id === currentTemplate.id 
          ? { ...t, name: editTemplateName, items: templateItems }
          : t
      ));
      
      setShowEditTemplateModal(false);
      setCurrentTemplate(null);
      setEditTemplateName('');
      setTemplateItems([]);
      toast.success('Template updated successfully');
    } catch (error) {
      console.error('Error updating template:', error);
      toast.error('Failed to update template');
    }
  };
  
  // Update template item title or description
  const handleUpdateTemplateItem = (index: number, field: 'title' | 'description', value: string) => {
    const updatedItems = [...templateItems];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value
    };
    setTemplateItems(updatedItems);
  };
  
  // Add a child item to a parent item
  const handleAddChildItem = async () => {
    if (!classPlan || !parentItemId || !newItemTitle.trim()) return;
    
    try {
      await addChildItem(
        classPlan.id, 
        parentItemId, 
        newItemTitle, 
        newItemDescription,
        insertBeforeId || undefined
      );
      await fetchClassPlan();
      setNewItemTitle('');
      setNewItemDescription('');
      setShowAddChildModal(false);
      setParentItemId(null);
      setInsertBeforeId(null);
      toast.success('Child item added');
    } catch (error) {
      console.error('Error adding child item:', error);
      toast.error('Failed to add child item');
    }
  };
  
  // Toggle the expanded state of an item
  const handleToggleExpanded = async (itemId: string) => {
    if (!classPlan) return;
    
    try {
      await toggleItemExpanded(classPlan.id, itemId);
      await fetchClassPlan();
    } catch (error) {
      console.error('Error toggling item expanded state:', error);
      toast.error('Failed to toggle item');
    }
  };
  
  // Open the add child modal for a specific parent
  const openAddChildModal = (parentId: string, beforeId?: string) => {
    setParentItemId(parentId);
    setInsertBeforeId(beforeId || null);
    setNewItemTitle('');
    setNewItemDescription('');
    setShowAddChildModal(true);
  };
  
  // Insert a new parent item before an existing one
  const handleInsertParentItem = async () => {
    if (!classPlan || !insertBeforeParentId || !newItemTitle.trim()) return;
    
    try {
      await insertItemBefore(
        classPlan.id,
        insertBeforeParentId,
        newItemTitle,
        newItemDescription
      );
      await fetchClassPlan();
      setNewItemTitle('');
      setNewItemDescription('');
      setShowInsertParentModal(false);
      setInsertBeforeParentId(null);
      toast.success('Item inserted');
    } catch (error) {
      console.error('Error inserting parent item:', error);
      toast.error('Failed to insert item');
    }
  };
  
  // Open the insert parent modal
  const openInsertParentModal = (beforeId: string) => {
    setInsertBeforeParentId(beforeId);
    setNewItemTitle('');
    setNewItemDescription('');
    setShowInsertParentModal(true);
  };
  
  // Recursive function to render an item and its children
  const renderItem = (item: ClassPlanItem, index: number, isChild: boolean = false) => {
    const hasChildren = item.children && item.children.length > 0;
    
    return (
      <li key={item.id} className={`py-4 relative ${isChild ? 'ml-8 border-l border-gray-200 pl-4 group/child' : 'group/parent'}`}>
        {/* Insert button for top-level items - make all controlled by hover */}
        {!isChild && (
          <div className="absolute -top-3 left-6 z-10 opacity-0 group-hover/parent:opacity-100 transition-opacity duration-200">
            <button
              onClick={() => openInsertParentModal(item.id)}
              className="p-1 rounded-full bg-green-500 text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              title="Insert item above"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
        )}
        
        {/* Main content area with hover effect */}
        <div className="group">
          {/* Insert button that appears on hover - removed to avoid confusion with other plus buttons */}
          
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1">
              {/* Expand/collapse button for items with children */}
              {hasChildren && (
                <button
                  onClick={() => handleToggleExpanded(item.id)}
                  className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700 bg-transparent"
                >
                  {item.isExpanded ? (
                    <span className="text-lg font-medium">-</span>
                  ) : (
                    <span className="text-lg font-medium">+</span>
                  )}
                </button>
              )}
              
              {/* Spacer for items without children to maintain alignment */}
              {!hasChildren && <div className="w-5"></div>}
              
              <div 
                onClick={() => handleToggleComplete(item)}
                className={`flex-shrink-0 w-6 h-6 flex items-center justify-center cursor-pointer
                  ${item.completed 
                    ? 'bg-green-500 text-white' 
                    : 'bg-white text-transparent'
                  } 
                  border-2 ${item.completed ? 'border-green-500' : 'border-gray-400'} 
                  rounded-full shadow-sm hover:shadow`}
              >
                {item.completed ? (
                  <CheckIcon className="h-4 w-4" strokeWidth={3} />
                ) : (
                  <div className="w-4 h-4 rounded-full"></div>
                )}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center">
                  <p className={`text-sm font-medium mr-2 ${
                    item.completed ? 'line-through text-gray-500' : 'text-gray-900'
                  }`}>
                    {item.title}
                  </p>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEditItem(item)}
                      className="p-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                      title="Edit item"
                    >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                    
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 rounded-full bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors"
                      title="Delete item"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                    
                    {/* Add a button to add children to this item */}
                    <button
                      onClick={() => openAddChildModal(item.id)}
                      className="p-1.5 rounded-full bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700 transition-colors"
                      title="Add child item"
                    >
                      <PlusIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                
                {item.description && (
                  <p className={`mt-1 text-sm ${
                    item.completed ? 'line-through text-gray-400' : 'text-gray-500'
                  }`}>
                    {item.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Render children if expanded */}
        {hasChildren && item.isExpanded && (
          <ul className="mt-2 divide-y divide-gray-100">
            {item.children!.map((child, childIndex) => (
              <li key={child.id} className="relative group/child">
                {/* Insert button that appears on hover above each child */}
                <div className="absolute -top-3 left-6 z-10">
                  <button
                    onClick={() => openAddChildModal(item.id, child.id)}
                    className="p-1 rounded-full bg-green-500 text-white opacity-0 group-hover/child:opacity-100 transition-opacity duration-200 hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    title="Add child item above"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </div>
                
                {renderItem(child, childIndex, true)}
              </li>
            ))}
            
            {/* Add button at the bottom of child items list - perfectly aligned with child checkboxes */}
            <li className="ml-8 border-l border-gray-200 pl-4 py-4">
              <div className="flex items-start space-x-3">
                <div className="w-5"></div> {/* Spacer for expand/collapse button */}
                <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                  <button
                    onClick={() => openAddChildModal(item.id)}
                    className="p-1.5 rounded-full bg-green-500 text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    title="Add new child item"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          </ul>
        )}
        
        {/* Show the insert button only for the last top-level item */}
        {!isChild && index === classPlan!.items.length - 1 && (
          <div className="flex justify-start ml-6 mt-4">
            <button
              onClick={() => {
                setNewItemTitle('');
                setNewItemDescription('');
                setShowAddItemModal(true);
              }}
              className="p-2 rounded-full bg-green-500 text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              title="Add new item at end"
            >
              <PlusIcon className="h-5 w-5" />
            </button>
          </div>
        )}
      </li>
    );
  };
  
  // Delete the entire class plan
  const handleDeleteClassPlan = async () => {
    if (!classPlan) return;
    
    try {
      await deleteClassPlan(classPlan.id);
      setClassPlan(null);
      setShowDeletePlanModal(false);
      toast.success('Class plan deleted successfully');
    } catch (error) {
      console.error('Error deleting class plan:', error);
      toast.error('Failed to delete class plan');
    }
  };
  
  // Initial data loading
  useEffect(() => {
    fetchStudents();
    fetchTemplates();
  }, [fetchStudents, fetchTemplates]);
  
  // Fetch class plan when selection changes
  useEffect(() => {
    if (selectedStudent) {
      fetchClassPlan();
    }
  }, [selectedStudent, selectedMonth, selectedYear, fetchClassPlan]);
  
  // Generate years for dropdown (current year - 1 to current year + 5)
  const years = Array.from(
    { length: 7 },
    (_, i) => currentDate.getFullYear() - 1 + i
  );
  
  // Convert students to select options
  const studentOptions = students.map(student => ({
    value: student.email,
    label: student.name ? `${student.name} (${student.email})` : student.email
  }));
  
  // Custom styles for the Select component
  const selectStyles = {
    option: (provided: any) => ({
      ...provided,
      color: '#374151', // darker text color (gray-700)
      fontWeight: '500', // medium font weight
    }),
    control: (provided: any) => ({
      ...provided,
      borderColor: '#D1D5DB', // gray-300
      '&:hover': {
        borderColor: '#9CA3AF', // gray-400
      },
    }),
    singleValue: (provided: any) => ({
      ...provided,
      color: '#111827', // nearly black text (gray-900)
      fontWeight: '500', // medium font weight
    }),
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className={`${styles.headings.h1} mb-6`}>{t.classPlans}</h1>
      
      {/* Selection Controls */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Student Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Student
            </label>
            <Select
              options={studentOptions}
              value={selectedStudent}
              onChange={(option: SelectOption | null) => setSelectedStudent(option)}
              placeholder="Select a student"
              className="basic-single"
              classNamePrefix="select"
              styles={selectStyles}
            />
          </div>
          
          {/* Month Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Month
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              {months.map((month, index) => (
                <option key={index} value={index}>
                  {month}
                </option>
              ))}
            </select>
          </div>
          
          {/* Year Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Year
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      {/* Class Plan Content */}
      {selectedStudent ? (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">
              {months[selectedMonth]} {selectedYear} Plan for {selectedStudent.label}
            </h2>
            
            <div className="flex space-x-2">
              {classPlan && (
                <>
                  <button
                    onClick={() => setShowTemplateModal(true)}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    <DocumentDuplicateIcon className="h-4 w-4 mr-1" />
                    Save as Template
                    <Tooltip text="Save the current class plan structure as a reusable template that can be applied to other students or months.">
                      <InformationCircleIcon className="h-4 w-4 ml-1 text-indigo-200" />
                    </Tooltip>
                  </button>
                  
                  <button
                    onClick={() => setShowDeletePlanModal(true)}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    <TrashIcon className="h-4 w-4 mr-1" />
                    Delete Plan
                  </button>
                </>
              )}
            </div>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          ) : classPlan ? (
            <>
              {classPlan.items.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No items in this plan yet. Add your first item to get started.</p>
                  <div className="flex justify-center space-x-3 mt-4">
                    <button
                      onClick={() => {
                        setNewItemTitle('');
                        setNewItemDescription('');
                        setShowAddItemModal(true);
                      }}
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    >
                      <PlusIcon className="h-4 w-4 mr-1" />
                      Add First Item
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTemplate('');
                        setShowApplyTemplateModal(true);
                      }}
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      <DocumentDuplicateIcon className="h-4 w-4 mr-1" />
                      Apply Template
                    </button>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {classPlan.items.map((item, index) => 
                    renderItem(item, index, false)
                  )}
                </ul>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">No class plan exists for this student in {months[selectedMonth]} {selectedYear}.</p>
              <div className="flex justify-center space-x-3">
                <button
                  onClick={() => {
                    setNewItemTitle('');
                    setNewItemDescription('');
                    setShowAddItemModal(true);
                  }}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  Add First Item
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    // When clicking "Create Plan with Template", we want to directly
                    // open the template selection modal with the context that we're creating a new plan
                    setSelectedTemplate('');
                    setShowApplyTemplateModal(true);
                  }}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <DocumentDuplicateIcon className="h-4 w-4 mr-1" />
                  Create Plan with Template
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <p className="text-gray-500">Please select a student to view or create a class plan.</p>
        </div>
      )}
      
      {/* Add Item Modal */}
      <Modal
        isOpen={showAddItemModal}
        onClose={() => setShowAddItemModal(false)}
      >
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-4">Add New Item</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="itemTitle" className="block text-sm font-medium text-gray-700">
                Title *
              </label>
              <input
                type="text"
                id="itemTitle"
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Enter item title"
              />
            </div>
            
            <div>
              <label htmlFor="itemDescription" className="block text-sm font-medium text-gray-700">
                Description (optional)
              </label>
              <textarea
                id="itemDescription"
                value={newItemDescription}
                onChange={(e) => setNewItemDescription(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Enter item description"
              />
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setShowAddItemModal(false)}
                className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              
              <button
                type="button"
                onClick={classPlan ? handleAddItem : handleAddFirstItem}
                disabled={!newItemTitle.trim()}
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      </Modal>
      
      {/* Edit Item Modal */}
      <Modal
        isOpen={showEditItemModal}
        onClose={() => setShowEditItemModal(false)}
      >
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-4">Edit Item</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="editItemTitle" className="block text-sm font-medium text-gray-700">
                Title *
              </label>
              <input
                type="text"
                id="editItemTitle"
                value={editItemTitle}
                onChange={(e) => setEditItemTitle(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Enter item title"
              />
            </div>
            
            <div>
              <label htmlFor="editItemDescription" className="block text-sm font-medium text-gray-700">
                Description (optional)
              </label>
              <textarea
                id="editItemDescription"
                value={editItemDescription}
                onChange={(e) => setEditItemDescription(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Enter item description"
              />
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setShowEditItemModal(false)}
                className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              
              <button
                type="button"
                onClick={handleUpdateItem}
                disabled={!editItemTitle.trim()}
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </Modal>
      
      {/* Save Template Modal */}
      <Modal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
      >
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-4">Create Template</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="templateName" className="block text-sm font-medium text-gray-700">
                Template Name *
              </label>
              <input
                type="text"
                id="templateName"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Enter template name"
              />
            </div>
            
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="flex items-start mb-4">
                <div className="flex-shrink-0">
                  <DocumentDuplicateIcon className="h-5 w-5 text-indigo-500" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-gray-900">Create New Template</h3>
                  <p className="text-sm text-gray-500">
                    After creating the template, you'll be able to add items to it using the edit button in the template library.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              
              <button
                type="button"
                onClick={handleCreateNewTemplate}
                disabled={!templateName.trim()}
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Create Template
              </button>
            </div>
          </div>
        </div>
      </Modal>
      
      {/* Apply Template Modal */}
      <Modal
        isOpen={showApplyTemplateModal}
        onClose={() => setShowApplyTemplateModal(false)}
      >
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            {!classPlan ? 'Create Plan with Template' : 'Apply Template'}
          </h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="templateSelect" className="block text-sm font-medium text-gray-700">
                Select Template *
              </label>
              <select
                id="templateSelect"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="">Select a template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.items.length} items)
                  </option>
                ))}
              </select>
            </div>
            
            {templates.length === 0 && (
              <p className="text-sm text-gray-500">
                No templates available. Save a plan as a template first.
              </p>
            )}
            
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setShowApplyTemplateModal(false)}
                className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              
              <button
                type="button"
                onClick={!classPlan ? handleApplyTemplateToNewPlan : handleApplyTemplate}
                disabled={!selectedTemplate}
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {!classPlan ? 'Create Plan with Template' : 'Apply Template'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
      
      {/* Add Child Item Modal */}
      <Modal
        isOpen={showAddChildModal}
        onClose={() => setShowAddChildModal(false)}
      >
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-4">Add Child Item</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="childItemTitle" className="block text-sm font-medium text-gray-700">
                Title *
              </label>
              <input
                type="text"
                id="childItemTitle"
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Enter child item title"
              />
            </div>
            
            <div>
              <label htmlFor="childItemDescription" className="block text-sm font-medium text-gray-700">
                Description (optional)
              </label>
              <textarea
                id="childItemDescription"
                value={newItemDescription}
                onChange={(e) => setNewItemDescription(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Enter child item description"
              />
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setShowAddChildModal(false)}
                className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              
              <button
                type="button"
                onClick={handleAddChildItem}
                disabled={!newItemTitle.trim()}
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Add Child Item
              </button>
            </div>
          </div>
        </div>
      </Modal>
      
      {/* Insert Parent Item Modal */}
      <Modal
        isOpen={showInsertParentModal}
        onClose={() => setShowInsertParentModal(false)}
      >
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-4">Insert Item Above</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="insertParentTitle" className="block text-sm font-medium text-gray-700">
                Title *
              </label>
              <input
                type="text"
                id="insertParentTitle"
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Enter item title"
              />
            </div>
            
            <div>
              <label htmlFor="insertParentDescription" className="block text-sm font-medium text-gray-700">
                Description (optional)
              </label>
              <textarea
                id="insertParentDescription"
                value={newItemDescription}
                onChange={(e) => setNewItemDescription(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Enter item description"
              />
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setShowInsertParentModal(false)}
                className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              
              <button
                type="button"
                onClick={handleInsertParentItem}
                disabled={!newItemTitle.trim()}
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Insert Item
              </button>
            </div>
          </div>
        </div>
      </Modal>
      
      {/* Templates Section */}
      <div className="mt-8 bg-white rounded-lg shadow-md p-6">
        <div className="mb-6">
          <h2 className={styles.headings.h2}>Template Library</h2>
        </div>
        
        {templates.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No templates available yet.</p>
            <p className="mt-2 text-sm">Templates allow you to reuse class plan structures across different students and months.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <div key={template.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-md font-medium text-gray-900">{template.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{template.items.length} items</p>
                  </div>
                  
                  <div>
                    <button
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="p-1.5 rounded-full bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600"
                      title="Delete template"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                <div className="mt-3 text-sm">
                  <p className="text-gray-600 font-medium">Top-level items:</p>
                  <ul className="mt-1 text-gray-500 list-disc list-inside">
                    {template.items.slice(0, 3).map((item, index) => (
                      <li key={index} className="truncate">{item.title}</li>
                    ))}
                    {template.items.length > 3 && (
                      <li className="text-indigo-500">
                        +{template.items.length - 3} more items...
                      </li>
                    )}
                  </ul>
                </div>
                
                <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
                  <span className="text-xs text-gray-400">
                    Created by: {template.createdBy.split('@')[0]}
                  </span>
                  
                  {selectedStudent && (
                    <button
                      onClick={() => {
                        setSelectedTemplate(template.id);
                        setShowApplyTemplateModal(true);
                      }}
                      className="px-2 py-1 text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      title={classPlan 
                        ? 'Add all items from this template to the current class plan'
                        : 'Create a new class plan using this template'}
                    >
                      {classPlan ? 'Apply to plan' : 'Create plan'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* View Template Modal */}
      <Modal
        isOpen={showViewTemplateModal}
        onClose={() => setShowViewTemplateModal(false)}
      >
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Template: {currentTemplate?.name}
          </h2>
          
          {currentTemplate && (
            <div className="space-y-4">
              <div className="border rounded-md p-4 bg-gray-50">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Template Items</h3>
                
                {currentTemplate.items.length === 0 ? (
                  <p className="text-sm text-gray-500">No items in this template.</p>
                ) : (
                  <ul className="space-y-2">
                    {currentTemplate.items.map((item, index) => (
                      <li key={index} className="text-sm">
                        <div className="font-medium">{item.title}</div>
                        {item.description && (
                          <div className="text-gray-500 ml-4">{item.description}</div>
                        )}
                        
                        {/* Render child items if they exist */}
                        {item.children && item.children.length > 0 && (
                          <ul className="ml-6 mt-1 space-y-1">
                            {item.children.map((child: any, childIndex: number) => (
                              <li key={childIndex} className="text-sm">
                                <div className="font-medium">{child.title}</div>
                                {child.description && (
                                  <div className="text-gray-500 ml-4">{child.description}</div>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              
              <div className="flex justify-center pt-4">
                <button
                  type="button"
                  onClick={() => setShowViewTemplateModal(false)}
                  className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
      
      {/* Edit Template Modal */}
      <Modal
        isOpen={showEditTemplateModal}
        onClose={() => setShowEditTemplateModal(false)}
      >
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-4">Edit Template</h2>
          
          {currentTemplate && (
            <div className="space-y-4">
              <div>
                <label htmlFor="editTemplateName" className="block text-sm font-medium text-gray-700">
                  Template Name *
                </label>
                <input
                  type="text"
                  id="editTemplateName"
                  value={editTemplateName}
                  onChange={(e) => setEditTemplateName(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="Enter template name"
                />
              </div>
              
              <div className="border rounded-md p-4 bg-gray-50">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Template Items</h3>
                
                {templateItems.length === 0 ? (
                  <p className="text-sm text-gray-500">No items in this template.</p>
                ) : (
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {templateItems.map((item, index) => (
                      <div key={index} className="border border-gray-200 rounded p-3 bg-white">
                        <div className="mb-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Title
                          </label>
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) => handleUpdateTemplateItem(index, 'title', e.target.value)}
                            className="block w-full text-sm rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Description (optional)
                          </label>
                          <textarea
                            value={item.description || ''}
                            onChange={(e) => handleUpdateTemplateItem(index, 'description', e.target.value)}
                            rows={2}
                            className="block w-full text-sm rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                          />
                        </div>
                        
                        {/* Child items are displayed but not editable directly */}
                        {item.children && item.children.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-xs font-medium text-gray-700 mb-1">Child Items:</p>
                            <ul className="pl-4 text-xs text-gray-500 list-disc">
                              {item.children.map((child: any, childIndex: number) => (
                                <li key={childIndex}>{child.title}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                <p className="mt-4 text-xs text-gray-500">
                  Note: For more complex changes to template structure, apply the template to a class plan, 
                  make your changes there, and save it as a new template.
                </p>
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditTemplateModal(false)}
                  className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Cancel
                </button>
                
                <button
                  type="button"
                  onClick={handleSaveTemplateEdits}
                  disabled={!editTemplateName.trim()}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Save Changes
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
      
      {/* Delete Plan Confirmation Modal */}
      <Modal
        isOpen={showDeletePlanModal}
        onClose={() => setShowDeletePlanModal(false)}
      >
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-4">Delete Class Plan</h2>
          <div className="bg-red-50 p-4 rounded-md mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <TrashIcon className="h-5 w-5 text-red-400" aria-hidden="true" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Warning</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>
                    Are you sure you want to delete this entire class plan? This action cannot be undone.
                    All items and progress will be permanently removed.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setShowDeletePlanModal(false)}
              className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancel
            </button>
            
            <button
              type="button"
              onClick={handleDeleteClassPlan}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              Delete Plan
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}; 