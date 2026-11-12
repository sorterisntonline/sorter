import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const TopBanner = ({ 
  isOpen, 
  onClose, 
  children, 
  duration = 1500 // Duration reduced to 2 seconds
}) => {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (isOpen) {
      setProgress(100);
      const startTime = Date.now();
      
      const timer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, duration - elapsed);
        const newProgress = (remaining / duration) * 100;
        
        setProgress(newProgress);
        
        if (remaining <= 0) {
          clearInterval(timer);
          onClose();
        }
      }, 16); // ~60fps

      return () => clearInterval(timer);
    }
  }, [isOpen, duration, onClose]);

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div 
          className="fixed z-[99999] top-0 left-0 right-0"
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
        >
          <div className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100 px-4 py-3 shadow-lg relative">
            <div className="flex items-center justify-center">
              <div className="text-center">{children}</div>
            </div>
            
            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 w-full h-1 bg-yellow-200 dark:bg-yellow-800">
              <motion.div
                className="h-full bg-yellow-500 dark:bg-yellow-600"
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