import { signal } from "@preact/signals-react";

export const dark_mode = signal(
  localStorage.getItem("dark_mode") === null 
    ? window.matchMedia('(prefers-color-scheme: dark)').matches 
    : localStorage.getItem("dark_mode") === "true"
);

const updateBodyClasses = (isDark) => {
  const body = document.body;
  body.classList.remove(isDark ? "light" : "dark");
  body.classList.remove(isDark ? "bg-white" : "bg-black");
  body.classList.add(isDark ? "dark" : "light");
  body.classList.add(isDark ? "bg-black" : "bg-white");
}

export const initializeTheme = () => {
  // Initial class setup
  updateBodyClasses(dark_mode.value);

  // Listen for system theme changes when no manual preference is set
  if (localStorage.getItem("dark_mode") === null) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      dark_mode.value = e.matches;
      updateBodyClasses(e.matches);
    });
  }
}

export const toggleDarkMode = (isDark) => {
  localStorage.setItem("dark_mode", isDark);
  dark_mode.value = isDark;
  updateBodyClasses(isDark);
} 