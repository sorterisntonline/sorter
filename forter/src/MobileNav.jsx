import { useState } from 'react';
import { useLocation } from 'wouter';
import { current_session } from './session';
import { NAV_ITEMS } from './constants/navigation';

export const MobileNav = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedItem, setExpandedItem] = useState(null);
  const [location, setLocation] = useLocation();

  const handleNavClick = (path, hasChildren) => {
    if (!hasChildren) {
      setLocation(path);
      setIsOpen(false);
      setExpandedItem(null);
    }
  };

  const handleItemClick = (item) => {
    if (item.children) {
      setExpandedItem(expandedItem === item.name ? null : item.name);
    } else {
      handleNavClick(item.path, false);
    }
  };

  const renderNavItem = (item) => (
    <div key={item.name}>
      <div
        onClick={() => handleItemClick(item)}
        className="py-4 text-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 
          dark:text-white text-left flex justify-between items-center"
      >
        <span>{item.name}</span>
        {item.children && (
          <span className="transform transition-transform duration-200">
            {expandedItem === item.name ? '▼' : '▶'}
          </span>
        )}
      </div>
      {item.children && expandedItem === item.name && (
        <div className="ml-4 border-l-2 border-gray-200 dark:border-gray-700">
          {item.children.map(child => (
            <div
              key={child.name}
              onClick={() => handleNavClick(child.path, false)}
              className="py-2 pl-4 text-base cursor-pointer hover:bg-gray-100 
                dark:hover:bg-gray-800 dark:text-white"
            >
              {child.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );

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
          onClick={() => handleNavClick(current_session.value?.user_name ? '/profile' : '/login')}
          className="mr-4 flex items-center p-2"
          aria-label={current_session.value?.user_name ? "Profile" : "Sign in"}
        >
          <div className="flex flex-col justify-center">
            {current_session.value?.user_name ? (
              // Show profile image or default profile icon if logged in
              current_session.value.profile_image ? (
                <img
                  src={current_session.value.profile_image}
                  alt="Profile"
                  className="w-6 h-6 rounded-full"
                />
              ) : (
                // Default profile icon for logged in users without profile image
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
              )
            ) : (
              // Sign in icon for non-logged in users
              <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <svg 
                  className="w-4 h-4 text-gray-500 dark:text-gray-400" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" 
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
      <div className={`fixed inset-y-0 left-0 w-[66%] bg-white dark:bg-black transform 
        transition-transform duration-300 ease-in-out z-[9998] lg:hidden
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex flex-col h-full pt-16 px-4">
          {/* Navigation Items */}
          <div className="flex-grow">
            {NAV_ITEMS.map(renderNavItem)}
          </div>

          {/* Bottom Authentication Section */}
          <div className="pb-6">
            {current_session.value?.user_name ? (
              <div className="flex flex-col space-y-2">
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
                <div 
                  className="px-4 text-red-500 italic cursor-pointer"
                  onClick={() => handleNavClick('/logout')}
                >
                  logout
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => handleNavClick('/login')}
                  className="w-full p-2 bg-blue-500 dark:bg-blue-700 hover:bg-blue-600 dark:hover:bg-blue-800 text-white rounded text-center"
                >
                  login
                </button>
                <button
                  onClick={() => handleNavClick('/register')}
                  className="w-full p-2 border border-blue-500 text-blue-500 dark:text-blue-400 dark:border-blue-400 hover:bg-blue-50 dark:hover:bg-gray-800 rounded text-center"
                >
                  register
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}; 