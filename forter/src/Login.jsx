import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { current_session, fetchSession } from "./session";
import { handleAuthReturn } from './authUtils';

export const Login = () => {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    fetchSession();
  }, []);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleUsernameChange = (event) => setUsername(event.target.value);
  const handlePasswordChange = (event) => setPassword(event.target.value);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_name: username, password: password }),
      });
      if (!response.ok) {
        const msg = await response.text();
        setError(msg);
        setShake(true);
        setTimeout(() => setShake(false), 500);
      } else {
        await fetchSession();
        handleAuthReturn();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "include",
    });
    await fetchSession();
  };

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
            onClick={handleLogout}
            className="w-full bg-red-500 text-white p-2 hover:bg-red-600 rounded"
          >
            logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
      <form
        onSubmit={handleSubmit}
        className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80"
      >
        <h2 className="text-2xl mb-4 text-center text-black dark:text-white">login</h2>
        {error && (
          <div className="mb-4 text-red-500 text-sm text-center">{error}</div>
        )}
        <div className="mb-4">
          <input
            className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white"
            type="text"
            placeholder="username"
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
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className={`w-full p-2 transition-colors duration-200
            ${isLoading 
              ? 'bg-gray-400 dark:bg-gray-600' 
              : 'bg-blue-500 dark:bg-blue-700 hover:bg-blue-600 dark:hover:bg-blue-800'
            }
            text-white
            ${shake ? 'animate-shake' : ''}`}
        >
          {isLoading ? 'logging in...' : 'login'}
        </button>
        <p className="mt-4 text-center text-gray-700 dark:text-gray-200">
          no account yet?{" "}
          <span
            className="text-blue-500 cursor-pointer"
            onClick={() => setLocation("/register")}
          >
            register
          </span>
        </p>
      </form>
    </div>
  );
}