// Theme configuration for the application
// This file contains shared styles, colors, and typography settings

export const colors = {
  // Primary colors
  primary: {
    50: '#EEF2FF',
    100: '#E0E7FF',
    200: '#C7D2FE',
    300: '#A5B4FC',
    400: '#818CF8',
    500: '#6366F1', // indigo-600 - primary brand color
    600: '#4F46E5',
    700: '#4338CA',
    800: '#3730A3',
    900: '#312E81',
  },
  
  // Gray scale
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
  
  // Semantic colors
  success: '#10B981', // emerald-500
  warning: '#F59E0B', // amber-500
  error: '#EF4444',   // red-500
  info: '#3B82F6',    // blue-500
  
  // Custom colors
  custom: {
    purple: '#4C1D9B', // R76, G29, B155, A1
  }
};

export const typography = {
  // Font families
  fontFamily: {
    sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  
  // Font sizes
  fontSize: {
    xs: '0.75rem',     // 12px
    sm: '0.875rem',    // 14px
    base: '1rem',      // 16px
    lg: '1.125rem',    // 18px
    xl: '1.25rem',     // 20px
    '2xl': '1.5rem',   // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem',  // 36px
    '5xl': '3rem',     // 48px
  },
  
  // Font weights
  fontWeight: {
    light: '300',
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
  
  // Line heights
  lineHeight: {
    none: '1',
    tight: '1.25',
    snug: '1.375',
    normal: '1.5',
    relaxed: '1.625',
    loose: '2',
  },
  
  // Letter spacing
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
};

// Common component styles
export const componentStyles = {
  // Headings
  headings: {
    h1: 'text-2xl font-bold text-[#4C1D9B] font-sans tracking-tight',
    h2: 'text-lg font-semibold text-[#4C1D9B] font-sans tracking-wide',
    h3: 'text-base font-medium text-[#4C1D9B] font-sans',
  },
  
  // Form elements
  form: {
    label: 'block text-sm font-medium text-[#4C1D9B] mb-1',
    input: 'mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm',
    select: 'mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm',
    textarea: 'mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm',
  },
  
  // Buttons
  buttons: {
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-md text-sm font-medium shadow-sm hover:shadow-md transition-all duration-200 transform hover:scale-105',
    secondary: 'bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-6 py-2 rounded-md text-sm font-medium shadow-sm hover:shadow-md transition-all duration-200 transform hover:scale-105',
    danger: 'bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-md text-sm font-medium shadow-sm hover:shadow-md transition-all duration-200 transform hover:scale-105',
    cancel: 'bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm transform hover:scale-105 transition-transform duration-200',
  },
  
  // Tables
  table: {
    header: 'px-6 py-3 text-left text-xs font-medium text-[#4C1D9B] uppercase tracking-wider',
    cell: 'px-6 py-4 whitespace-nowrap text-sm text-gray-900',
    row: 'hover:bg-gray-50 transition-colors duration-150',
  },
  
  // Cards
  card: {
    container: 'bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4 hover:shadow-md transition-shadow duration-200',
    title: 'font-semibold text-[#4C1D9B] text-lg tracking-wide',
    subtitle: 'text-gray-800 font-medium',
    label: 'font-medium text-[#4C1D9B] uppercase text-xs tracking-wider',
  },
};

// Export a default theme object with all styles
export default {
  colors,
  typography,
  componentStyles,
}; 