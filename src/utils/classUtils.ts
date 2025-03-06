import { ClassSession } from './scheduleUtils';
import { getClassMaterials } from './classMaterialsUtils';
import { getMonthKey } from './calendarUtils';
import { toast } from 'react-hot-toast';
import { ClassMaterial } from '../types/interfaces';

interface ClassState {
  upcomingClasses: ClassSession[];
  pastClasses: ClassSession[];
  classMaterials: Record<string, ClassMaterial[]>;
  loadedMaterialMonths: Set<string>;
}

interface UpdateClassListParams {
  classes: ClassSession[];
  upcomingClasses: ClassSession[];
  pastClasses: ClassSession[];
  setUpcomingClasses: (classes: ClassSession[]) => void;
  setPastClasses: (classes: ClassSession[]) => void;
}

// Helper function to compare times
const compareTimes = (timeA: string, timeB: string): number => {
  const getTime = (timeStr: string) => {
    if (!timeStr) return 0;
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!match) return 0;
    let [_, hours, minutes, period] = match;
    let hour = parseInt(hours);
    if (period) {
      period = period.toUpperCase();
      if (period === 'PM' && hour !== 12) hour += 12;
      if (period === 'AM' && hour === 12) hour = 0;
    }
    return hour * 60 + parseInt(minutes);
  };
  return getTime(timeA) - getTime(timeB);
};

export const updateClassList = ({ classes, upcomingClasses, pastClasses, setUpcomingClasses, setPastClasses }: UpdateClassListParams) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calculate start and end of current week
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay()); // Start from Sunday
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // End on Saturday
  endOfWeek.setHours(23, 59, 59, 999);

  // Get all days of the current week
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    return date.getDay();
  });

  // Create a map of existing classes with their materials
  const existingUpcomingClassesMap = new Map();
  upcomingClasses.forEach(c => {
    existingUpcomingClassesMap.set(c.id, c);
  });

  const existingPastClassesMap = new Map();
  pastClasses.forEach(c => {
    existingPastClassesMap.set(c.id, c);
  });

  // Filter classes based on their day of week and start date
  const newUpcomingClasses = classes
    .filter(c => {
      // Skip classes without a day of week
      if (c.dayOfWeek === undefined) return false;
      
      // Check if the class occurs on any day of the current week
      const isThisWeek = weekDays.includes(c.dayOfWeek);
      
      // For upcoming classes, we want to show them even if they haven't started yet
      // Only filter out if they have an end date that's passed
      if (c.endDate && c.endDate.toDate() < today) return false;
      
      // Check if the class hasn't happened yet today
      const hasntHappenedToday = c.dayOfWeek !== today.getDay() || 
        (c.startTime && new Date().getHours() < parseInt(c.startTime.split(':')[0]));
      
      return isThisWeek && hasntHappenedToday;
    })
    .map(c => {
      // Preserve materials from existing classes
      const existingClass = existingUpcomingClassesMap.get(c.id);
      return existingClass ? { ...c, materials: existingClass.materials } : c;
    })
    .sort((a, b) => {
      // Skip sorting if dayOfWeek is undefined
      if (a.dayOfWeek === undefined || b.dayOfWeek === undefined) return 0;
      
      // Sort by day of week first
      const dayDiff = a.dayOfWeek - b.dayOfWeek;
      if (dayDiff !== 0) return dayDiff;
      
      // Then by start time
      return compareTimes(a.startTime || '', b.startTime || '');
    });

  const newPastClasses = classes
    .filter(c => {
      // Skip classes without a day of week
      if (c.dayOfWeek === undefined) return false;
      
      // Check if the class occurs on any day of the current week
      const isThisWeek = weekDays.includes(c.dayOfWeek);
      
      // Check if the class has started based on start date
      const hasStarted = !c.startDate || c.startDate.toDate() <= today;
      if (!hasStarted) return false;
      
      // Check if the class has already happened today
      const hasHappenedToday = c.dayOfWeek !== today.getDay() || 
        (c.startTime && new Date().getHours() >= parseInt(c.startTime.split(':')[0]));
      
      return isThisWeek && hasHappenedToday;
    })
    .map(c => {
      // Preserve materials from existing classes
      const existingClass = existingPastClassesMap.get(c.id);
      return existingClass ? { ...c, materials: existingClass.materials } : c;
    })
    .sort((a, b) => {
      // Skip sorting if dayOfWeek is undefined
      if (a.dayOfWeek === undefined || b.dayOfWeek === undefined) return 0;
      
      // For past classes, we want to sort by the actual date and time
      const getDateForClass = (c: ClassSession) => {
        const date = new Date(startOfWeek);
        // We know dayOfWeek is defined here because we've filtered out undefined values
        date.setDate(startOfWeek.getDate() + (c.dayOfWeek as number));
        if (c.startTime) {
          const [hours, minutes] = c.startTime.split(':').map(Number);
          date.setHours(hours, minutes, 0, 0);
        }
        return date;
      };
      
      return getDateForClass(b).getTime() - getDateForClass(a).getTime();
    });

  setUpcomingClasses(newUpcomingClasses);
  setPastClasses(newPastClasses);
};

