import React, { useEffect } from 'react';

const WarningPopup = ({ isOpen, onClose, children }) => {
  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
    } else {
      document.removeEventListener('keydown', handleEsc);
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  const handleLoginFocus = () => {
    onClose();
    setTimeout(() => {
      const loginInput = document.evaluate(
        '(//input[@autocomplete="username"][@placeholder="username"])[2]',
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;
      
      if (loginInput) {
        loginInput.focus();
      }
    }, 0);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed z-50 inset-0 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity duration-300"
        onClick={onClose}
      ></div>

      {/* Modal Content */}
      <div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-6 w-full max-w-md mx-4 shadow-lg transition-transform transform duration-300 scale-95">
        <div className="relative">
          {children}
          <button
            className="mt-4 bg-green-500 text-white py-2 px-4 rounded-none hover:bg-green-600 focus:outline-none"
            onClick={handleLoginFocus}
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default WarningPopup;
