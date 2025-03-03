import { componentStyles } from './theme';

// This file provides utility functions to use our theme styles with Tailwind CSS

/**
 * Combines multiple Tailwind CSS class names
 * @param classes - Array of class names or objects with conditional class names
 * @returns Combined class string
 */
export function classNames(...classes: (string | undefined | null | false | {[key: string]: boolean})[]): string {
  return classes
    .filter(Boolean)
    .map(cls => {
      if (typeof cls === 'object' && cls !== null) {
        return Object.entries(cls)
          .filter(([_, value]) => Boolean(value))
          .map(([key]) => key)
          .join(' ');
      }
      return cls;
    })
    .join(' ');
}

/**
 * Returns the appropriate heading style based on level
 * @param level - Heading level (1-3)
 * @returns Tailwind CSS classes for the heading
 */
export function getHeadingStyle(level: 1 | 2 | 3): string {
  switch (level) {
    case 1:
      return componentStyles.headings.h1;
    case 2:
      return componentStyles.headings.h2;
    case 3:
      return componentStyles.headings.h3;
    default:
      return componentStyles.headings.h1;
  }
}

/**
 * Returns form element styles
 */
export const formStyles = {
  label: componentStyles.form.label,
  input: componentStyles.form.input,
  select: componentStyles.form.select,
  textarea: componentStyles.form.textarea,
};

/**
 * Returns button styles
 */
export const buttonStyles = {
  primary: componentStyles.buttons.primary,
  secondary: componentStyles.buttons.secondary,
  danger: componentStyles.buttons.danger,
  cancel: componentStyles.buttons.cancel,
};

/**
 * Returns table styles
 */
export const tableStyles = {
  header: componentStyles.table.header,
  cell: componentStyles.table.cell,
  row: componentStyles.table.row,
};

/**
 * Returns card styles
 */
export const cardStyles = {
  container: componentStyles.card.container,
  title: componentStyles.card.title,
  subtitle: componentStyles.card.subtitle,
  label: componentStyles.card.label,
};

// Export all styles for direct access
export const styles = {
  headings: componentStyles.headings,
  form: componentStyles.form,
  buttons: componentStyles.buttons,
  table: componentStyles.table,
  card: componentStyles.card,
}; 