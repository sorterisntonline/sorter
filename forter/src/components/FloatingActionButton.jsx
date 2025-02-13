import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from '../Modal';

export const FloatingActionButton = ({ 
  buttons, 
  mainButtonColor = "bg-gray-200 dark:bg-gray-800",
  mainButtonHoverColor = "hover:bg-gray-300 dark:hover:bg-gray-700",
  modalContent = null,
  showModal = false,
  setShowModal = () => {},
}) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // If there's only one button, use it directly without menu
  const singleButton = buttons.length === 1 ? buttons[0] : null;

  if (singleButton) {
    return (
      <div className="block lg:hidden">
        <motion.button
          onClick={singleButton.onClick}
          className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-colors ${singleButton.color} ${singleButton.hoverColor || ''}`}
          whileTap={{ scale: 0.95 }}
        >
          <motion.span 
            className={`text-3xl ${singleButton.textColor}`}
            animate={singleButton.animate}
            transition={singleButton.transition}
          >
            {singleButton.label}
          </motion.span>
        </motion.button>
      </div>
    );
  }

  // Original multi-button menu implementation
  return (
    <div className="block lg:hidden">
      <Modal isOpen={showModal} onClose={() => setShowModal(false)}>
        {modalContent}
      </Modal>

      <AnimatePresence>
        {isOpen && (
          <>
            {buttons.map((button, index) => (
              <motion.div
                key={button.label}
                initial={{ opacity: 0, y: 0 }}
                animate={{ opacity: 1, y: -((index + 1) * 70) }}
                exit={{ opacity: 0, y: 0 }}
                className="absolute bottom-0 right-0 flex items-center gap-3"
              >
                <motion.span
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={`whitespace-nowrap ${button.textColor} font-medium`}
                >
                  {button.label}
                </motion.span>
                
                <button
                  onClick={() => {
                    button.onClick();
                    setIsOpen(false);
                  }}
                  className={`w-12 h-12 rounded-full ${button.color} shadow-lg flex items-center justify-center transition-colors`}
                >
                  <span className="text-2xl">+</span>
                </button>
              </motion.div>
            ))}
          </>
        )}
      </AnimatePresence>

      {/* Main Toggle Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full ${mainButtonColor} shadow-lg flex items-center justify-center transition-colors ${mainButtonHoverColor}`}
        animate={{ rotate: isOpen ? 45 : 0 }}
      >
        <span className="text-3xl text-gray-800 dark:text-gray-200">+</span>
      </motion.button>
    </div>
  );
}; 