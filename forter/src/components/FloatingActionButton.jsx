import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from '../Modal';

export const FloatingActionButton = ({
  buttons,
  modalContent = null,
  showModal = false,
  setShowModal = () => {},
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const singleButton = buttons.length === 1 ? buttons[0] : null;

  if (singleButton) {
    return (
      <motion.button
        onClick={singleButton.onClick}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl text-white shadow-float"
        whileTap={{ scale: 0.95 }}
        aria-label={singleButton.label}
      >
        {singleButton.label}
      </motion.button>
    );
  }

  return (
    <div className="relative">
      <Modal isOpen={showModal} onClose={() => setShowModal(false)}>
        {modalContent}
      </Modal>

      <AnimatePresence>
        {isOpen &&
          buttons.map((button, index) => (
            <motion.div
              key={button.label}
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: 1, y: -((index + 1) * 70) }}
              exit={{ opacity: 0, y: 0 }}
              className="absolute bottom-0 right-0 flex items-center gap-3"
            >
              <span className="whitespace-nowrap rounded-full bg-surface px-3 py-1 text-sm shadow-card">
                {button.label}
              </span>
              <button
                onClick={() => {
                  button.onClick();
                  setIsOpen(false);
                }}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-float"
              >
                +
              </button>
            </motion.div>
          ))}
      </AnimatePresence>

      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-3xl text-white shadow-float"
        animate={{ rotate: isOpen ? 45 : 0 }}
        aria-label="create"
      >
        +
      </motion.button>
    </div>
  );
};
