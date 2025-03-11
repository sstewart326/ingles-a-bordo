import React, { useRef, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  paddingTop?: string; // Optional padding top value
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, paddingTop = '0px' }) => {
  if (!isOpen) return null;

  const modalContentRef = useRef<HTMLDivElement>(null);

  const handleOverlayClick = (e: React.MouseEvent) => {
    // Only close if clicking the overlay, not the modal content
    if (modalContentRef.current && !modalContentRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center bg-black bg-opacity-50 overflow-y-auto"
      onClick={handleOverlayClick}
      style={{ paddingTop }}
    >
      <div 
        ref={modalContentRef}
        className="bg-white rounded-lg shadow-lg max-w-lg w-full p-6 relative my-4 mx-4"
        style={{ maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 bg-red-500 hover:bg-red-600 text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 rounded-full p-1 z-10"
          aria-label="Close modal"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
        {children}
      </div>
    </div>
  );
};

export default Modal; 