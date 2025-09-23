import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRequireUsernameSelection } from '../contexts/AuthContext';
import { AuthAPI } from '../api/auth';

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Sanitize handle for validation (but don't modify user input aggressively)
function sanitizeHandle(value) {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

// Validate handle format client-side
function validateHandle(handle) {
  if (!handle) return { valid: false, message: 'Handle is required' };
  if (handle.length < 3) return { valid: false, message: 'Handle must be at least 3 characters' };
  if (handle.length > 50) return { valid: false, message: 'Handle must be 50 characters or less' };
  if (!/^[a-z0-9_-]+$/.test(handle)) return { valid: false, message: 'Handle can only contain letters, numbers, underscores, and hyphens' };
  if (handle.startsWith('-') || handle.endsWith('-')) return { valid: false, message: 'Handle cannot start or end with a hyphen' };
  return { valid: true };
}

export default function ChooseUsernamePage() {
  const auth = useRequireUsernameSelection();
  const [handle, setHandle] = useState('');
  const [debouncedHandle, setDebouncedHandle] = useState('');
  const [hasUserTyped, setHasUserTyped] = useState(false);
  const initializedRef = useRef(false);

  // Initialize with suggested handle from Spotify data (only once)
  useEffect(() => {
    if (auth.tempData?.suggested_handle && !initializedRef.current && !hasUserTyped) {
      const suggested = auth.tempData.suggested_handle;
      setHandle(suggested);
      setDebouncedHandle(suggested);
      initializedRef.current = true;
    }
  }, [auth.tempData, hasUserTyped]);

  // Debounced handle for availability checking
  const debouncedSetHandle = useCallback(
    debounce((value) => {
      const sanitized = sanitizeHandle(value);
      setDebouncedHandle(sanitized);
    }, 300),
    []
  );

  useEffect(() => {
    if (handle.trim()) {
      debouncedSetHandle(handle);
    } else {
      setDebouncedHandle('');
    }
  }, [handle, debouncedSetHandle]);

  // Client-side validation
  const clientValidation = validateHandle(debouncedHandle);

  // Check handle availability (only if client validation passes)
  const {
    data: availability,
    isLoading: isCheckingAvailability,
    error: availabilityError,
  } = useQuery({
    queryKey: ['auth', 'check-handle', debouncedHandle],
    queryFn: () => AuthAPI.checkHandleAvailability(debouncedHandle),
    enabled: debouncedHandle.length >= 3 && clientValidation.valid,
    retry: false,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const finalHandle = sanitizeHandle(handle);
    const finalValidation = validateHandle(finalHandle);
    
    if (!finalValidation.valid || !availability?.available) {
      return;
    }

    try {
      await auth.completeSignup(finalHandle);
      // Redirect will happen automatically via auth context
      window.location.href = '/';
    } catch (error) {
      // Error is handled by the auth context
      console.error('Signup failed:', error);
    }
  };

  const handleChange = (e) => {
    const value = e.target.value;
    setHandle(value);
    setHasUserTyped(true);
  };

  if (auth.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const sanitizedHandle = sanitizeHandle(handle);
  const canSubmit = sanitizedHandle.length >= 3 && clientValidation.valid && availability?.available && !auth.isCompletingSignup;
  const showValidation = hasUserTyped && debouncedHandle.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            {auth.tempData?.spotify_avatar && (
              <img 
                src={auth.tempData.spotify_avatar} 
                alt="Spotify Avatar"
                className="w-16 h-16 rounded-full border-2 border-gray-300"
              />
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome, {auth.tempData?.spotify_username}!
          </h1>
          <p className="text-gray-600">
            Choose your sorter handle to complete signup
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="handle" className="block text-sm font-medium text-gray-700">
                Your Handle
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 text-sm">@</span>
                </div>
                <input
                  id="handle"
                  name="handle"
                  type="text"
                  value={handle}
                  onChange={handleChange}
                  className="pl-8 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="your-handle"
                  maxLength={50}
                  required
                  autoComplete="username"
                />
                {hasUserTyped && handle !== sanitizedHandle && sanitizedHandle && (
                  <div className="mt-1 text-xs text-gray-500">
                    Will be saved as: <span className="font-mono text-gray-700">@{sanitizedHandle}</span>
                  </div>
                )}
              </div>
              
              {showValidation && (
                <div className="mt-2">
                  {!clientValidation.valid ? (
                    <p className="text-sm text-red-600">
                      {clientValidation.message}
                    </p>
                  ) : isCheckingAvailability ? (
                    <p className="text-sm text-gray-500 flex items-center">
                      <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-400 mr-2"></div>
                      Checking availability...
                    </p>
                  ) : availabilityError ? (
                    <p className="text-sm text-red-600">
                      Error checking availability. Please try again.
                    </p>
                  ) : availability ? (
                    <>
                      {!availability.valid && (
                        <p className="text-sm text-red-600">
                          {availability.message}
                        </p>
                      )}
                      {availability.valid && availability.available && (
                        <p className="text-sm text-green-600 flex items-center">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          @{sanitizedHandle} is available
                        </p>
                      )}
                      {availability.valid && !availability.available && (
                        <p className="text-sm text-red-600 flex items-center">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                          @{sanitizedHandle} is already taken
                        </p>
                      )}
                    </>
                  ) : clientValidation.valid && debouncedHandle.length >= 3 ? (
                    <p className="text-sm text-gray-500">
                      Ready to check availability...
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            {auth.signupError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-600">
                  {auth.signupError.message || 'Signup failed. Please try again.'}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                canSubmit
                  ? 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                  : 'bg-gray-400 cursor-not-allowed'
              } focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors`}
            >
              {auth.isCompletingSignup ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b border-white mr-2"></div>
                  Creating account...
                </div>
              ) : (
                'Complete signup'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              Your handle will be your unique identity on sorter.social.<br/>
              You can use letters, numbers, underscores, and hyphens.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
