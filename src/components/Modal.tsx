import React, { useRef } from 'react';
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 p-4 overflow-y-auto"
      onClick={handleOverlayClick}
    >
      <div 
        ref={modalContentRef}
        className="bg-white rounded-lg shadow-xl w-full max-w-lg relative"
        style={{ 
          maxHeight: 'calc(100vh - 2rem)',
          marginTop: 'max(1rem, env(safe-area-inset-top))',
          marginBottom: 'max(1rem, env(safe-area-inset-bottom))'
        }}
      >
        <div className="overflow-y-auto p-6" style={{ maxHeight: 'calc(100vh - 4rem)' }}>
          <button
            onClick={onClose}
            className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 rounded-full p-1 z-[101]"
            aria-label="Close modal"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal; 