import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { current_session, fetchSession } from "./session";
import { loginWithAuth0, syncAuth0UserWithSession } from './utils/authUtils';
import { useAuth0 } from "@auth0/auth0-react";

export const Register = () => {
  const [location, setLocation] = useLocation();
  const { loginWithRedirect, isAuthenticated, isLoading, user } = useAuth0();
  const [showVerification, setShowVerification] = useState(false);

  // State variables for the legacy form
  const [username_r, setUsername_r] = useState("");
  const [email_r, setEmail_r] = useState("");
  const [password_r, setPassword_r] = useState("");
  const [password2_r, setPassword2_r] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSession();
    
    // Sync Auth0 user if authenticated
    if (isAuthenticated && user) {
      syncAuth0UserWithSession(user);
    }
  }, [isAuthenticated, user]);

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
      alert("Passwords do not match");
      return;
    }

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
        <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80 flex flex-col items-center">
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
            className="w-full bg-blue-500 text-white p-2 hover:bg-blue-600 rounded mb-2"
          >
            go to home
          </button>
        </div>
      </div>
    );
  }

  // Show loading state if Auth0 is loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="loading-container dark:text-white">Loading...</div>
      </div>
    );
  }

  // Legacy session display
  if (current_session.value && current_session.value.user_name) {
    return (
      <div
        className="dark:text-white"
        style={{
          position: "fixed",
          right: 0,
          bottom: 0,
          height: "1.5rem",
        }}
      >
        logged in as {current_session.value.user_name}{" "}
        <button
          className="border-2 cursor-pointer"
          onClick={() => setLocation("/")}
        >
          logout
        </button>
      </div>
    );
  }

  if (showVerification) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80 text-center">
          <h2 className="text-2xl mb-4 text-black dark:text-white">Check your email</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            We've sent a verification link to {email_r}. Please check your email and click the link to verify your account.
          </p>
          {error && (
            <div className="mb-4 text-red-500 text-sm text-center">{error}</div>
          )}
          <button
            onClick={handleResendVerification}
            className="w-full bg-blue-500 dark:bg-blue-700 text-white p-2 hover:bg-blue-600 dark:hover:bg-blue-800 mt-4"
          >
            Resend verification email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
      <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80">
        <h2 className="text-2xl mb-4 text-center text-black dark:text-white">register</h2>
        {error && (
          <div className="mb-4 text-red-500 text-sm text-center">{error}</div>
        )}
        
        {/* Auth0 Register Button */}
        <button
          onClick={handleAuth0Register}
          className="w-full bg-blue-600 text-white p-2 hover:bg-blue-700 rounded mb-4"
        >
          register with auth0
        </button>
        
        <div className="text-center text-gray-500 dark:text-gray-400 my-2">— or —</div>
        
        {/* Legacy registration form */}
        <form onSubmit={handleLegacySubmit}>
          <div className="mb-4">
            <input
              className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white"
              type="text"
              placeholder="username"
              value={username_r}
              onChange={handleUsername_rChange}
              required
            />
          </div>
          <div className="mb-4">
            <input
              className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white"
              type="email"
              placeholder="email"
              value={email_r}
              onChange={handleEmailChange}
              required
            />
          </div>
          <div className="mb-4">
            <input
              className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white"
              type="password"
              placeholder="password"
              value={password_r}
              onChange={handlePassword_rChange}
              required
            />
          </div>
          <div className="mb-6">
            <input
              className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white"
              type="password"
              placeholder="confirm password"
              value={password2_r}
              onChange={handlePassword2_rChange}
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-500 dark:bg-blue-700 text-white p-2 hover:bg-blue-600 dark:hover:bg-blue-800"
          >
            register
          </button>
        </form>
        
        <p className="mt-4 text-center text-gray-700 dark:text-gray-200">
          already have an account?{" "}
          <span
            className="text-blue-500 cursor-pointer"
            onClick={() => setLocation("/login")}
          >
            login
          </span>
        </p>
      </div>
    </div>
  );
};