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

export const startOfDay = (date: Date): Date => {
  const newDate = new Date(date);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
}; 