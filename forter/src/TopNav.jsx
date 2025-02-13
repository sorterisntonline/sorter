import { useState, useEffect } from 'react';
import { Link, useRoute, useLocation } from "wouter";
import { NAV_ITEMS } from './constants/navigation';
import { current_session } from './session';
import { ProfileHoverPane } from './components/ProfileHoverPane';
import { showAnnouncement } from './components/AnnouncementBar';
import { redirectToLogin, redirectToRegister } from './authUtils';

const MyLink = ({ to, children, className = "" }) => {
  const [isActive] = useRoute(to);
  // if you want the 'you're here' highlighting back, add: ${isActive ? "dark:bg-blue-900 bg-blue-300" : ""} to the classes
  return (
    <Link to={to}>
      <a className={`px-2 py-1 ${className}`}>
        {children}
      </a>
    </Link>
  );
};

const ShowLink = () => {
  const [isActive, params] = useRoute("/:tag/:slug");
  return (
    <a className={isActive ? "dark:bg-black px-2 underline" : ""}>
      {isActive && params.slug !== undefined && params.slug}
    </a>
  );
};

const NavItem = ({ item }) => {
  const [showDropdown, setShowDropdown] = useState(false);

  if (!item.children) {
    return <MyLink to={item.path}>{item.name}</MyLink>;
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowDropdown(true)}
      onMouseLeave={() => setShowDropdown(false)}
    >
      <MyLink to={item.path} className="flex items-center gap-1">
        {item.name}
        <span>▼</span>
      </MyLink>
      
      {showDropdown && (
        <div className="absolute top-full left-0 bg-white dark:bg-black border border-gray-200 
          dark:border-gray-700 shadow-lg rounded-md overflow-hidden min-w-[120px] z-50"
        >
          {item.children.map(child => (
            <MyLink
              key={child.name}
              to={child.path}
              className="block w-full hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {child.name}
            </MyLink>
          ))}
        </div>
      )}
    </div>
  );
};

export const TopNav = () => {
  const [location] = useLocation();
  const [isHovered, setIsHovered] = useState(false);
  const [hideTimeout, setHideTimeout] = useState(null);

  const isAuthPage = location === "/login" || location === "/register";
  const isLoggedIn = current_session.value && current_session.value.user_name;

  const handleMouseEnter = () => {
    if (hideTimeout) clearTimeout(hideTimeout);
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    const timeout = setTimeout(() => {
      setIsHovered(false);
    }, 300);
    setHideTimeout(timeout);
  };

  useEffect(() => {
    return () => {
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, [hideTimeout]);

  return (
    <div
      className="fixed top-0 right-0 hidden lg:flex items-center justify-between bg-white 
        dark:bg-black text-black dark:text-white w-full px-4 p-2.5 z-40 transition-[top] 
        duration-300 ease-in"
      style={{ 
        top: showAnnouncement.value ? '32px' : '0',
      }}
    >
      {/* Left side navigation links */}
      <div className="flex items-center space-x-4">
        {NAV_ITEMS.map(item => (
          <NavItem key={item.name} item={item} />
        ))}
        <ShowLink />
      </div>

      {/* Right side authentication */}
      <div className="flex items-center">
        {isLoggedIn ? (
          <div 
            className="relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="cursor-default">
              {"@" + current_session.value.user_name}
            </div>
            {isHovered && (
              <ProfileHoverPane onClose={() => setIsHovered(false)} />
            )}
          </div>
        ) : (
          !isAuthPage && (
            <div className="flex items-center gap-2">
              <button
                className="bg-blue-200 dark:bg-blue-950 hover:bg-blue-300 dark:hover:bg-blue-900 
                  text-black dark:text-white px-3 py-1 transition-colors border border-transparent"
                onClick={redirectToLogin}
              >
                login
              </button>
              <button
                className="bg-green-200 dark:bg-green-950 hover:bg-green-300 dark:hover:bg-green-900 
                  text-black dark:text-white px-3 py-1 transition-colors border border-transparent"
                onClick={redirectToRegister}
              >
                register
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}; 