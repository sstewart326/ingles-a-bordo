# Guide to Applying Theme Styles

This guide will help you apply the shared theme styles to other pages in the application.

## Step 1: Import the Styles

At the top of your component file, add the following import:

```tsx
import { styles, classNames } from '../styles/styleUtils';
```

## Step 2: Replace Typography Elements

### Headings

Replace heading elements with the appropriate style:

```tsx
// Before
<h1 className="text-2xl font-bold text-indigo-700 font-sans tracking-tight">Page Title</h1>

// After
<h1 className={styles.headings.h1}>Page Title</h1>
```

For other heading levels:
- `styles.headings.h2` for h2 elements
- `styles.headings.h3` for h3 elements

### Form Labels

Replace form labels with the shared style:

```tsx
// Before
<label className="block text-sm font-medium text-indigo-700 mb-1">Label Text</label>

// After
<label className={styles.form.label}>Label Text</label>
```

## Step 3: Replace Button Styles

Replace button styles with the appropriate style:

```tsx
// Before
<button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-md text-sm font-medium shadow-sm hover:shadow-md transition-all duration-200 transform hover:scale-105">
  Button Text
</button>

// After
<button className={styles.buttons.primary}>
  Button Text
</button>
```

Available button styles:
- `styles.buttons.primary` - Main action buttons
- `styles.buttons.secondary` - Secondary action buttons
- `styles.buttons.danger` - Delete/destructive action buttons
- `styles.buttons.cancel` - Cancel action buttons

## Step 4: Replace Table Styles

Replace table styles with the shared styles:

```tsx
// Before
<th className="px-6 py-3 text-left text-xs font-medium text-indigo-600 uppercase tracking-wider">
  Header Text
</th>

// After
<th className={styles.table.header}>
  Header Text
</th>
```

For table cells and rows:
- `styles.table.cell` for td elements
- `styles.table.row` for tr elements

## Step 5: Replace Card Styles

Replace card styles with the shared styles:

```tsx
// Before
<div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4 hover:shadow-md transition-shadow duration-200">
  Card Content
</div>

// After
<div className={styles.card.container}>
  Card Content
</div>
```

For card elements:
- `styles.card.title` for card titles
- `styles.card.subtitle` for card subtitles
- `styles.card.label` for card labels

## Step 6: Combining Classes

Use the `classNames` utility to combine multiple classes or apply conditional classes:

```tsx
<button 
  className={classNames(
    isActive ? styles.buttons.primary : styles.buttons.secondary,
    "w-full mt-4"
  )}
>
  Button Text
</button>
```

## Benefits of Using Shared Styles

1. **Consistency** - Ensures consistent styling across all pages
2. **Maintainability** - Makes it easier to update styles in one place
3. **Readability** - Makes the code more readable and self-documenting
4. **Efficiency** - Reduces duplication and makes styling faster

## Example Component

Here's an example of a component using the shared styles:

```tsx
import React from 'react';
import { styles, classNames } from '../styles/styleUtils';

export const ExampleComponent = () => {
  return (
    <div className="p-4">
      <h1 className={styles.headings.h1}>Example Component</h1>
      
      <div className={styles.card.container}>
        <h2 className={styles.card.title}>Card Title</h2>
        <p className="mt-2">Card content goes here</p>
        
        <form className="mt-4 space-y-4">
          <div>
            <label className={styles.form.label}>Input Label</label>
            <input type="text" className={styles.form.input} />
          </div>
          
          <div className="flex justify-end">
            <button type="submit" className={styles.buttons.primary}>
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
``` 