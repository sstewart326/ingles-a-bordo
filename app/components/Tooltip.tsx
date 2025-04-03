import React from 'react';

interface TooltipProps {
  /** The content to be displayed with the tooltip */
  children: React.ReactNode;
  /** The tooltip text to show on hover */
  text: string;
  /** Optional width class for the tooltip. Defaults to 'w-60' */
  width?: string;
}

/**
 * A reusable tooltip component that shows text on hover.
 * Uses Tailwind CSS for styling and transitions.
 */
export const Tooltip: React.FC<TooltipProps> = ({ children, text, width = 'w-60' }) => {
  return (
    <span className="relative inline-flex items-center group">
      <span className="cursor-help">
        {children}
      </span>
      <span className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-3 py-2 ${width} max-w-xs bg-gray-800 text-white text-sm rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none`}>
        {text}
        <span className="absolute w-2 h-2 bg-gray-800 transform rotate-45 left-1/2 -translate-x-1/2 -bottom-1"></span>
      </span>
    </span>
  );
}; 