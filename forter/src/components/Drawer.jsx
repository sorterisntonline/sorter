import { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon } from "@heroicons/react/24/solid";
import { signal } from "@preact/signals-react";

// Signal to track maximized state across drawer instances
export const drawer_maximized = signal(false);

export const Drawer = ({ children, isOpen, onClose }) => {
  const contentRef = useRef(null);
  
  // Get the appropriate height based on maximized state
  const getDrawerHeight = () => {
    const viewportHeight = window.innerHeight;
    return `${viewportHeight * (drawer_maximized.value ? 0.9 : 0.5)}px`;
  };

  const toggleMaximize = () => {
    drawer_maximized.value = !drawer_maximized.value;
  };

  const handleClose = () => {
    // Clear the 'item' parameter from URL
    const params = new URLSearchParams(window.location.search);
    if (params.has('item')) {
      params.delete('item');
      const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
      window.history.replaceState({}, '', newUrl);
    }
    
    // Call the provided onClose handler
    onClose();
  };

  return (
    <div 
      className={`fixed inset-0 z-[60] transition-opacity duration-300 
                ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity duration-300"
        onClick={handleClose}
      />

      {/* Drawer */}
      <div
        style={{ height: getDrawerHeight() }}
        className={`absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl shadow-lg 
                   transform transition-all duration-300 ease-out
                   ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {/* Handle */}
        <div className="sticky top-0 w-full bg-white dark:bg-gray-900 pt-3 pb-2 px-4 flex justify-between items-center border-b border-gray-200 dark:border-gray-700 z-10">
          <button 
            onClick={toggleMaximize}
            className="w-8 h-8 flex items-center justify-center"
          >
            {drawer_maximized.value ? (
              <ArrowsPointingInIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            ) : (
              <ArrowsPointingOutIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            )}
          </button>
          <div className="w-12 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
          <button 
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center"
          >
            <ChevronDownIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        </div>

        {/* Content */}
        <div 
          ref={contentRef}
          className="overflow-y-auto h-[calc(100%-48px)]"
        >
          <div className="p-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}; 