import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { current_session, fetchSession } from "./session";
import { handleAuthReturn, loginWithAuth0, syncAuth0UserWithSession } from './utils/authUtils';
import { useAuth0 } from "@auth0/auth0-react";

export const Login = () => {
  const [location, setLocation] = useLocation();
  const { loginWithRedirect, isAuthenticated, isLoading, user } = useAuth0();
  
  const [needsVerification, setNeedsVerification] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [needsEmail, setNeedsEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [isFormLoading, setIsFormLoading] = useState(false);

  useEffect(() => {
    fetchSession();
    
    if (isAuthenticated && user) {
      syncAuth0UserWithSession(user);
    }
  }, [isAuthenticated, user]);

  const handleAuth0Login = () => {
    loginWithAuth0(loginWithRedirect);
  };

  const handleUsernameChange = (event) => setUsername(event.target.value);
  const handlePasswordChange = (event) => setPassword(event.target.value);

  const handleResendVerification = async () => {
    const response = await fetch("/api/send-confirmation", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        email: userEmail,
        password: password 
      }),
    });
    
    if (!response.ok) {
      const msg = await response.text();
      try {
        const jsonMsg = JSON.parse(msg);
        setError(jsonMsg.message || "Error sending verification email");
      } catch {
        setError(msg);
      }
      console.log("error sending verification email: ", msg);
    } else {
      setError("verification email sent");
      console.log("sent verification email");
    }
  };

  const handleEmailSubmit = async (event) => {
    event.preventDefault();
    const response = await fetch("/api/update-email", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        user_name: username,
        email: newEmail 
      }),
    });
    
    if (!response.ok) {
      const msg = await response.text();
      setError(msg);
    } else {
      setNeedsEmail(false);
      setNeedsVerification(true);
      setUserEmail(newEmail);
    }
  };

  const handleLegacySubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsFormLoading(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_name: username, password: password }),
      });
      
      const responseData = await response.json();
      const errorMessage = responseData.message || "Unknown error";
      
      console.log("login response: ", responseData);

      if (!response.ok) {
        if (errorMessage === "please verify your email before logging in") {
          setNeedsVerification(true);
          setUserEmail(username);
        } else if (errorMessage === "please set your email address") {
          setNeedsEmail(true);
        } else {
          setError(errorMessage);
          setShake(true);
          setTimeout(() => setShake(false), 500);
        }
      } else {
        await fetchSession();
        handleAuthReturn();
      }
    } catch (error) {
      console.error("Login error:", error);
      setError("Failed to process login request");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setIsFormLoading(false);
    }
  };

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
            logged in as {user.name || user.nickname || user.email}
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="loading-container dark:text-white">Loading...</div>
      </div>
    );
  }

  if (current_session.value && current_session.value.user_name) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80 flex flex-col items-center">
          {current_session.value.profile_picture && (
            <img
              src={current_session.value.profile_picture}
              alt="profile"
              className="w-24 h-24 rounded-full mb-4"
            />
          )}
          <h2 className="text-2xl mb-4 text-center text-black dark:text-white">
            logged in as @{current_session.value.user_name}
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

  if (needsVerification) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80 text-center">
          <h2 className="text-2xl mb-4 text-black dark:text-white">Email Verification Required</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            verify your email address before logging in.
          </p>
          <button
            onClick={handleResendVerification}
            className="w-full bg-blue-500 dark:bg-blue-700 text-white p-2 hover:bg-blue-600 dark:hover:bg-blue-800 mt-4"
          >
            Resend verification email
          </button>
          <button
            onClick={() => setNeedsVerification(false)}
            className="w-full bg-gray-500 text-white p-2 hover:bg-gray-600 mt-2"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  if (needsEmail) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80">
          <h2 className="text-2xl mb-4 text-center text-black dark:text-white">Set Email Address</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Please add email address to continue.
          </p>
          <form onSubmit={handleEmailSubmit}>
            <input
              className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white mb-4"
              type="email"
              placeholder="Enter your email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-500 dark:bg-blue-700 text-white p-2 hover:bg-blue-600 dark:hover:bg-blue-800"
            >
              Submit
            </button>
          </form>
          <button
            onClick={() => setNeedsEmail(false)}
            className="w-full bg-gray-500 text-white p-2 hover:bg-gray-600 mt-2"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
      <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80">
        <h2 className="text-2xl mb-4 text-center text-black dark:text-white">login</h2>
        {error && (
          <div className="mb-4 text-red-500 text-sm text-center">{error}</div>
        )}
        
        <button
          onClick={handleAuth0Login}
          className="w-full bg-blue-600 text-white p-2 hover:bg-blue-700 rounded mb-4"
        >
          login with auth0
        </button>
        
        <div className="text-center text-gray-500 dark:text-gray-400 my-2">— or —</div>
        
        <form onSubmit={handleLegacySubmit}>
          <div className="mb-4">
            <input
              className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white"
              type="text"
              placeholder="username or email"
              value={username}
              onChange={handleUsernameChange}
              required
            />
          </div>
          <div className="mb-6">
            <input
              className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white"
              type="password"
              placeholder="password"
              value={password}
              onChange={handlePasswordChange}
              required
            />
            <div className="mt-1 text-sm text-left">
              <a 
                href="/forgot-password" 
                className="text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300"
              >
                forgot?
              </a>
            </div>
          </div>
          <button
            type="submit"
            disabled={isFormLoading}
            className={`w-full p-2 transition-colors duration-200
              ${isFormLoading 
                ? 'bg-gray-400 dark:bg-gray-600' 
                : 'bg-blue-500 dark:bg-blue-700 hover:bg-blue-600 dark:hover:bg-blue-800'
              }
              text-white
              ${shake ? 'animate-shake' : ''}`}
          >
            {isFormLoading ? 'logging in...' : 'login'}
          </button>
        </form>
        
        <p className="mt-4 text-center text-gray-700 dark:text-gray-200">
          no account yet?{" "}
          <span
            className="text-blue-500 cursor-pointer"
            onClick={() => setLocation("/register")}
          >
            register
          </span>
        </p>
      </div>
    </div>
  );
}