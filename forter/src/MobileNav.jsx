import { useState } from 'react';
import { useLocation } from 'wouter';
import { current_session } from './session';
import { NAV_ITEMS } from './constants/navigation';

export const MobileNav = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [location, setLocation] = useLocation();

  const handleNavClick = (path) => {
    setLocation(path);
    setIsOpen(false);
  };

  return (
    <>
      {/* Fixed top bar container with stricter constraints */}
      <div className="fixed top-0 left-0 right-0 h-14 min-h-[56px] max-h-[56px] w-full overflow-hidden bg-white dark:bg-black z-[9999] lg:hidden flex justify-between items-center">
        {/* Hamburger Button - Left side */}
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="ml-4 flex items-center p-2"
          aria-label="Toggle menu"
        >
          <div className="flex flex-col justify-center">
            <div className={`w-6 h-0.5 bg-black dark:bg-white mb-1.5 transition-all ${
              isOpen ? 'transform rotate-45 translate-y-2' : ''
            }`}></div>
            <div className={`w-6 h-0.5 bg-black dark:bg-white mb-1.5 transition-all ${
              isOpen ? 'opacity-0' : ''
            }`}></div>
            <div className={`w-6 h-0.5 bg-black dark:bg-white transition-all ${
              isOpen ? 'transform -rotate-45 -translate-y-2' : ''
            }`}></div>
          </div>
        </button>

        {/* Center Text */}
        <span className="text-sm font-normal text-black dark:text-white"></span>

        {/* Profile Link - Right side */}
        <button 
          onClick={() => handleNavClick('/profile')}
          className="mr-4 flex items-center p-2"
          aria-label="Profile"
        >
          <div className="flex flex-col justify-center">
            {current_session.value?.profile_image ? (
              <img
                src={current_session.value.profile_image}
                alt="Profile"
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
                <svg 
                  className="w-4 h-4 text-gray-600 dark:text-gray-300" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" 
                  />
                </svg>
              </div>
            )}
          </div>
        </button>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-[9997] lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Menu */}
      <div 
        className={`fixed inset-y-0 left-0 w-[70%] bg-white dark:bg-black transform 
          transition-transform duration-300 ease-in-out z-[9998] lg:hidden
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex flex-col h-full pt-16 px-4">
          {/* Navigation Items */}
          <div className="flex-grow">
            {NAV_ITEMS.map((item) => (
              <div
                key={item.path}
                onClick={() => handleNavClick(item.path)}
                className="py-4 text-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 
                  dark:text-white text-left"
              >
                {item.name}
              </div>
            ))}
          </div>

          {/* Bottom Authentication Section */}
          <div>
            {current_session.value?.user_name ? (
              <div 
                className="flex items-center space-x-3 p-4 cursor-pointer dark:text-white"
                onClick={() => handleNavClick('/profile')}
              >
                {current_session.value.profile_image && (
                  <img
                    src={current_session.value.profile_image}
                    alt="Profile"
                    className="w-10 h-10 rounded-full"
                  />
                )}
                <span className="text-lg">@{current_session.value.user_name}</span>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => handleNavClick('/login')}
                  className="w-full py-2 bg-blue-500 text-white rounded text-left"
                >
                  Login
                </button>
                <button
                  onClick={() => handleNavClick('/register')}
                  className="w-full py-2 border border-blue-500 text-blue-500 
                    dark:text-blue-400 dark:border-blue-400 rounded text-left"
                >
                  Register
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}; 