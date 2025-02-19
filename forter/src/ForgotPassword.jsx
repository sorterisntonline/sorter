import { useState } from 'react';
import { useLocation } from 'wouter';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setStatus('');

    try {
      const response = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (response.ok) {
        setStatus('success');
        setEmail('');
      } else {
        const data = await response.json();
        setStatus('error');
      }
    } catch (error) {
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
      <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80">
        <h2 className="text-2xl mb-4 text-center text-black dark:text-white">
          Reset your password
        </h2>
        <p className="mb-4 text-center text-gray-700 dark:text-gray-300">
          Enter your email address and we'll send you a link to reset your password.
        </p>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <input
              type="email"
              required
              className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white"
              placeholder="email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {status === 'success' && (
            <div className="text-sm text-green-600 dark:text-green-400">
              reset email sent (if account exists)
            </div>
          )}
          {status === 'error' && (
            <div className="text-sm text-red-500">
              error, sorry
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full p-2 transition-colors duration-200 text-white
              ${isLoading 
                ? 'bg-gray-400 dark:bg-gray-600' 
                : 'bg-blue-500 dark:bg-blue-700 hover:bg-blue-600 dark:hover:bg-blue-800'
              }`}
          >
            {isLoading ? 'sending...' : 'send reset link'}
          </button>

          <p className="mt-4 text-center text-gray-700 dark:text-gray-200">
            <button
              type="button"
              onClick={() => setLocation('/login')}
              className="text-blue-500 cursor-pointer"
            >
              back to login
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

export function ResetPassword() {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  
  // Get token from URL query parameter
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setStatus('');

    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });

      if (response.ok) {
        setStatus('success');
        // Redirect to login after a short delay
        setTimeout(() => setLocation('/login'), 2000);
      } else {
        const data = await response.json();
        setStatus('error');
      }
    } catch (error) {
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80">
          <div className="text-center text-red-500">
            token expired or otherwise not set - try again later
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
      <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80">
        <h2 className="text-2xl mb-4 text-center text-black dark:text-white">
          Set new password
        </h2>
        <p className="mb-4 text-center text-gray-700 dark:text-gray-300">
          Enter your new password below
        </p>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <input
              type="password"
              required
              className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength="8"
            />
          </div>

          {status === 'success' && (
            <div className="text-sm text-green-600 dark:text-green-400">
              yup it worked
            </div>
          )}
          {status === 'error' && (
            <div className="text-sm text-red-500">
              expired or broken
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full p-2 transition-colors duration-200 text-white
              ${isLoading 
                ? 'bg-gray-400 dark:bg-gray-600' 
                : 'bg-blue-500 dark:bg-blue-700 hover:bg-blue-600 dark:hover:bg-blue-800'
              }`}
          >
            {isLoading ? 'resetting...' : 'reset password'}
          </button>
        </form>
      </div>
    </div>
  );
} 