interface FetchMaterialsParams {
  classId: string;
  date: Date;
  state: ClassState;
  setState: (updates: Partial<ClassState>) => void;
  selectedDayDetails: any;
  setSelectedDayDetails: (details: any) => void;
}

export const fetchMaterialsForClass = async ({
  classId,
  date,
  state,
  setState,
  selectedDayDetails,
  setSelectedDayDetails
}: FetchMaterialsParams) => {
  try {
    const materials = await getClassMaterials(classId);
    
    // Update the materials state
    setState({
      classMaterials: {
        ...state.classMaterials,
        [classId]: materials
      }
    });

    // Update selected day details if they exist and match the current class
    if (selectedDayDetails && selectedDayDetails.classes.some((c: ClassSession) => c.id === classId)) {
      setSelectedDayDetails({
        ...selectedDayDetails,
        materials: {
          ...selectedDayDetails.materials,
          [classId]: materials
        }
      });
    }

    // Update the loaded material months
    const monthKey = getMonthKey(date);
    setState({
      loadedMaterialMonths: new Set([...state.loadedMaterialMonths, monthKey])
    });

    return materials;
  } catch (error) {
    console.error('Error fetching materials:', error);
    toast.error('Error fetching materials');
    return null;
  }
};

interface FetchMaterialsForClassesParams {
  classes: ClassSession[];
  state: ClassState;
  setState: (updates: Partial<ClassState>) => void;
  selectedDayDetails: any;
  setSelectedDayDetails: (details: any) => void;
}

export const fetchMaterialsForClasses = async ({
  classes,
  state,
  setState,
  selectedDayDetails,
  setSelectedDayDetails
}: FetchMaterialsForClassesParams) => {
  const promises = classes.map(async (classSession) => {
    // Get materials for this class without date filtering
    const materials = await getClassMaterials(classSession.id);
    
    if (materials && materials.length > 0) {
      console.log(`Found ${materials.length} materials for class ${classSession.id}`);
      
      // Update the classMaterials state
      setState({
        classMaterials: {
          ...state.classMaterials,
          [classSession.id]: materials
        }
      });
      
      // Update the upcoming classes with the materials
      const upcomingClassIndex = state.upcomingClasses.findIndex(c => c.id === classSession.id);
      if (upcomingClassIndex !== -1) {
        const updatedUpcomingClasses = [...state.upcomingClasses];
        updatedUpcomingClasses[upcomingClassIndex] = {
          ...updatedUpcomingClasses[upcomingClassIndex],
          materials: materials
        };
        console.log(`Updating upcoming class ${classSession.id} with materials`);
        setState({
          upcomingClasses: updatedUpcomingClasses
        });
      }
      
      // Update the past classes with the materials
      const pastClassIndex = state.pastClasses.findIndex(c => c.id === classSession.id);
      if (pastClassIndex !== -1) {
        const updatedPastClasses = [...state.pastClasses];
        updatedPastClasses[pastClassIndex] = {
          ...updatedPastClasses[pastClassIndex],
          materials: materials
        };
        console.log(`Updating past class ${classSession.id} with materials`);
        setState({
          pastClasses: updatedPastClasses
        });
      }
      
      // Update selected day details if they exist and match the current class
      if (selectedDayDetails && selectedDayDetails.classes.some((c: ClassSession) => c.id === classSession.id)) {
        setSelectedDayDetails({
          ...selectedDayDetails,
          materials: {
            ...selectedDayDetails.materials,
            [classSession.id]: materials
          }
        });
      }
    }
  });

  await Promise.all(promises);
}; 