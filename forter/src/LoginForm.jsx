import { useState, useEffect } from "react";
import { signal } from "@preact/signals-react";

export const current_session = signal(false);

async function fetchSession() {
  const response = await fetch("/api/login", {
    credentials: "include",
  });
  const text = await response.json();
  if (text) {
    current_session.value = text;
  }
}

export const LoginForm = () => {
  useEffect(() => {
    fetchSession();
  }, []);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleUsernameChange = (event) => setUsername(event.target.value);
  const handlePasswordChange = (event) => setPassword(event.target.value);

  const [username_r, setUsername_r] = useState("");
  const [password_r, setPassword_r] = useState("");
  const [password2_r, setPassword2_r] = useState("");

  const handleUsername_rChange = (event) => setUsername_r(event.target.value);
  const handlePassword_rChange = (event) => setPassword_r(event.target.value);
  const handlePassword2_rChange = (event) => setPassword2_r(event.target.value);

  const handleRegister = async (event) => {
    event.preventDefault();
    if (password_r !== password2_r) {
      alert("passwords do not match");
      return;
    }

    const response = await fetch("/api/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_name: username_r, password: password_r }),
    });
    if (!response.ok) {
      const msg = await response.text();
      alert(msg);
    } else {
      fetchSession();
    }
  };

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
      fetchSession();
    }
  };

  if (current_session.value.user_name)
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
        logged in as {current_session.value.user_name} {" "}
        <button
          className="border-2 cursor-pointer"
          onClick={async () => {
            // remove cookie
            await fetch("/api/logout", {
              method: "POST",
              credentials: "include",
            });
            fetchSession();
          }}
        >
          logout
        </button>
      </div>
    );

  return (
    <div className="dark:text-white">
      <form
        style={{
          width: 300,
          position: "fixed",
          right: 0,
          bottom: 23,
          height: "1.5rem",
        }}
        className="flex flex-row"
        onSubmit={handleRegister}
      >
        <input
          className="border-2 w-full dark:bg-[#181a1b]"
          autoComplete="username"
          type="text"
          placeholder="username"
          value={username_r}
          onChange={handleUsername_rChange}
        />
        <input
          className="border-2 w-full dark:bg-[#181a1b]"
          type="password"
          autoComplete="new-password"
          placeholder="password"
          value={password_r}
          onChange={handlePassword_rChange}
        />
        <input
          className="border-2 w-full dark:bg-[#181a1b]"
          type="password"
          autoComplete="new-password"
          placeholder="password2"
          value={password2_r}
          onChange={handlePassword2_rChange}
        />
        <input
          className="border-2 cursor-pointer"
          type="submit"
          value="Register"
        />
      </form>
      <form
        style={{
          width: 200,
          position: "fixed",
          right: 0,
          bottom: 0,
          height: "1.5rem",
        }}
        className="flex flex-row"
        onSubmit={handleSubmit}
      >
        <input
          className="border-2 w-full dark:bg-[#181a1b]"
          type="text"
          autoComplete="username"
          placeholder="username"
          value={username}
          onChange={handleUsernameChange}
        />
        <input
          className="border-2 w-full dark:bg-[#181a1b]"
          type="password"
          placeholder="password"
          autoComplete="current-password"
          value={password}
          onChange={handlePasswordChange}
        />
        <input
          className="border-2 cursor-pointer"
          type="submit"
          value="Login"
        />
      </form>
    </div>
  );
};
