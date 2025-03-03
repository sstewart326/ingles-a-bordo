# Styles Directory

This directory contains shared styles and theme configuration for the application.

## Files

- `theme.ts` - Contains the theme configuration, including colors, typography, and component styles
- `styleUtils.ts` - Provides utility functions for working with the theme styles
- `applyTheme.md` - A guide for applying the theme styles to components

## Usage

To use the shared styles in a component, import the `styles` and `classNames` utilities:

```tsx
import { styles, classNames } from '../styles/styleUtils';
```

Then, apply the styles to your components:

```tsx
<h1 className={styles.headings.h1}>Page Title</h1>
<button className={styles.buttons.primary}>Submit</button>
```

See `applyTheme.md` for a detailed guide on applying the theme styles to components.

## Benefits

Using shared styles provides several benefits:

1. **Consistency** - Ensures consistent styling across all pages
2. **Maintainability** - Makes it easier to update styles in one place
3. **Readability** - Makes the code more readable and self-documenting
4. **Efficiency** - Reduces duplication and makes styling faster

## Extending

To add new styles or modify existing ones, update the `theme.ts` file. The changes will automatically be available to all components using the shared styles.

## Example

Here's a simple example of using the shared styles:

```tsx
import React from 'react';
import { styles } from '../styles/styleUtils';

export const ExampleComponent = () => {
  return (
    <div className="p-4">
      <h1 className={styles.headings.h1}>Example Component</h1>
      <p className="mt-2">This component uses shared styles.</p>
      <button className={styles.buttons.primary}>Click Me</button>
    </div>
  );
};
``` 