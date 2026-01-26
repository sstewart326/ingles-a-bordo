/**
 * Time utility functions for generating time options and calculating end times
 * Shared across AdminSchedule and ClassExceptionManager components
 */

/**
 * Generates an array of time options from 6 AM to 9 PM in 30-minute intervals
 * Formatted as "hh:mm AM/PM" (e.g., "09:00 AM", "09:30 AM")
 * @returns Array of formatted time strings
 */
export const generateTimeOptions = (): string[] => {
  const times: string[] = [];
  // Start from 6 AM and go until 9 PM
  for (let hour = 6; hour <= 21; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const time = new Date();
      time.setHours(hour);
      time.setMinutes(minute);
      // Format consistently as "hh:mm AM/PM"
      const formattedTime = time.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true 
      });
      times.push(formattedTime);
    }
  }
  return times;
};

/**
 * Calculates the end time by adding 1 hour to the start time
 * @param startTime - Time string in "hh:mm AM/PM" format (e.g., "09:00 AM")
 * @returns End time string in "hh:mm AM/PM" format (e.g., "10:00 AM")
 */
export const calculateEndTime = (startTime: string): string => {
  // Parse the start time
  const [timeStr, period] = startTime.split(' ');
  const [hours, minutes] = timeStr.split(':').map(Number);
  
  // Create Date object for start time
  const startDate = new Date();
  startDate.setHours(
    period === 'PM' && hours !== 12 ? hours + 12 : (period === 'AM' && hours === 12 ? 0 : hours),
    minutes
  );
  
  // Add 1 hour
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  
  // Format end time in 12-hour format
  const endTime = endDate.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: true 
  });
  
  return endTime;
};

/**
 * Converts a 24-hour time string (e.g., "09:00") to 12-hour format (e.g., "09:00 AM")
 * @param time24Hour - Time string in 24-hour format "HH:mm"
 * @returns Time string in 12-hour format "hh:mm AM/PM"
 */
export const convert24HourTo12Hour = (time24Hour: string): string => {
  const [hours, minutes] = time24Hour.split(':').map(Number);
  const time = new Date();
  time.setHours(hours, minutes);
  return time.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: true 
  });
};

/**
 * Converts a 12-hour time string (e.g., "09:00 AM") to 24-hour format (e.g., "09:00")
 * @param time12Hour - Time string in 12-hour format "hh:mm AM/PM"
 * @returns Time string in 24-hour format "HH:mm"
 */
export const convert12HourTo24Hour = (time12Hour: string): string => {
  const [timeStr, period] = time12Hour.split(' ');
  const [hours, minutes] = timeStr.split(':').map(Number);
  
  let hour24 = hours;
  if (period === 'PM' && hours !== 12) {
    hour24 = hours + 12;
  } else if (period === 'AM' && hours === 12) {
    hour24 = 0;
  }
  
  return `${hour24.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};
