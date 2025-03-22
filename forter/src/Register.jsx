import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { current_session, fetchSession } from "./session";
import { loginWithAuth0, syncAuth0UserWithSession } from './utils/authUtils';
import { useAuth0 } from "@auth0/auth0-react";

export const Register = () => {
  const [location, setLocation] = useLocation();
  const { loginWithRedirect, isAuthenticated, isLoading, user } = useAuth0();
  const [showVerification, setShowVerification] = useState(false);
  const [processingAuth0, setProcessingAuth0] = useState(false);

  // State variables for the legacy form
  const [username_r, setUsername_r] = useState("");
  const [email_r, setEmail_r] = useState("");
  const [password_r, setPassword_r] = useState("");
  const [password2_r, setPassword2_r] = useState("");
  const [error, setError] = useState("");
  const [isFormLoading, setIsFormLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    const initSession = async () => {
      await fetchSession();
    };
    
    initSession();
    
    return () => {
      isMounted = false;
    };
  }, []);
  
  // Separate effect for Auth0 processing
  useEffect(() => {
    let isMounted = true;
    
    // If the user is authenticated with Auth0, process them
    const processAuth0Registration = async () => {
      if (isAuthenticated && user && !processingAuth0) {
        setProcessingAuth0(true);
        try {
          if (isMounted) {
            await syncAuth0UserWithSession(user);
          }
        } catch (error) {
          console.error("Error syncing Auth0 user:", error);
          if (isMounted) {
            setError("Failed to complete Auth0 registration. Please try again.");
          }
        } finally {
          if (isMounted) {
            setProcessingAuth0(false);
          }
        }
      }
    };
    
    processAuth0Registration();
    
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, user]); // Remove processingAuth0 dependency

  // Handle Auth0 registration (same as login, Auth0 handles signup/login distinction)
  const handleAuth0Register = () => {
    loginWithAuth0(loginWithRedirect);
  };

  // Legacy form handlers
  const handleUsername_rChange = (event) => setUsername_r(event.target.value);
  const handleEmailChange = (event) => setEmail_r(event.target.value);
  const handlePassword_rChange = (event) => setPassword_r(event.target.value);
  const handlePassword2_rChange = (event) => setPassword2_r(event.target.value);

  const handleLegacySubmit = async (event) => {
    event.preventDefault();
    if (password_r !== password2_r) {
      setError("Passwords do not match");
      return;
    }

    setIsFormLoading(true);
    setError("");

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          user_name: username_r, 
          email: email_r,
          password: password_r 
        }),
      });
      
      let responseData;
      try {
        responseData = await response.json();
      } catch (e) {
        const text = await response.text();
        try {
          responseData = JSON.parse(text);
        } catch {
          responseData = { message: text };
        }
      }
      
      if (!response.ok) {
        setError(responseData.message || "Registration failed");
      } else {
        setShowVerification(true);
      }
    } catch (error) {
      console.error("Registration error:", error);
      setError("An unexpected error occurred");
    } finally {
      setIsFormLoading(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      const response = await fetch("/api/send-confirmation", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: email_r,
          password: password_r 
        }),
      });
      
      let responseData;
      try {
        responseData = await response.json();
      } catch (e) {
        const text = await response.text();
        try {
          responseData = JSON.parse(text);
        } catch {
          responseData = { message: text };
        }
      }
      
      if (!response.ok) {
        setError(responseData.message || "Failed to send verification email");
      } else {
        setError("Verification email sent!");
      }
    } catch (error) {
      console.error("Verification email error:", error);
      setError("An unexpected error occurred");
    }
  };

  // Show user info if authenticated via Auth0
  if (isAuthenticated && user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80 flex flex-col items-center rounded-lg">
          {user.picture && (
            <img
              src={user.picture}
              alt="profile"
              className="w-24 h-24 rounded-full mb-4"
            />
          )}
          <h2 className="text-2xl mb-4 text-center text-black dark:text-white">
            already registered as {user.name || user.nickname || user.email}
          </h2>
          <button
            onClick={() => setLocation("/")}
            className="w-full bg-purple-500 text-white p-2 hover:bg-purple-600 rounded mb-2"
          >
            go to home
          </button>
        </div>
      </div>
    );
  }

  // Show loading state if Auth0 is loading
  if (isLoading || processingAuth0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="text-center dark:text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p>{processingAuth0 ? "Processing your registration..." : "Loading..."}</p>
        </div>
      </div>
    );
  }

  // Legacy session display
  if (current_session.value && current_session.value.user_name) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80 flex flex-col items-center rounded-lg">
          {current_session.value.pfp_url && (
            <img
              src={current_session.value.pfp_url}
              alt="profile"
              className="w-24 h-24 rounded-full mb-4 object-cover"
            />
          )}
          <h2 className="text-2xl mb-4 text-center text-black dark:text-white">
            logged in as @{current_session.value.user_name}
          </h2>
          <button
            onClick={() => setLocation("/")}
            className="w-full bg-purple-500 text-white p-2 hover:bg-purple-600 rounded mb-2"
          >
            go to home
          </button>
        </div>
      </div>
    );
  }

  if (showVerification) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80 text-center rounded-lg">
          <h2 className="text-2xl mb-4 text-black dark:text-white">Check your email</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            We've sent a verification link to {email_r}. Please check your email and click the link to verify your account.
          </p>
          {error && (
            <div className="mb-4 text-red-500 text-sm text-center">{error}</div>
          )}
          <button
            onClick={handleResendVerification}
            className="w-full bg-purple-500 dark:bg-purple-700 text-white p-2 hover:bg-purple-600 dark:hover:bg-purple-800 mt-4 rounded"
          >
            Resend verification email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
      <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80 rounded-lg">
        <h2 className="text-2xl mb-4 text-center text-black dark:text-white">register</h2>
        {error && (
          <div className="mb-4 text-red-500 text-sm text-center">{error}</div>
        )}
        
        {/* Auth0 Register Button */}
        <button
          onClick={handleAuth0Register}
          className="w-full bg-blue-600 text-white p-2 hover:bg-blue-700 rounded mb-4 flex items-center justify-center opacity-60 cursor-not-allowed"
          disabled={true}
          title="too buggy rn"
        >
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-2">
            <path d="M19.9999 16.0001C19.9999 14.4088 20.6321 12.8828 21.7574 11.7576C22.8826 10.6324 24.4086 10.0001 25.9999 10.0001C27.5912 10.0001 29.1173 10.6324 30.2425 11.7576C31.3678 12.8828 32 14.4088 32 16.0001C32 17.5914 31.3678 19.1175 30.2425 20.2427C29.1173 21.3679 27.5912 22.0001 25.9999 22.0001C24.4086 22.0001 22.8826 21.3679 21.7574 20.2427C20.6321 19.1175 19.9999 17.5914 19.9999 16.0001Z" fill="white"/>
            <path d="M0 16.0001C0 13.6523 0.93767 11.4003 2.60649 9.7315C4.27531 8.06268 6.52729 7.12501 8.87494 7.12501H23.1249C23.1249 8.71632 22.4927 10.2424 21.3674 11.3676C20.2422 12.4928 18.7162 13.1251 17.1249 13.1251H8.87494C8.07989 13.1251 7.31737 13.4412 6.75599 14.0026C6.19461 14.564 5.87869 15.3265 5.87869 16.1216C5.87869 16.9166 6.19461 17.6791 6.75599 18.2405C7.31737 18.8019 8.07989 19.1179 8.87494 19.1179H17.1249C18.7162 19.1179 20.2422 19.7501 21.3674 20.8753C22.4927 22.0005 23.1249 23.5266 23.1249 25.1179C23.1249 25.1179 23.1249 25.1179 23.1249 25.118H8.87494C6.52729 25.118 4.27531 24.1803 2.60649 22.5115C0.93767 20.8427 0 18.5907 0 16.243C0 16.1621 0 16.0811 0 16.0001Z" fill="white"/>
            <path d="M25.9999 28.0001C25.9999 29.5914 25.3677 31.1175 24.2425 32.2427C23.1172 33.3679 21.5912 34.0001 19.9999 34.0001C18.4086 34.0001 16.8826 33.3679 15.7574 32.2427C14.6321 31.1175 13.9999 29.5914 13.9999 28.0001C13.9999 26.4088 14.6321 24.8828 15.7574 23.7576C16.8826 22.6324 18.4086 22.0001 19.9999 22.0001C21.5912 22.0001 23.1172 22.6324 24.2425 23.7576C25.3677 24.8828 25.9999 26.4088 25.9999 28.0001Z" fill="white"/>
          </svg>
          register with auth0
        </button>
        
        <div className="text-center text-gray-500 dark:text-gray-400 my-2">— or —</div>
        
        {/* Legacy registration form */}
        <form onSubmit={handleLegacySubmit}>
          <div className="mb-4">
            <input
              className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white rounded"
              type="text"
              placeholder="username"
              value={username_r}
              onChange={handleUsername_rChange}
              required
            />
          </div>
          <div className="mb-4">
            <input
              className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white rounded"
              type="email"
              placeholder="email"
              value={email_r}
              onChange={handleEmailChange}
              required
            />
          </div>
          <div className="mb-4">
            <input
              className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white rounded"
              type="password"
              placeholder="password"
              value={password_r}
              onChange={handlePassword_rChange}
              required
            />
          </div>
          <div className="mb-6">
            <input
              className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white rounded"
              type="password"
              placeholder="confirm password"
              value={password2_r}
              onChange={handlePassword2_rChange}
              required
            />
          </div>
          <button
            type="submit"
            disabled={isFormLoading}
            className={`w-full p-2 rounded ${
              isFormLoading 
                ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed' 
                : 'bg-purple-500 dark:bg-purple-700 text-white hover:bg-purple-600 dark:hover:bg-purple-800'
            }`}
          >
            {isFormLoading ? "registering..." : "register"}
          </button>
        </form>
        
        <p className="mt-4 text-center text-gray-700 dark:text-gray-200">
          already have an account?{" "}
          <span
            className="text-purple-500 cursor-pointer hover:underline"
            onClick={() => setLocation("/login")}
          >
            login
          </span>
        </p>
      </div>
    </div>
  );
};