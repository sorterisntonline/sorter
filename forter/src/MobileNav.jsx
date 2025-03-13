import { useState } from 'react';
import { useLocation } from 'wouter';
import { current_session } from './session';
import { NAV_ITEMS } from './constants/navigation';
import { redirectToLogin, redirectToRegister, handleLogout } from './utils/authUtils';
import { useAuth0 } from '@auth0/auth0-react';

export const MobileNav = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { logout, isAuthenticated } = useAuth0();

  // Hide nav if we're in voting mode
  if (location.includes('/voting')) {
    return null;
  }

  const handleNavClick = (path) => {
    setLocation(path);
    setIsOpen(false);
  };

  const handleItemClick = (item) => {
    handleNavClick(item.path);
  };

  const handleLogoutClick = async () => {
    // Use the shared logout handler with Auth0 support
    const success = await handleLogout(isAuthenticated ? logout : null);
    
    if (success) {
      // Force refresh the current session
      current_session.value = false;
      
      // Close the menu and go to home page
      setIsOpen(false);
      setLocation('/');
    }
  };

  const renderNavItem = (item) => (
    <div key={item.name}>
      <div
        onClick={() => handleItemClick(item)}
        className="py-4 text-lg cursor-pointer dark:text-white text-left flex justify-between items-center"
      >
        <span>{item.name}</span>
      </div>
    </div>
  );

  // Logout icon with correct alignment
  const LogoutIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" 
         className="w-5 h-5 mr-2" 
         viewBox="0 0 20 20" 
         fill="currentColor">
      <path fillRule="evenodd" 
            d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm11.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L15.586 9H8a1 1 0 100 2h7.586l-1.293 1.293z" 
            clipRule="evenodd" />
    </svg>
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
              current_session.value.pfp_url ? (
                <img
                  src={current_session.value.pfp_url}
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
                  {current_session.value.pfp_url && (
                    <img
                      src={current_session.value.pfp_url}
                      alt="Profile"
                      className="w-10 h-10 rounded-full"
                    />
                  )}
                  <span className="text-lg">@{current_session.value.user_name}</span>
                </div>
                <div 
                  className="px-4 py-2 text-red-500 cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors flex items-center"
                  onClick={handleLogoutClick}
                >
                  <LogoutIcon />
                  <span>Logout</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => redirectToLogin()}
                  className="w-full p-2 bg-blue-500 dark:bg-blue-700 hover:bg-blue-600 dark:hover:bg-blue-800 text-white rounded text-center"
                >
                  login
                </button>
                <button
                  onClick={() => redirectToRegister()}
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