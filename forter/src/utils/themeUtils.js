import { signal } from "@preact/signals-react";

// Migrate from old dark_mode setting to new theme_mode
const migrateFromOldSetting = () => {
  const oldSetting = localStorage.getItem("dark_mode");
  
  // If old setting exists but new one doesn't, migrate it
  if (oldSetting !== null && localStorage.getItem("theme_mode") === null) {
    const newMode = oldSetting === "true" ? "dark" : 
                   oldSetting === "false" ? "light" : "auto";
    localStorage.setItem("theme_mode", newMode);
    // Clean up old setting
    localStorage.removeItem("dark_mode");
  }
};

// Run migration
migrateFromOldSetting();

// Change to support three modes: "light", "auto", "dark"
export const theme_mode = signal(
  localStorage.getItem("theme_mode") || "auto"
);

// Determine if dark mode should be active based on theme_mode
const isDarkModeActive = () => {
  if (theme_mode.value === "dark") return true;
  if (theme_mode.value === "light") return false;
  // For "auto", use system preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

// Signal for tracking dark mode state
export const dark_mode = signal(isDarkModeActive());

// More comprehensive class updates for dark mode
const updateBodyClasses = (isDark) => {
  const body = document.body;
  const html = document.documentElement;
  
  // Remove all theme classes first
  body.classList.remove("light", "dark", "bg-white", "bg-black");
  
  // Add appropriate classes
  if (isDark) {
    body.classList.add("dark", "bg-black");
    html.classList.add("dark");
    html.style.colorScheme = "dark";
    // Force dark mode for browser controls
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", "#000000");
    } else {
      const meta = document.createElement('meta');
      meta.name = "theme-color";
      meta.content = "#000000";
      document.head.appendChild(meta);
    }
  } else {
    body.classList.add("light", "bg-white");
    html.classList.remove("dark");
    html.style.colorScheme = "light";
    // Force light mode for browser controls
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", "#ffffff");
    } else {
      const meta = document.createElement('meta');
      meta.name = "theme-color";
      meta.content = "#ffffff";
      document.head.appendChild(meta);
    }
  }
  
  // Set CSS variables for theme colors
  document.documentElement.style.setProperty('--theme-bg', isDark ? '#000000' : '#ffffff');
  document.documentElement.style.setProperty('--theme-text', isDark ? '#ffffff' : '#000000');
}

export const initializeTheme = () => {
  // Initial class setup
  updateBodyClasses(dark_mode.value);

  // Listen for system theme changes
  const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  const handleSystemThemeChange = (e) => {
    if (theme_mode.value === "auto") {
      dark_mode.value = e.matches;
      updateBodyClasses(e.matches);
    }
  };
  
  // Set up the listener
  darkModeMediaQuery.addEventListener('change', handleSystemThemeChange);
  
  // Force an immediate update to ensure consistency
  setTimeout(() => {
    updateBodyClasses(dark_mode.value);
  }, 0);
}

export const setThemeMode = (mode) => {
  // mode should be one of: "light", "auto", "dark"
  localStorage.setItem("theme_mode", mode);
  theme_mode.value = mode;
  
  if (mode === "auto") {
    // Use system preference
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    dark_mode.value = isDark;
    updateBodyClasses(isDark);
  } else {
    // Use explicit setting
    const isDark = mode === "dark";
    dark_mode.value = isDark;
    updateBodyClasses(isDark);
  }
}

// Keep for backward compatibility
export const toggleDarkMode = (isDark) => {
  setThemeMode(isDark ? "dark" : "light");
} 