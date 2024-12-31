import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { current_session } from "./session"; // Updated import

async function fetchSession() {
  const response = await fetch("/api/login", {
    credentials: "include",
  });
  const text = await response.json();
  if (text) {
    current_session.value = text;
  }
}

export const Login = () => {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    fetchSession();
  }, []);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleUsernameChange = (event) => setUsername(event.target.value);
  const handlePasswordChange = (event) => setPassword(event.target.value);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const response = await fetch("/api/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_name: username, password: password }),
    });
    if (!response.ok) {
      const msg = await response.text();
      alert(msg);
    } else {
      await fetchSession();
      setLocation("/");
    }
  };

  if (current_session.value.user_name) {
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
        logged in as {current_session.value.user_name}
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
          className="w-full bg-blue-500 dark:bg-blue-700 text-white p-2 hover:bg-blue-600 dark:hover:bg-blue-800"
        >
          login
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
};