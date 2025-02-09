import { useState } from 'react';
import { useLocation } from 'wouter';
import { current_session } from './session';
import { loginLinear } from './integrations/Linear';
import { motion, AnimatePresence } from 'framer-motion';
import { NEW_TAG_ROUTES, NEW_TAG_BUTTONS } from './constants/navigation';
import { Modal } from './Modal';
import { TagForm } from './TagForm';

export const MobileNewTagChooser = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showTagForm, setShowTagForm] = useState(false);
  const [location] = useLocation();
  const [isSpotifyOpen, setIsSpotifyOpen] = useState(false);

  // Add debug logging
  console.log('MobileNewTagChooser:', {
    location,
    shouldShow: NEW_TAG_ROUTES.includes(location),
    isLoggedIn: !!current_session.value?.user_name
  });

  // Check if we should show the button
  const shouldShow = NEW_TAG_ROUTES.includes(location) && current_session.value?.user_name;
  
  if (!shouldShow) return null;

  const handleButtonClick = (action) => {
    switch(action) {
      case 'linear':
        loginLinear();
        break;
      case 'spotify':
        setIsSpotifyOpen(true);
        break;
      case 'normal':
        setShowTagForm(true);
        setIsOpen(false);
        break;
    }
  };

  return (
    <div className="block lg:hidden">
      <Modal isOpen={showTagForm} onClose={() => setShowTagForm(false)}>
        <TagForm onClose={() => setShowTagForm(false)} />
      </Modal>

      <AnimatePresence>
        {isOpen && (
          <>
            {NEW_TAG_BUTTONS.map((button, index) => (
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
                  onClick={() => handleButtonClick(button.action)}
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
        className="w-14 h-14 rounded-full bg-gray-200 dark:bg-gray-800 shadow-lg flex items-center justify-center transition-colors hover:bg-gray-300 dark:hover:bg-gray-700"
        animate={{ rotate: isOpen ? 45 : 0 }}
      >
        <span className="text-3xl text-gray-800 dark:text-gray-200">+</span>
      </motion.button>
    </div>
  );
}; 