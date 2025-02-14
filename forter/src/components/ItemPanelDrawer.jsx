import { useState } from 'react';
import { ChevronDownIcon } from "@heroicons/react/24/solid";

export const ItemPanelDrawer = ({ children, isOpen, onClose }) => {
  if (!isOpen) return null;
  
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl shadow-lg max-h-[85vh] overflow-y-auto transform transition-transform"
      >
        {/* Handle */}
        <div className="sticky top-0 w-full bg-white dark:bg-gray-900 pt-3 pb-2 px-4 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
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
        <div className="p-4">
          {children}
        </div>
      </div>
    </>
  );
}; 