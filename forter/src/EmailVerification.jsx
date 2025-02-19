import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';

export const EmailVerification = () => {
  const [status, setStatus] = useState('verifying');
  const [, setLocation] = useLocation();

  useEffect(() => {
    const verifyEmail = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');

      if (!token) {
        setStatus('invalid');
        return;
      }

      try {
        console.log('Token from URL:', token);
        const response = await fetch(`/api/verify?token=${token}`);
        if (response.ok) {
          setStatus('success');
        } else {
          setStatus('error');
        }
      } catch (err) {
        setStatus('error');
      }
    };

    verifyEmail();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
      <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80 text-center">
        {status === 'verifying' && (
          <h2 className="text-2xl mb-4 text-black dark:text-white">Verifying your email...</h2>
        )}
        
        {status === 'success' && (
          <>
            <h2 className="text-2xl mb-4 text-black dark:text-white">Email Verified!</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Your email has been successfully verified.
            </p>
            <button
              onClick={() => setLocation('/login')}
              className="w-full bg-blue-500 dark:bg-blue-700 text-white p-2 hover:bg-blue-600 dark:hover:bg-blue-800"
            >
              Go to Login
            </button>
          </>
        )}

        {(status === 'error' || status === 'invalid') && (
          <>
            <h2 className="text-2xl mb-4 text-black dark:text-white">Verification Failed</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              {status === 'invalid' 
                ? 'Invalid verification request.' 
                : 'The verification link has expired or is invalid.'}
            </p>
            <button
              onClick={() => setLocation('/login')}
              className="w-full bg-blue-500 dark:bg-blue-700 text-white p-2 hover:bg-blue-600 dark:hover:bg-blue-800"
            >
              Return to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}; 