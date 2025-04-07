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
  insertItemBefore,
  getAllStudentClassPlans
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
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowDownRightIcon
} from '@heroicons/react/24/outline';
import { styles } from '../styles/styleUtils';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { SelectOption, User } from '../types/interfaces';
import { Tooltip } from '../components/Tooltip';



const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const AdminClassPlans = () => {
  const { currentUser } = useAuth();
  const { language } = useLanguage();
  const t = useTranslation(language);
  
  // View mode state
  const [viewMode, setViewMode] = useState<'monthly' | 'all'>('monthly');
  
  // State for month/year selection
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth());
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  
  // State for student selection
  const [students, setStudents] = useState<User[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<SelectOption | null>(null);
  
  // State for class plans
  const [classPlan, setClassPlan] = useState<ClassPlan | null>(null);
  const [allClassPlans, setAllClassPlans] = useState<ClassPlan[]>([]);
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
  
  // State for highlighting updated controls
  const [highlightMonth, setHighlightMonth] = useState(false);
  const [highlightYear, setHighlightYear] = useState(false);
  
  // Add state for last modified timestamp
  const [lastModified, setLastModified] = useState<Date | null>(null);
  
  // At the top level of AdminClassPlans component, add:
  const [hoveredAddButton, setHoveredAddButton] = useState<string | null>(null);
  const [isWithinSection, setIsWithinSection] = useState(false);
  
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
            name: userData.name,
            isAdmin: userData.isAdmin,
            createdAt: userData.createdAt
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
        // Set last modified from the plan's updatedAt timestamp
        setLastModified(plans[0].updatedAt?.toDate() || null);
      } else {
        setClassPlan(null);
        setLastModified(null);
      }
    } catch (error) {
      console.error('Error fetching class plan:', error);
      toast.error('Failed to load class plan');
    } finally {
      setLoading(false);
    }
  }, [selectedStudent, selectedMonth, selectedYear]);
  
  // Fetch all class plans for selected student
  const fetchAllClassPlans = useCallback(async () => {
    if (!selectedStudent) return;
    
    setLoading(true);
    try {
      const plans = await getAllStudentClassPlans(selectedStudent.value);
      setAllClassPlans(plans);
    } catch (error) {
      console.error('Error fetching all class plans:', error);
      toast.error('Failed to load all class plans');
    } finally {
      setLoading(false);
    }
  }, [selectedStudent]);
  
  // Combined function to create a class plan and add the first item
  const handleAddFirstItem = async () => {
    if (!selectedStudent || !currentUser) return;
    
    try {
      // First create the class plan
      const newPlanId = await createClassPlan(
        selectedStudent.value,
        selectedMonth,
        selectedYear,
        currentUser.email || ''
      );
      
      // Add the item directly to the newly created plan using the returned ID
      await addClassPlanItem(newPlanId, newItemTitle, newItemDescription);
      
      // Fetch the updated plan after both operations are complete
      await fetchClassPlan();
      
      // Reset form and close modal
      setNewItemTitle('');
      setNewItemDescription('');
      setShowAddItemModal(false);
      setLastModified(new Date());
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
      await addClassPlanItem(classPlan.id, newItemTitle, newItemDescription);
      
      await fetchClassPlan();
      setNewItemTitle('');
      setNewItemDescription('');
      setShowAddItemModal(false);
      setLastModified(new Date());
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
      setLastModified(new Date());
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
      setLastModified(new Date());
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
      setLastModified(new Date());
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
    if (!templateName.trim() || !currentUser || !classPlan) return;
    
    try {
      // Check for existing templates with the same name
      const baseTemplateName = templateName.trim();
      let finalTemplateName = baseTemplateName;
      let counter = 1;
      
      // Find templates with the same base name or with (x) pattern
      const matchingTemplates = templates.filter(t => 
        t.name === baseTemplateName || 
        t.name.startsWith(baseTemplateName + ' (')
      );
      
      if (matchingTemplates.length > 0) {
        // Extract existing numbers from template names
        const existingNumbers = matchingTemplates
          .map(t => {
            const match = t.name.match(/\((\d+)\)$/);
            return match ? parseInt(match[1]) : 0;
          })
          .filter(n => !isNaN(n));
        
        // Find the highest number and increment by 1
        if (existingNumbers.length > 0) {
          counter = Math.max(...existingNumbers) + 1;
        }
        
        finalTemplateName = `${baseTemplateName} (${counter})`;
      }
      
      // Create a template with the current plan's items
      await createClassPlanTemplate(
        finalTemplateName,
        classPlan.items,
        currentUser.email || ''
      );
      
      await fetchTemplates();
      setTemplateName('');
      setShowTemplateModal(false);
      toast.success('Template created successfully');
    } catch (error) {
      console.error('Error creating template:', error);
      toast.error('Failed to create template');
    }
  };
  
  // Apply a template to the current plan
  const handleApplyTemplate = async () => {
    if (!selectedStudent || !selectedTemplate || !currentUser) return;
    
    try {
      let planId;
      
      // If no class plan exists, create one first
      if (!classPlan) {
        planId = await createClassPlan(
          selectedStudent.value,
          selectedMonth,
          selectedYear,
          currentUser.email || ''
        );
      } else {
        planId = classPlan.id;
      }
      
      // Apply the template to the plan
      await applyTemplateToClassPlan(planId, selectedTemplate);
      
      // Fetch the updated plan
      await fetchClassPlan();
      setSelectedTemplate('');
      setShowApplyTemplateModal(false);
      toast.success('Template applied');
    } catch (error) {
      console.error('Error applying template:', error);
      toast.error('Failed to apply template');
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
      setLastModified(new Date());
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
      setLastModified(new Date());
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
    const buttonId = `${item.id}-${isChild ? 'child' : 'parent'}`;
    const bottomButtonId = `${item.id}-bottom`;
    const isLastItem = !isChild && index === classPlan!.items.length - 1;
    
    const showButton = (id: string) => {
      if (window.innerWidth < 768) {
        // On mobile, always show buttons
        return true;
      }
      if (!isWithinSection) {
        // When outside section, only show bottom button of last item
        return isLastItem && id === bottomButtonId;
      }
      // When inside section, show the currently hovered button
      return hoveredAddButton === id;
    };
    
    return (
      <li key={item.id} className={`py-4 relative ${isChild ? 'ml-8 border-l border-gray-200 pl-4' : ''} group/item`}>
        {/* Top hover area */}
        <div 
          className="absolute -top-3 md:-top-4 left-0 w-full h-6 md:h-8"
          onMouseEnter={() => setHoveredAddButton(buttonId)}
        >
          <div className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 z-10">
            {!isChild ? <Tooltip text={!isChild ? "Insert a new item above" : "Insert a new sub-item above"} width='w-48' >
              <button
                onClick={() => !isChild ? openInsertParentModal(item.id) : openAddChildModal(item.id, item.id)}
                className={`p-0.5 md:p-1 rounded-full bg-green-500 text-white transition-opacity duration-200 hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 touch-manipulation ${
                  showButton(buttonId) ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <PlusIcon className="h-3 w-3 md:h-4 md:w-4" />
              </button>
            </Tooltip> : null}
          </div>
        </div>

        {/* Main item content */}
        <div className="relative">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-2 md:space-x-3 flex-1">
              {/* Expand/collapse button for items with children */}
              {hasChildren && (
                <button
                  onClick={() => handleToggleExpanded(item.id)}
                  className="flex-shrink-0 w-4 h-4 md:w-5 md:h-5 flex items-center justify-center text-gray-500 hover:text-gray-700 bg-transparent touch-manipulation"
                >
                  {item.isExpanded ? (
                    <span className="text-base md:text-lg font-medium">-</span>
                  ) : (
                    <span className="text-base md:text-lg font-medium">+</span>
                  )}
                </button>
              )}
              
              {!hasChildren && <div className="w-4 md:w-5"></div>}
              
              <div 
                onClick={() => handleToggleComplete(item)}
                className={`flex-shrink-0 w-4 h-4 md:w-6 md:h-6 flex items-center justify-center cursor-pointer touch-manipulation
                  ${item.completed 
                    ? 'bg-green-500 text-white' 
                    : 'bg-white text-transparent'
                  } 
                  border-2 ${item.completed ? 'border-green-500' : 'border-gray-400'} 
                  rounded-full shadow-sm hover:shadow`}
              >
                {item.completed ? (
                  <CheckIcon className="h-3 w-3 md:h-4 md:w-4" strokeWidth={3} />
                ) : (
                  <div className="w-3 h-3 md:w-4 md:h-4 rounded-full"></div>
                )}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center flex-wrap gap-1 md:gap-2">
                  <p className={`text-sm font-medium ${
                    item.completed ? 'text-gray-500' : 'text-gray-900'
                  }`}>
                    {item.title}
                  </p>
                  
                  <div className="flex flex-wrap gap-1 md:gap-2">
                    <Tooltip text="Edit this item" width='w-28' >
                      <button
                        onClick={() => handleEditItem(item)}
                        className="p-1 md:p-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 transition-colors touch-manipulation"
                      >
                        <PencilIcon className="h-3 w-3 md:h-5 md:w-5" />
                      </button>
                    </Tooltip>
                    
                    <Tooltip text="Delete this item" width='w-32' >
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1 md:p-1.5 rounded-full bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors touch-manipulation"
                      >
                        <TrashIcon className="h-3 w-3 md:h-5 md:w-5" />
                      </button>
                    </Tooltip>
                    
                    <Tooltip text="Add a sub-item underneath this item" width='w-72' >
                      <button
                        onClick={() => openAddChildModal(item.id)}
                        className="p-1 md:p-1.5 rounded-full bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700 transition-colors touch-manipulation"
                      >
                        <ArrowDownRightIcon className="h-3 w-3 md:h-5 md:w-5" />
                      </button>
                    </Tooltip>
                  </div>
                </div>
                
                {item.description && (
                  <p className={`mt-1 text-sm ${
                    item.completed ? 'text-gray-400' : 'text-gray-500'
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
              renderItem(child, childIndex, true)
            ))}
          </ul>
        )}

        {/* Bottom hover area for last item */}
        {isLastItem && (
          <div 
            className="absolute -bottom-3 md:-bottom-4 left-0 w-full h-6 md:h-8"
            onMouseEnter={() => setHoveredAddButton(bottomButtonId)}
          >
            <div className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 z-10">
              <Tooltip text="Add a new top-level item">
                <button
                  onClick={() => {
                    setNewItemTitle('');
                    setNewItemDescription('');
                    setShowAddItemModal(true);
                  }}
                  className={`p-0.5 md:p-1 rounded-full bg-green-500 text-white transition-opacity duration-200 hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 touch-manipulation ${
                    showButton(bottomButtonId) ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  <PlusIcon className="h-3 w-3 md:h-4 md:w-4" />
                </button>
              </Tooltip>
            </div>
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
  
  // Handle navigation to previous month
  const handlePreviousMonth = () => {
    if (selectedMonth === 0) {
      // If January, go to December of previous year
      setSelectedMonth(11);
      setSelectedYear(selectedYear - 1);
      setHighlightMonth(true);
      setHighlightYear(true);
    } else {
      // Otherwise just decrease month
      setSelectedMonth(selectedMonth - 1);
      setHighlightMonth(true);
    }
  };
  
  // Handle navigation to next month
  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      // If December, go to January of next year
      setSelectedMonth(0);
      setSelectedYear(selectedYear + 1);
      setHighlightMonth(true);
      setHighlightYear(true);
    } else {
      // Otherwise just increase month
      setSelectedMonth(selectedMonth + 1);
      setHighlightMonth(true);
    }
  };
  
  // Reset highlights after animation
  useEffect(() => {
    if (highlightMonth || highlightYear) {
      const timer = setTimeout(() => {
        setHighlightMonth(false);
        setHighlightYear(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [highlightMonth, highlightYear]);
  
  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      handlePreviousMonth();
    } else if (e.key === 'ArrowRight') {
      handleNextMonth();
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
      if (viewMode === 'monthly') {
        fetchClassPlan();
      } else {
        fetchAllClassPlans();
      }
    }
  }, [selectedStudent, selectedMonth, selectedYear, fetchClassPlan, fetchAllClassPlans, viewMode]);
  
  // Fetch all class plans when view mode changes to 'all'
  useEffect(() => {
    if (viewMode === 'all' && selectedStudent) {
      fetchAllClassPlans();
    }
  }, [viewMode, selectedStudent, fetchAllClassPlans]);
  
  // Generate years for dropdown (current year - 1 to current year + 5)
  const years = Array.from(
    { length: 7 },
    (_, i) => currentDate.getFullYear() - 1 + i
  );
  
  // Convert students to select options
  const studentOptions = students.map(student => ({
    value: student.email,
    label: student.name
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
  
  // Helper function to get month name
  const getMonthName = (month: number) => {
    return months[month];
  };
  
  // Render a single class plan in the all plans view
  const renderClassPlanCard = (plan: ClassPlan) => {
    const completedItems = plan.items.filter(item => item.completed).length;
    const totalItems = plan.items.length;
    const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
    
    // Helper function to recursively render items and their children
    const renderPlanItem = (item: ClassPlanItem, isChild: boolean = false) => {
      return (
        <li key={item.id} className={`py-2 ${isChild ? 'ml-6 border-l border-gray-200 pl-4' : ''}`}>
          <div className="flex items-start">
            <div className={`flex-shrink-0 w-4 h-4 mt-1 mr-2 rounded-full flex items-center justify-center ${item.completed ? 'bg-green-500' : 'bg-gray-300'}`}>
              {item.completed && <CheckIcon className="h-3 w-3 text-white" strokeWidth={3} />}
            </div>
            <div className="flex-1">
              <p className={`text-sm font-medium ${item.completed ? 'text-gray-400' : 'text-gray-700'}`}>
                {item.title}
              </p>
              {item.description && (
                <p className={`text-xs mt-1 ${item.completed ? 'text-gray-400' : 'text-gray-500'}`}>
                  {item.description}
                </p>
              )}
              
              {/* Render children recursively if they exist */}
              {item.children && item.children.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {item.children.map(child => renderPlanItem(child, true))}
                </ul>
              )}
            </div>
          </div>
        </li>
      );
    };
    
    return (
      <div key={plan.id} className="border rounded-lg p-4 mb-4 hover:shadow-md transition-shadow">
        <div className="mb-3 group">
          <h3 
            className="text-lg font-medium text-gray-900 hover:text-indigo-600 cursor-pointer flex items-center group"
            onClick={() => {
              setSelectedMonth(plan.month);
              setSelectedYear(plan.year);
              setViewMode('monthly');
            }}
            title="Click to edit in monthly view"
          >
            <span>{getMonthName(plan.month)} {plan.year}</span>
            <div className="ml-2 flex items-center text-indigo-500">
              <PencilIcon className="h-4 w-4 mr-1" />
              <span className="text-xs font-normal opacity-0 group-hover:opacity-100 transition-opacity">Edit</span>
              <ChevronRightIcon className="h-4 w-4 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </h3>
        </div>
        
        <div className="mb-3">
          <div className="flex justify-between text-sm text-gray-500 mb-1">
            <span>{completedItems} of {totalItems} items completed</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-500 h-2 rounded-full" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
        
        {plan.items.length > 0 ? (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Items:</p>
            <ul className="divide-y divide-gray-100">
              {plan.items.map(item => renderPlanItem(item))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No items in this plan.</p>
        )}
      </div>
    );
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
          
          {/* View Mode Toggle */}
          <div className="flex items-end">
            <div className="inline-flex rounded-md shadow-sm" role="group">
              <button
                type="button"
                onClick={() => setViewMode('monthly')}
                className={`px-4 py-2 text-sm font-medium rounded-l-md focus:z-10 focus:ring-2 focus:ring-indigo-500 focus:outline-none
                  ${viewMode === 'monthly' 
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'}`}
              >
                Monthly View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className={`px-4 py-2 text-sm font-medium rounded-r-md focus:z-10 focus:ring-2 focus:ring-indigo-500 focus:outline-none
                  ${viewMode === 'all' 
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'}`}
              >
                All Plans
              </button>
            </div>
          </div>
          
          {/* Month/Year Selection - Only show in monthly view */}
          {viewMode === 'monthly' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Month
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 transition-all duration-300 ${
                    highlightMonth ? 'bg-indigo-50 border-indigo-300' : ''
                  }`}
                >
                  {months.map((month, index) => (
                    <option key={index} value={index}>
                      {month}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Year
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 transition-all duration-300 ${
                    highlightYear ? 'bg-indigo-50 border-indigo-300' : ''
                  }`}
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Class Plan Content */}
      {selectedStudent ? (
        viewMode === 'monthly' ? (
          <div 
            className="bg-white rounded-lg shadow-md p-6"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onMouseEnter={() => setIsWithinSection(true)}
            onMouseLeave={() => {
              setIsWithinSection(false);
              setHoveredAddButton(null);
            }}
            aria-label={`Class plan for ${selectedStudent.label}, ${months[selectedMonth]} ${selectedYear}`}
          >
            <div className="mb-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <button
                    onClick={handlePreviousMonth}
                    className="p-2 mr-2 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
                    title="Previous month"
                    aria-label="Go to previous month"
                  >
                    <ChevronLeftIcon className="h-5 w-5" />
                  </button>
                  
                  <h2 className={styles.headings.h2}>
                    {months[selectedMonth]} {selectedYear}
                  </h2>
                  
                  <button
                    onClick={handleNextMonth}
                    className="p-2 ml-2 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
                    title="Next month"
                    aria-label="Go to next month"
                  >
                    <ChevronRightIcon className="h-5 w-5" />
                  </button>
                </div>
                
                <div className="flex space-x-2">
                  {classPlan && (
                    <>
                      <Tooltip text="Optional: Save this plan structure for reuse with other students">
                        <button
                          onClick={() => setShowTemplateModal(true)}
                          className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          Save as Template
                        </button>
                      </Tooltip>
                      
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
              
              <div className="flex items-center justify-between mt-2">
                <p className="text-sm text-gray-500">
                  Plan for {selectedStudent.label}
                </p>
                {classPlan && lastModified && (
                  <p className="text-sm text-gray-400 flex items-center">
                    <span className="mr-1">Last saved:</span>
                    <span className="font-medium">{lastModified.toLocaleString()}</span>
                  </p>
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
                      
                      {templates.length > 0 && (
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
                      )}
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
                  
                  {templates.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTemplate('');
                        setShowApplyTemplateModal(true);
                      }}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      <DocumentDuplicateIcon className="h-4 w-4 mr-1" />
                      Apply Template
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          // All Plans View
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="mb-6">
              <h2 className={styles.headings.h2}>
                All Study Plans for {selectedStudent.label}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Showing all study plans ordered by most recent. Click on a month to view in monthly mode.
              </p>
            </div>
            
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : allClassPlans.length > 0 ? (
              <div className="max-h-[800px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                {allClassPlans.map(plan => renderClassPlanCard(plan))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">No class plans exist for this student yet.</p>
                <div className="flex justify-center space-x-3">
                  <button
                    onClick={() => {
                      setViewMode('monthly');
                    }}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Switch to Monthly View
                  </button>
                </div>
              </div>
            )}
          </div>
        )
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
            Apply Template to Plan
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
                onClick={handleApplyTemplate}
                disabled={!selectedTemplate}
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Apply Template
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
                      title="Add all items from this template to the current class plan"
                    >
                      Apply to plan
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