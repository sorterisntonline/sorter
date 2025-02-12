import { signal } from "@preact/signals-react";

export const errorState = signal({
  isOpen: false,
  message: "",
  showLogin: false,
  duration: 5000
});

export const showError = (message, options = {}) => {
  errorState.value = {
    isOpen: true,
    message,
    showLogin: options.showLogin ?? false,
    duration: options.duration ?? 5000
  };
};

export const clearError = () => {
  errorState.value = {
    isOpen: false,
    message: "",
    showLogin: false,
    duration: 5000
  };
};

// Add this to handle API errors
export const handleApiError = (error) => {
  if (error.status === 401) {
    showError("You need to be logged in to do that!", { showLogin: true });
  } else if (error.status === 403) {
    showError("You don't have permission to do that!");
  } else if (error.status === 400) {
    showError(error.message || "Something went wrong!");
  } else {
    showError("An unexpected error occurred.");
  }
}; 