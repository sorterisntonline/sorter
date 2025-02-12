import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';

const WarningPopup = ({ 
  isOpen, 
  onClose, 
  children, 
  duration = 5000, // Duration in ms
  showLogin = true 
}) => {
  const [, setLocation] = useLocation();
  const [progress, setProgress] = useState(100);
  const [timeLeft, setTimeLeft] = useState(duration);

  useEffect(() => {
    if (!isOpen) {
      setProgress(100);
      setTimeLeft(duration);
      return;
    }

    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, duration - elapsed);
      const newProgress = (remaining / duration) * 100;
      
      setProgress(newProgress);
      setTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(timer);
        onClose();
      }
    }, 16); // ~60fps

    return () => clearInterval(timer);
  }, [isOpen, duration, onClose]);

  const handleLoginRedirect = () => {
    onClose();
    setLocation('/login');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className="fixed z-[99999]"
          initial={{ 
            y: window.innerWidth <= 768 ? '100%' : 0,
            x: window.innerWidth <= 768 ? 0 : '100%',
            opacity: window.innerWidth <= 768 ? 1 : 0
          }}
          animate={{ 
            y: 0,
            x: 0,
            opacity: 1
          }}
          exit={{ 
            y: window.innerWidth <= 768 ? '100%' : 0,
            x: window.innerWidth <= 768 ? 0 : '100%',
            opacity: window.innerWidth <= 768 ? 1 : 0
          }}
          transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
          style={{ 
            bottom: window.innerWidth <= 768 ? 0 : '20px',
            right: window.innerWidth <= 768 ? 0 : '20px',
            width: window.innerWidth <= 768 ? '100%' : 'auto',
            maxWidth: window.innerWidth <= 768 ? '100%' : '400px'
          }}
        >
          <div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-6 shadow-lg relative">
            <div className="mb-4">{children}</div>
            
            {showLogin && (
              <button
                className="bg-green-500 text-white py-2 px-4 rounded-none hover:bg-green-600 focus:outline-none"
                onClick={handleLoginRedirect}
              >
                login
              </button>
            )}

            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 w-full h-1 bg-gray-200">
              <motion.div
                className="h-full bg-blue-500"
                initial={{ width: "100%" }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.1, ease: "linear" }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WarningPopup;
