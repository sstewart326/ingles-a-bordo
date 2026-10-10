// Utility function to generate month keys for tracking loaded data
export const getMonthKey = (date: Date, offset: number = 0): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + offset;
  
  // Handle year boundaries
  if (month < 0) {
    return `${year - 1}-${11}`; // December of previous year
  } else if (month > 11) {
    return `${year + 1}-${0}`; // January of next year
  }
  
  return `${year}-${month}`;
};
