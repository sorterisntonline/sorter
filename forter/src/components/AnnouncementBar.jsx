import { useState, useEffect } from 'react';
import { signal } from "@preact/signals-react";

const ANNOUNCEMENT_SYSTEM_ENABLED = false; // Toggle this to enable/disable the entire announcement system
const ANNOUNCEMENT_VERSION = "5";

// Initialize the signal based on localStorage
const storedVersion = localStorage.getItem('announcementBarVersion');
const isClosed = localStorage.getItem('announcementBarClosed');
export const showAnnouncement = signal(
  ANNOUNCEMENT_SYSTEM_ENABLED && (storedVersion !== ANNOUNCEMENT_VERSION || !isClosed)
);

const AnnouncementBar = ({ 
  message = 'check out music.sorter.social to preview our experimental new look!',
  link = 'https://music.sorter.social',
  baseColor = '#ff4d4d',
  isVoting = false  // Add this prop
}) => {
  const [isVisible, setIsVisible] = useState(false);  // Start as hidden
  const [shouldRender, setShouldRender] = useState(showAnnouncement.value);
  const isMobile = window.innerWidth < 1024;

  useEffect(() => {
    // Don't show on mobile voting view
    if (isMobile && isVoting) {
      setIsVisible(false);
      setShouldRender(false);
      return;
    }

    // Only proceed if the announcement system is enabled
    if (!ANNOUNCEMENT_SYSTEM_ENABLED) {
      setIsVisible(false);
      setShouldRender(false);
      return;
    }

    // Check localStorage on mount, including version check
    if (storedVersion !== ANNOUNCEMENT_VERSION) {
      localStorage.removeItem('announcementBarClosed');
      localStorage.setItem('announcementBarVersion', ANNOUNCEMENT_VERSION);
      showAnnouncement.value = true;
      setShouldRender(true);
    }

    // Delay the visibility
    const timer = setTimeout(() => {
      setIsVisible(shouldRender);
    }, 1000);

    return () => clearTimeout(timer);
  }, [shouldRender, isVoting, isMobile]);

  const handleClose = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsVisible(false);
    showAnnouncement.value = false;
    localStorage.setItem('announcementBarClosed', 'true');
    localStorage.setItem('announcementBarVersion', ANNOUNCEMENT_VERSION);
  };

  // Early return if system is disabled or if on mobile voting view
  if (!ANNOUNCEMENT_SYSTEM_ENABLED || !shouldRender || (isMobile && isVoting)) return null;

  // Calculate lighter version of the color for gradient
  const lighterColor = baseColor + '99'; // Using alpha channel for lighter effect

  return (
    <div 
      className={`fixed top-0 left-0 right-0 z-50 w-full h-8 transition-opacity duration-300 ease-in-out ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        background: `linear-gradient(90deg, ${baseColor} 0%, ${lighterColor} 100%)`,
      }}
    >
      <a 
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full h-full text-center py-1.5 text-white font-medium hover:opacity-90"
      >
        {message}
      </a>
      <button
        onClick={handleClose}
        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white hover:text-gray-200"
      >
        ✕
      </button>
    </div>
  );
};

export default AnnouncementBar;