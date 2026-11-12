import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { current_session, fetchSession } from "./session";
import { handleAuthReturn, loginWithAuth0, syncAuth0UserWithSession, handleLogout } from './utils/authUtils';
import { useAuth0 } from "@auth0/auth0-react";
import { MenuButton } from "./components/MenuButton";

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
  const [processingAuth0, setProcessingAuth0] = useState(false);

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
  
  // Separate effect for Auth0 processing to avoid loops
  useEffect(() => {
    let isMounted = true;
    
    // If the user is authenticated with Auth0, process them
    const processAuth0Login = async () => {
      if (isAuthenticated && user && !processingAuth0) {
        setProcessingAuth0(true);
        try {
          if (isMounted) {
            await syncAuth0UserWithSession(user);
          }
        } catch (error) {
          console.error("Error syncing Auth0 user:", error);
          if (isMounted) {
            setError("Failed to complete Auth0 login. Please try again.");
          }
        } finally {
          if (isMounted) {
            setProcessingAuth0(false);
          }
        }
      }
    };
    
    processAuth0Login();
    
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, user]); // Remove processingAuth0 from dependencies to avoid loops

  const handleAuth0Login = () => {
    loginWithAuth0(loginWithRedirect);
  };

  const handleUsernameChange = (event) => setUsername(event.target.value);
  const handlePasswordChange = (event) => setPassword(event.target.value);

  const handleResendVerification = async () => {
    setError("");
    try {
      const response = await fetch("/api/send-confirmation", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
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
        setError(responseData.message || "Failed to resend verification email");
      } else {
        setError("Verification email sent. Please check your inbox.");
      }
    } catch (error) {
      console.error("Resend verification error:", error);
      setError("An unexpected error occurred");
    }
  };

  const handleEmailSubmit = async (event) => {
    event.preventDefault();
    setError("");
    
    try {
      const response = await fetch("/api/update-email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail }),
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
        setError(responseData.message || "Failed to update email");
      } else {
        setNeedsEmail(false);
        // Refetch session to get updated data
        await fetchSession();
      }
    } catch (error) {
      console.error("Email update error:", error);
      setError("An unexpected error occurred");
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
        body: JSON.stringify({ user_name: username, password }),
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
        if (response.status === 403 && responseData.verification_needed) {
          setNeedsVerification(true);
          setUserEmail(responseData.email || "");
        } else if (response.status === 403 && responseData.email_needed) {
          setNeedsEmail(true);
        } else {
          setError(responseData.message || "Login failed");
          setShake(true);
          setTimeout(() => setShake(false), 500);
        }
      } else {
        await fetchSession();
        setLocation("/");
      }
    } catch (error) {
      console.error("Login error:", error);
      setError("An unexpected error occurred");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setIsFormLoading(false);
    }
  };

  // If authenticated through Auth0
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
            logged in as {user.name || user.nickname || user.email}
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

  // Show loading state
  if (isLoading || processingAuth0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="text-center dark:text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p>{processingAuth0 ? "Completing login..." : "Loading..."}</p>
        </div>
      </div>
    );
  }

  // If already logged in through legacy system
  if (current_session.value && current_session.value.user_name) {
    // Icons
    const profileIcon = (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
      </svg>
    );

    const homeIcon = (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
      </svg>
    );

    const logoutIcon = (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm11.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L15.586 9H8a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
      </svg>
    );

    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="bg-gray-100 dark:bg-gray-800 p-8 shadow-lg w-80 rounded-lg text-center transform transition-all duration-300 hover:scale-105">
          <div className="flex flex-col items-center">
            {current_session.value.pfp_url && (
              <img
                src={current_session.value.pfp_url}
                alt="profile"
                className="w-24 h-24 rounded-full mb-4 object-cover border-4 border-blue-300 dark:border-blue-700 transition-all duration-300 hover:border-blue-500 dark:hover:border-blue-500"
              />
            )}
            <h2 className="text-2xl mb-6 text-center text-black dark:text-white font-medium">
              logged in as <span className="font-bold">@{current_session.value.user_name}</span>
            </h2>
            
            <div className="flex flex-col w-full gap-3">
              <MenuButton
                icon={profileIcon}
                variant="filled"
                onClick={() => setLocation("/profile")}
                tooltip="View your profile page"
              >
                View Profile
              </MenuButton>
              
              <MenuButton
                icon={homeIcon}
                variant="outline"
                onClick={() => setLocation("/")}
                tooltip="Return to home page"
              >
                Go to Home
              </MenuButton>
              
              <MenuButton
                icon={logoutIcon}
                variant="danger"
                onClick={async () => {
                  try {
                    const response = await fetch("/api/logout", {
                      method: "POST",
                      credentials: "include"
                    });
                    if (response.ok) {
                      current_session.value = false;
                      setLocation("/");
                    }
                  } catch (error) {
                    console.error("Logout error:", error);
                  }
                }}
                className="mt-2"
                confirmWarning={true}
                warningMessage="Are you sure you want to log out?"
              >
                Logout
              </MenuButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show email verification reminder
  if (needsVerification) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80 text-center rounded-lg">
          <h2 className="text-2xl mb-4 text-black dark:text-white">Verify Your Email</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Please check your email and click the verification link to activate your account.
            We sent it to {userEmail}.
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

  // Email update form
  if (needsEmail) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80 text-center rounded-lg">
          <h2 className="text-2xl mb-4 text-black dark:text-white">Update Email</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Please provide an email address for your account.
          </p>
          {error && (
            <div className="mb-4 text-red-500 text-sm text-center">{error}</div>
          )}
          <form onSubmit={handleEmailSubmit}>
            <div className="mb-4">
              <input
                className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white rounded"
                type="email"
                placeholder="your@email.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-purple-500 dark:bg-purple-700 text-white p-2 hover:bg-purple-600 dark:hover:bg-purple-800 rounded"
            >
              Update Email
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
      <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80 rounded-lg">
        <h2 className="text-2xl mb-4 text-center text-black dark:text-white">login</h2>
        {error && (
          <div className="mb-4 text-red-500 text-sm text-center">{error}</div>
        )}
        
        {/* Auth0 Login Button */}
        <button
          onClick={handleAuth0Login}
          className="w-full bg-blue-600 text-white p-2 hover:bg-blue-700 rounded mb-4 flex items-center justify-center opacity-60 cursor-not-allowed"
          disabled={true}
          title="too buggy rn"
        >
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-2">
            <path d="M19.9999 16.0001C19.9999 14.4088 20.6321 12.8828 21.7574 11.7576C22.8826 10.6324 24.4086 10.0001 25.9999 10.0001C27.5912 10.0001 29.1173 10.6324 30.2425 11.7576C31.3678 12.8828 32 14.4088 32 16.0001C32 17.5914 31.3678 19.1175 30.2425 20.2427C29.1173 21.3679 27.5912 22.0001 25.9999 22.0001C24.4086 22.0001 22.8826 21.3679 21.7574 20.2427C20.6321 19.1175 19.9999 17.5914 19.9999 16.0001Z" fill="white"/>
            <path d="M0 16.0001C0 13.6523 0.93767 11.4003 2.60649 9.7315C4.27531 8.06268 6.52729 7.12501 8.87494 7.12501H23.1249C23.1249 8.71632 22.4927 10.2424 21.3674 11.3676C20.2422 12.4928 18.7162 13.1251 17.1249 13.1251H8.87494C8.07989 13.1251 7.31737 13.4412 6.75599 14.0026C6.19461 14.564 5.87869 15.3265 5.87869 16.1216C5.87869 16.9166 6.19461 17.6791 6.75599 18.2405C7.31737 18.8019 8.07989 19.1179 8.87494 19.1179H17.1249C18.7162 19.1179 20.2422 19.7501 21.3674 20.8753C22.4927 22.0005 23.1249 23.5266 23.1249 25.1179C23.1249 25.1179 23.1249 25.1179 23.1249 25.118H8.87494C6.52729 25.118 4.27531 24.1803 2.60649 22.5115C0.93767 20.8427 0 18.5907 0 16.243C0 16.1621 0 16.0811 0 16.0001Z" fill="white"/>
            <path d="M25.9999 28.0001C25.9999 29.5914 25.3677 31.1175 24.2425 32.2427C23.1172 33.3679 21.5912 34.0001 19.9999 34.0001C18.4086 34.0001 16.8826 33.3679 15.7574 32.2427C14.6321 31.1175 13.9999 29.5914 13.9999 28.0001C13.9999 26.4088 14.6321 24.8828 15.7574 23.7576C16.8826 22.6324 18.4086 22.0001 19.9999 22.0001C21.5912 22.0001 23.1172 22.6324 24.2425 23.7576C25.3677 24.8828 25.9999 26.4088 25.9999 28.0001Z" fill="white"/>
          </svg>
          login with auth0
        </button>
        
        <div className="text-center text-gray-500 dark:text-gray-400 my-2">— or —</div>
        
        {/* Legacy login form */}
        <form onSubmit={handleLegacySubmit} className={shake ? "animate-shake" : ""}>
          <div className="mb-4">
            <input
              className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white rounded"
              type="text"
              placeholder="username"
              value={username}
              onChange={handleUsernameChange}
              required
            />
          </div>
          <div className="mb-6">
            <input
              className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white rounded"
              type="password"
              placeholder="password"
              value={password}
              onChange={handlePasswordChange}
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
            {isFormLoading ? "signing in..." : "login"}
          </button>
        </form>
        
        <div className="mt-4 flex justify-between text-sm">
          <span
            className="text-blue-500 dark:text-blue-400 cursor-pointer hover:underline"
            onClick={() => setLocation("/forgot-password")}
          >
            forgot password?
          </span>
          <span
            className="text-purple-500 cursor-pointer hover:underline"
            onClick={() => setLocation("/register")}
          >
            register
          </span>
        </div>
      </div>
    </div>
  );
};