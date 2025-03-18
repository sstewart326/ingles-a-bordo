import { ClassSession, ClassWithStudents, getBaseClassId } from './scheduleUtils';
import { getClassMaterials } from './classMaterialsUtils';
import { getMonthKey } from './calendarUtils';
import toast from 'react-hot-toast';
import { ClassMaterial } from '../types/interfaces';

// Extended interface to include dates property
interface ExtendedClassSession extends ClassSession {
  dates?: Date[];
  studentNames?: string[];
}

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

export const updateClassList = ({ classes, upcomingClasses, pastClasses, setUpcomingClasses, setPastClasses }: UpdateClassListParams) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();
  
  // Calculate dates for 7 days ago and 7 days from now
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const sevenDaysAgoTime = sevenDaysAgo.getTime();
  
  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(today.getDate() + 7);
  
  console.log('\n=== Date Processing ===');
  console.log('Today (midnight):', today.toISOString());
  console.log('Seven days ago:', sevenDaysAgo.toISOString());
  console.log('Seven days from now:', sevenDaysFromNow.toISOString());

  // Log all classes with their dates for debugging
  console.log('\nAll classes with dates:');
  classes.forEach(c => {
    const extendedClass = c as ExtendedClassSession;
    if (extendedClass.dates && extendedClass.dates.length > 0) {
      console.log(`Class ${c.id}:`, {
        dates: extendedClass.dates.map(d => new Date(d).toISOString()),
        dayOfWeek: c.dayOfWeek,
        startTime: c.startTime,
        endTime: c.endTime,
        scheduleType: c.scheduleType,
        schedules: c.schedules
      });
    }
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

  // Filter classes based on their dates
  const newUpcomingClasses = classes
    .filter(c => {
      const extendedClass = c as ExtendedClassSession;
      
      // If the class has specific dates, check if any are today or in the future
      if (extendedClass.dates && extendedClass.dates.length > 0) {
        // Check if any dates are today or in the future
        const hasFutureDate = extendedClass.dates.some(date => {
          const dateToCheck = new Date(date);
          // Ensure we're comparing dates at midnight in the local timezone
          dateToCheck.setHours(0, 0, 0, 0);
          const isFuture = dateToCheck.getTime() >= todayTime;
          
          if (isFuture) {
            console.log(`\nFound future date for class ${c.id}:`);
            console.log('Date:', dateToCheck.toISOString());
            console.log('Today:', new Date(todayTime).toISOString());
            console.log('Is in the future:', isFuture);
          }
          
          return isFuture;
        });
        
        return hasFutureDate;
      }
      
      return false;
    })
    .map(c => {
      // Preserve materials from existing classes
      const existingClass = existingUpcomingClassesMap.get(c.id);
      return existingClass ? { ...c, materials: existingClass.materials } : c;
    })
    .sort((a, b) => {
      const extendedA = a as ExtendedClassSession;
      const extendedB = b as ExtendedClassSession;
      
      // If both classes have specific dates, sort by the earliest future date
      if (extendedA.dates && extendedA.dates.length > 0 && extendedB.dates && extendedB.dates.length > 0) {
        // Find the earliest future date for each class
        const futureDatesA = extendedA.dates.filter(date => {
          const dateObj = new Date(date);
          dateObj.setHours(0, 0, 0, 0);
          return dateObj.getTime() >= todayTime;
        });
        const futureDatesB = extendedB.dates.filter(date => {
          const dateObj = new Date(date);
          dateObj.setHours(0, 0, 0, 0);
          return dateObj.getTime() >= todayTime;
        });
        
        if (futureDatesA.length > 0 && futureDatesB.length > 0) {
          const earliestA = new Date(Math.min(...futureDatesA.map(d => new Date(d).getTime())));
          const earliestB = new Date(Math.min(...futureDatesB.map(d => new Date(d).getTime())));
          return earliestA.getTime() - earliestB.getTime();
        }
      }
      
      return 0;
    });

  const newPastClasses = classes
    .filter(c => {
      const extendedClass = c as ExtendedClassSession;
      
      // If the class has specific dates, check if any are in the past but within the last 7 days
      if (extendedClass.dates && extendedClass.dates.length > 0) {
        // Check if any dates are in the past but within the last 7 days
        const hasPastDate = extendedClass.dates.some(date => {
          const dateToCheck = new Date(date);
          // Ensure we're comparing dates at midnight in the local timezone
          dateToCheck.setHours(0, 0, 0, 0);
          const isPastWithinSevenDays = dateToCheck.getTime() < todayTime && dateToCheck.getTime() >= sevenDaysAgoTime;
          
          if (isPastWithinSevenDays) {
            console.log(`Class ${c.id}: ${dateToCheck.toISOString()} is past within 7 days`);
          }
          
          return isPastWithinSevenDays;
        });
        
        return hasPastDate;
      }
      
      return false;
    })
    .map(c => {
      // Preserve materials from existing classes
      const existingClass = existingPastClassesMap.get(c.id);
      return existingClass ? { ...c, materials: existingClass.materials } : c;
    })
    .sort((a, b) => {
      const extendedA = a as ExtendedClassSession;
      const extendedB = b as ExtendedClassSession;
      
      // If both classes have specific dates, sort by the most recent past date
      if (extendedA.dates && extendedA.dates.length > 0 && extendedB.dates && extendedB.dates.length > 0) {
        // Find the most recent past date for each class within the last 7 days
        const pastDatesA = extendedA.dates.filter(date => {
          const dateObj = new Date(date);
          dateObj.setHours(0, 0, 0, 0);
          return dateObj.getTime() < todayTime && dateObj.getTime() >= sevenDaysAgoTime;
        });
        const pastDatesB = extendedB.dates.filter(date => {
          const dateObj = new Date(date);
          dateObj.setHours(0, 0, 0, 0);
          return dateObj.getTime() < todayTime && dateObj.getTime() >= sevenDaysAgoTime;
        });
        
        if (pastDatesA.length > 0 && pastDatesB.length > 0) {
          const mostRecentA = new Date(Math.max(...pastDatesA.map(d => new Date(d).getTime())));
          const mostRecentB = new Date(Math.max(...pastDatesB.map(d => new Date(d).getTime())));
          return mostRecentB.getTime() - mostRecentA.getTime(); // Most recent first
        }
      }
      
      return 0;
    });

  console.log('\n=== Final Classification ===');
  console.log('Upcoming classes (next 7 days):', newUpcomingClasses.map(c => ({
    id: c.id,
    dates: (c as ExtendedClassSession).dates?.map(d => new Date(d).toISOString()),
    scheduleType: c.scheduleType,
    schedules: c.schedules
  })));
  console.log('Past classes (last 7 days):', newPastClasses.map(c => ({
    id: c.id,
    dates: (c as ExtendedClassSession).dates?.map(d => new Date(d).toISOString()),
    scheduleType: c.scheduleType,
    schedules: c.schedules
  })));
  
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
  if (!classId) {
    console.error('No class ID provided to fetchMaterialsForClass');
    return null;
  }
  
  try {
    // For classes with multiple schedules, use the base class ID to fetch materials
    const baseClassId = getBaseClassId(classId);
    
    // Fetch materials for this class using the base class ID
    const materials = await getClassMaterials(baseClassId, date);
    
    // Update the classMaterials state
    setState({
      classMaterials: {
        ...state.classMaterials,
        [classId]: materials
      }
    });
    
    // Update the selected day details if available
    if (selectedDayDetails && selectedDayDetails.classes) {
      const updatedSelectedDayDetails = {
        ...selectedDayDetails,
        materials: {
          ...selectedDayDetails.materials,
          [classId]: materials
        }
      };
      setSelectedDayDetails(updatedSelectedDayDetails);
    }
    
    return materials;
  } catch (error) {
    console.error('Error fetching materials for class:', classId, error);
    toast.error('Error fetching materials');
    return [];
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
  // First build a map of baseClassId -> all class IDs that share that base
  const baseClassIdMap: Record<string, string[]> = {};
  
  classes.forEach(classSession => {
    if (!classSession.id) return;
    
    // Get the base class ID
    const baseClassId = classSession.id.split('-')[0];
    
    if (!baseClassIdMap[baseClassId]) {
      baseClassIdMap[baseClassId] = [];
    }
    
    // Add this class ID to the list for this base class ID
    if (!baseClassIdMap[baseClassId].includes(classSession.id)) {
      baseClassIdMap[baseClassId].push(classSession.id);
    }
  });
  
  console.log('Base class ID map:', baseClassIdMap);
  
  // Create a map to store all materials by class ID
  const allMaterialsByClassId: Record<string, ClassMaterial[]> = {};
  
  // Fetch materials for each base class ID
  const baseClassPromises = Object.keys(baseClassIdMap).map(async (baseClassId) => {
    // Get materials for this base class ID
    const materials = await getClassMaterials(baseClassId);
    
    // Make sure all materials have an id for tracking
    const materialsWithIds = materials.map(material => 
      material.id ? material : { ...material, id: Math.random().toString(36).substring(2) }
    );
    
    if (materialsWithIds.length > 0) {
      console.log(`Found ${materialsWithIds.length} materials for base class ${baseClassId}`);
      
      // Store materials for all class IDs that share this base
      baseClassIdMap[baseClassId].forEach(classId => {
        allMaterialsByClassId[classId] = materialsWithIds;
      });
    }
  });
  
  // Wait for all materials to be fetched
  await Promise.all(baseClassPromises);
  
  // Update the classMaterials state with all materials
  if (Object.keys(allMaterialsByClassId).length > 0) {
    setState({
      classMaterials: {
        ...state.classMaterials,
        ...allMaterialsByClassId
      }
    });
    
    // Also update the materials property directly on upcoming and past classes
    const { upcomingClasses, pastClasses } = state;
    
    // Function to attach materials to classes
    const attachMaterialsToClasses = (classesList: ClassSession[]): ClassSession[] => {
      return classesList.map(classSession => {
        if (classSession.id && allMaterialsByClassId[classSession.id]) {
          return {
            ...classSession,
            materials: allMaterialsByClassId[classSession.id]
          };
        }
        return classSession;
      });
    };
    
    // Update upcoming and past classes with materials
    setState({
      upcomingClasses: attachMaterialsToClasses(upcomingClasses),
      pastClasses: attachMaterialsToClasses(pastClasses)
    });
    
    // If there are selected day details, update the materials there too
    if (selectedDayDetails) {
      // Update materials map in selected day details
      const updatedMaterials = {
        ...selectedDayDetails.materials,
        ...allMaterialsByClassId
      };
      
      // Update materials property on classes in selected day details
      const updatedClasses = selectedDayDetails.classes.map((c: ClassSession) => {
        if (c.id && allMaterialsByClassId[c.id]) {
          return {
            ...c,
            materials: allMaterialsByClassId[c.id]
          };
        }
        return c;
      });
      
      // Update selected day details
      setSelectedDayDetails({
        ...selectedDayDetails,
        materials: updatedMaterials,
        classes: updatedClasses
      });
    }
  }
}; 