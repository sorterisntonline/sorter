import React from 'react';

const WarningPopup = ({ isOpen, onClose, children }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed z-10 inset-0 overflow-y-visible">
      <div
        className="flex items-center justify-center min-h-screen text-center sm:block sm:p-0"
        onClick={onClose} // Close popup on overlay click
      >
        <div className="fixed inset-0 transition-opacity bg-gradient-to-r from-blue-500 to-purple-500 opacity-50"></div>

        <div
          className="inline-block align-bottom bg-white dark:bg-gray-800 text-left shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full overflow-visible"
          onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the popup
        >
          <div className="p-4">
            <h2 className="text-lg font-bold">Warning</h2>
            {children}
            <button onClick={onClose} className="mt-4 bg-blue-500 text-white p-2 rounded">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WarningPopup;
