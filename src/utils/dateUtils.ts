import { format } from 'date-fns';

export const formatTimeToAMPM = (timeStr: string): string => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const ampm = hours >= 12 ? 'pm' : 'am';
  const formattedHours = hours % 12 || 12;
  return `${formattedHours}${minutes > 0 ? `:${minutes.toString().padStart(2, '0')}` : ''} ${ampm}`;
};

export const formatTimeWithTimezone = (timeStr: string, date: Date): string => {
  // Create a date object for the class time on the given date
  const [hours, minutes] = timeStr.split(':').map(Number);
  const classDate = new Date(date);
  classDate.setHours(hours, minutes, 0, 0);
  
  // Get user's timezone
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  return `${formatTimeToAMPM(timeStr)} (${userTimezone})`;
};

export const formatDateWithTime = (date: Date, startTime?: string, endTime?: string): string => {
  const formattedDate = format(date, 'EEEE, MMMM d, yyyy');
  if (startTime && endTime) {
    return `${formattedDate} ${formatTimeToAMPM(startTime)} - ${formatTimeToAMPM(endTime)}`;
  }
  return formattedDate;
};

export const getDaysInMonth = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  return { days, firstDay };
};

export const getLocalDateString = (date: Date): string => {
  const userTimezoneOffset = date.getTimezoneOffset() * 60000;
  const localDate = new Date(date.getTime() + userTimezoneOffset);
  return localDate.toISOString().split('T')[0];
};

export const getDayName = (dayOfWeek: number | undefined, t: any): string => {
  if (dayOfWeek === undefined) return '';
  
  const days = [
    t.sunday || 'Sunday',
    t.monday || 'Monday', 
    t.tuesday || 'Tuesday', 
    t.wednesday || 'Wednesday', 
    t.thursday || 'Thursday', 
    t.friday || 'Friday', 
    t.saturday || 'Saturday'
  ];
  
  return days[dayOfWeek];
};

export const startOfDay = (date: Date): Date => {
  const newDate = new Date(date);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
};

export const convertTimeToTimezone = (
  timeStr: string,
  sourceTimezone: string,
  targetTimezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
  date?: Date
): string => {
  if (!timeStr) {
    console.error("Empty time string provided");
    return "12:00 AM"; // Default fallback time
  }

  try {
    // Parse the time string
    let isPM = false;
    let isAM = false;
    let hours = 0;
    let minutes = 0;

    // Handle different time formats
    if (timeStr.includes('AM') || timeStr.includes('PM')) {
      // Format like "9:00 AM" or "9:00 PM"
      isPM = timeStr.includes('PM');
      isAM = timeStr.includes('AM');

      // Remove AM/PM and trim
      const timeOnly = timeStr.replace(/\s*[AP]M\s*/, '').trim();
      const timeParts = timeOnly.split(':');

      if (timeParts.length >= 2) {
        hours = parseInt(timeParts[0]) || 0;
        minutes = parseInt(timeParts[1]) || 0;
      }
    } else {
      // Try to handle 24-hour format like "14:30"
      const timeParts = timeStr.split(':');
      if (timeParts.length >= 2) {
        hours = parseInt(timeParts[0]) || 0;
        minutes = parseInt(timeParts[1]) || 0;

        // Determine AM/PM for 24-hour format
        isPM = hours >= 12;
        isAM = hours < 12;
      }
    }

    // Convert to 24-hour format if needed
    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;

    // Create a date object for the specified date or today
    const baseDate = date || new Date();
    
    // Create an ISO string with the correct time
    const isoString = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    
    // First create a date in the source timezone
    const sourceDate = new Date(isoString);
    
    // Get the timezone offsets
    const sourceOffset = new Date(sourceDate.toLocaleString('en-US', { timeZone: sourceTimezone })).getTime() - sourceDate.getTime();
    const targetOffset = new Date(sourceDate.toLocaleString('en-US', { timeZone: targetTimezone })).getTime() - sourceDate.getTime();
    
    // Calculate the time difference between source and target timezones
    const timeDiff = sourceOffset - targetOffset;
    
    // Apply the offset to get the correct time in target timezone
    const targetDate = new Date(sourceDate.getTime() - timeDiff);

    // Format the time in 12-hour format
    return targetDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    });
  } catch (error) {
    console.error("Error converting time:", error, {
      timeStr,
      sourceTimezone,
      targetTimezone,
      date: date?.toISOString()
    });
    return timeStr; // Return original time string on error
  }
};

export const formatTimeWithTimezones = (
  startTime: string,
  endTime: string,
  sourceTimezone: string,
  targetTimezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
  date?: Date,
  showSourceTime: boolean = true
): string => {
  const convertedStartTime = convertTimeToTimezone(startTime, sourceTimezone, targetTimezone, date);
  const convertedEndTime = convertTimeToTimezone(endTime, sourceTimezone, targetTimezone, date);

  // Get the target timezone abbreviation
  const targetTimezoneName = new Intl.DateTimeFormat('en', {
    timeZoneName: 'short',
    timeZone: targetTimezone
  }).formatToParts(new Date())
    .find(part => part.type === 'timeZoneName')?.value || targetTimezone;

  if (!showSourceTime) {
    return `${convertedStartTime} - ${convertedEndTime} ${targetTimezoneName}`;
  }

  // Return both source and target times
  return `${convertedStartTime} - ${convertedEndTime} ${targetTimezoneName}`;
};

export const formatDateWithShortDay = (date: Date, language: string = 'en'): string => {
  const options = { weekday: 'short' } as const;
  return date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en-US', options);
};

export const formatDateForComparison = (date: any): string => {
  if (!date) return '';
  
  try {
    // If it's a Date object
    if (date instanceof Date) {
      return date.toISOString().split('T')[0];
    }
    // If it's a string, try to create a Date
    else if (typeof date === 'string') {
      return new Date(date).toISOString().split('T')[0];
    }
    // If it's a Firestore Timestamp (has toDate method)
    else if (typeof date === 'object' && 'toDate' in date && typeof date.toDate === 'function') {
      return date.toDate().toISOString().split('T')[0];
    }
    // If it's a number, treat as milliseconds
    else if (typeof date === 'number') {
      return new Date(date).toISOString().split('T')[0];
    }
    // If we can't determine the type, try to stringify and log
    else {
      console.warn('Unknown date format:', date, typeof date);
      return '';
    }
  } catch (error) {
    console.error('Error formatting date:', error, date);
    return '';
  }
};

/**
 * Formats a date according to the user's language preference:
 * - English (en): "Mon, 12/31/2023"
 * - Portuguese (pt-BR): "Seg, 31/12/2023"
 * 
 * @param date The date to format
 * @param language The user's language preference ('en' or 'pt-BR')
 * @returns A localized date string with short weekday
 */
export const formatLocalizedDate = (date: Date, language: string = 'en'): string => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    console.error('Invalid date provided to formatLocalizedDate:', date);
    return '';
  }
  
  try {
    // Format the weekday name
    const weekdayOptions = { weekday: 'short' } as const;
    const weekday = date.toLocaleDateString(
      language === 'pt-BR' ? 'pt-BR' : 'en-US', 
      weekdayOptions
    );
    
    // Format the date based on locale
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    
    // Format according to language (MM/DD/YYYY for en, DD/MM/YYYY for pt-BR)
    let dateString;
    if (language === 'pt-BR') {
      dateString = `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
    } else {
      dateString = `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
    }
    
    return `${weekday}, ${dateString}`;
  } catch (error) {
    console.error('Error formatting localized date:', error, date);
    return '';
  }
}; 