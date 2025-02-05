import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { current_session, fetchSession } from "./session"; // Updated import
import { handleAuthReturn } from './authUtils';

export const Register = () => {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    fetchSession();
  }, []);

  const [username_r, setUsername_r] = useState("");
  const [password_r, setPassword_r] = useState("");
  const [password2_r, setPassword2_r] = useState("");
  const [error, setError] = useState("");

  const handleUsername_rChange = (event) => setUsername_r(event.target.value);
  const handlePassword_rChange = (event) => setPassword_r(event.target.value);
  const handlePassword2_rChange = (event) => setPassword2_r(event.target.value);

  const handleSubmit = async (event) => {
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
        body: JSON.stringify({ user_name: username_r, password: password_r }),
      });
      if (!response.ok) {
        const msg = await response.text();
        setError(msg);
      } else {
        await fetchSession();
        handleAuthReturn();
      }
    } catch (error) {
      setError("Registration failed");
    }
  };

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
          onClick={async () => {
            await fetch("/api/logout", {
              method: "POST",
              credentials: "include",
            });
            await fetchSession();
            setLocation("/");
          }}
        >
          logout
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
      <form
        onSubmit={handleSubmit}
        className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80"
      >
        <h2 className="text-2xl mb-4 text-center text-black dark:text-white">register</h2>
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
        <p className="mt-4 text-center text-gray-700 dark:text-gray-200">
          already have an account?{" "}
          <span
            className="text-blue-500 cursor-pointer"
            onClick={() => setLocation("/login")}
          >
            login
          </span>
        </p>
      </form>
    </div>
  );
};