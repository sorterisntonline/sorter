import { useState } from 'react';
import { ChevronDownIcon } from "@heroicons/react/24/solid";

export const Drawer = ({ children, isOpen, onClose }) => {
  return (
    <div 
      className={`fixed inset-0 z-[60] overflow-hidden transition-opacity duration-300 
                ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl shadow-lg 
                   min-h-[50vh] max-h-[90vh] overflow-y-auto transform transition-transform duration-300 ease-out
                   ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {/* Handle */}
        <div className="sticky top-0 w-full bg-white dark:bg-gray-900 pt-3 pb-2 px-4 flex justify-between items-center border-b border-gray-200 dark:border-gray-700 z-10">
          <div className="w-8" /> {/* Spacer */}
          <div className="w-12 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center"
          >
            <ChevronDownIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}; 