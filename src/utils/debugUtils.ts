// Debug utility functions
export const DEBUG_ENABLED = true;

export const debugLog = (message: string, data?: any) => {
  if (DEBUG_ENABLED) {
    if (data) {
      console.log(`[DEBUG] ${message}`, data);
    } else {
      console.log(`[DEBUG] ${message}`);
    }
  }
};

export const debugMaterials = (classId: string, materials: any, source: string) => {
  if (DEBUG_ENABLED) {
    console.log(`[DEBUG] Materials for class ${classId} from ${source}:`, materials);
  }
};

export const debugClassSession = (classSession: any, index: number) => {
  if (DEBUG_ENABLED) {
    console.log(`[DEBUG] Class ${index}:`, {
      id: classSession.id,
      title: classSession.title,
      dayOfWeek: classSession.dayOfWeek,
      startTime: classSession.startTime,
      endTime: classSession.endTime,
      materials: classSession.materials
    });
  }
}; 