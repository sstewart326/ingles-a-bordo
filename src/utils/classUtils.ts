import { ClassSession } from './scheduleUtils';
import { getClassMaterials } from './classMaterialsUtils';
import { getMonthKey } from './calendarUtils';
import { toast } from 'react-hot-toast';
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
  const sevenDaysFromNowTime = sevenDaysFromNow.getTime();
  
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
      
      // If the class has specific dates, check if any are in the future but within the next 7 days
      if (extendedClass.dates && extendedClass.dates.length > 0) {
        // Check if any dates are today or in the future but within 7 days
        const hasUpcomingDate = extendedClass.dates.some(date => {
          const dateToCheck = new Date(date);
          // Ensure we're comparing dates at midnight in the local timezone
          dateToCheck.setHours(0, 0, 0, 0);
          const isUpcoming = dateToCheck.getTime() >= todayTime && dateToCheck.getTime() <= sevenDaysFromNowTime;
          
          if (isUpcoming) {
            console.log(`\nFound upcoming date for class ${c.id}:`);
            console.log('Date:', dateToCheck.toISOString());
            console.log('Today:', new Date(todayTime).toISOString());
            console.log('Is upcoming within 7 days:', isUpcoming);
          }
          
          return isUpcoming;
        });
        
        return hasUpcomingDate;
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
      
      // If both classes have specific dates, sort by the earliest upcoming date
      if (extendedA.dates && extendedA.dates.length > 0 && extendedB.dates && extendedB.dates.length > 0) {
        // Find the earliest upcoming date for each class
        const upcomingDatesA = extendedA.dates.filter(date => {
          const dateObj = new Date(date);
          dateObj.setHours(0, 0, 0, 0);
          return dateObj.getTime() >= todayTime && dateObj.getTime() <= sevenDaysFromNowTime;
        });
        const upcomingDatesB = extendedB.dates.filter(date => {
          const dateObj = new Date(date);
          dateObj.setHours(0, 0, 0, 0);
          return dateObj.getTime() >= todayTime && dateObj.getTime() <= sevenDaysFromNowTime;
        });
        
        if (upcomingDatesA.length > 0 && upcomingDatesB.length > 0) {
          const earliestA = new Date(Math.min(...upcomingDatesA.map(d => new Date(d).getTime())));
          const earliestB = new Date(Math.min(...upcomingDatesB.map(d => new Date(d).getTime())));
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