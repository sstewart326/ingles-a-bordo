import { ClassSession, sortClassesByTime } from './scheduleUtils';

/**
 * Process dailyClassMap entries for a specific date
 * Trust the backend data - dailyClassMap already has everything we need.
 * Only adds missing properties from fullClassInfo, preserving all dailyClassMap values.
 * 
 * @param dailyClassMapEntries - Array of class entries from dailyClassMap[dateString]
 * @param fullClassInfoMap - Optional map of classId -> full class info for filling in missing properties
 * @returns Processed and sorted classes
 */
export const processDailyClassMapEntries = <T extends ClassSession = ClassSession>(
  dailyClassMapEntries: any[],
  fullClassInfoMap?: Map<string, any> | Record<string, any>
): T[] => {
  if (!dailyClassMapEntries || dailyClassMapEntries.length === 0) {
    return [];
  }

  // Process each entry - trust dailyClassMap values, only fill in missing properties
  const processedClasses: T[] = dailyClassMapEntries.map((classEntry: any) => {
    // Start with the dailyClassMap entry as-is (it has the correct times)
    let processed: any = { ...classEntry };
    
    // Only if full class info is provided, fill in missing properties (but never override existing ones)
    if (fullClassInfoMap) {
      const classId = classEntry.id;
      const baseId = classId.split('-')[0];
      
      let fullClassInfo: any = null;
      if (fullClassInfoMap instanceof Map) {
        fullClassInfo = fullClassInfoMap.get(classId) || fullClassInfoMap.get(baseId);
      } else {
        fullClassInfo = fullClassInfoMap[classId] || fullClassInfoMap[baseId];
      }
      
      if (fullClassInfo) {
        // Only add properties that don't exist in classEntry
        Object.keys(fullClassInfo).forEach(key => {
          if (processed[key] === undefined || processed[key] === null || processed[key] === '') {
            processed[key] = fullClassInfo[key];
          }
        });
      }
    }
    
    return processed as T;
  });
  
  // No deduplication - trust the backend data
  // Sort classes by time
  return sortClassesByTime(processedClasses) as T[];
};
