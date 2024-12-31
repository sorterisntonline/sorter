import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { Router, Route, Link, useRoute, useLocation } from "wouter";
import { TagList } from "./TagList.jsx";
import { TagList2 } from "./TagList2.jsx";
import { TagList3 } from "./TagList3.jsx";
import { tag, selected_item } from "./App.jsx";
import { Login } from "./Login.jsx";
import { Register } from "./Register.jsx";
import { Faq } from "./Faq.jsx";
import { CallbackRoute } from "./integrations/Spotify.jsx";
import { Integrations } from "./integrations/IntegrationsPanel.jsx";
import { FrontpageFeed } from "./FrontpageFeed.jsx";
import { Graph } from "./Graph.jsx";
import { Leaderboard } from "./Leaderboard.jsx";
import { Profile, dark_mode } from "./Profile.jsx";
import { signal } from "@preact/signals-react";
import { current_session, fetchSession } from "./session"; // Ensure fetchSession is exported from session.js
// import { Twitter } from "./Twitter.jsx";
import { ProfileHoverPane } from "./ProfileHoverPane.jsx"; // Import the ProfileHoverPane component

export const namespace = signal(false);

const MyLink = (props) => {
  const [isActive] = useRoute(props.to);

  return (
    <Link {...props} className="flex">
      <a
        className={
          isActive
            ? "dark:bg-blue-900 bg-blue-300 px-1"
            : "px-1"
        }
      >
        {props.children}
      </a>
    </Link>
  );
};

const ShowLink = (props) => {
  const [isActive, params] = useRoute(props.to);

  return (
    <a className={isActive ? "dark:bg-black px-2 underline" : ""}>
      {params && params.slug !== undefined && params.slug}
    </a>
  );
};

const TopNav = () => {
  const [location, setLocation] = useLocation();
  const [currentPath] = useRoute(location);
  const [isHovered, setIsHovered] = useState(false);
  const [hideTimeout, setHideTimeout] = useState(null);

  // Determine if the current path is /login or /register
  const isAuthPage = location === "/login" || location === "/register";

  const handleMouseEnter = () => {
    if (hideTimeout) clearTimeout(hideTimeout);
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    const timeout = setTimeout(() => {
      setIsHovered(false);
    }, 300); // 300ms delay before hiding
    setHideTimeout(timeout);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, [hideTimeout]);

  return (
    <div
      className="top-0 right-0 flex flex-wrap items-center justify-between dark:bg-black text-black dark:text-white w-full px-4 py-2"
      style={{ position: "fixed", top: 0, zIndex: 10 }}
    >
      {/* Left side navigation links */}
      <div className="flex items-center space-x-2">
        <MyLink to="/tags3">
          <div className="p-0">Hierarchy</div>
        </MyLink>
        <MyLink to="/tags2">
          <div className="p-0">Tags2</div>
        </MyLink>
        <MyLink to="/">
          <div className="p-0">Tags</div>
        </MyLink>
        <MyLink to="/feed">
          <div className="p-0">Feed</div>
        </MyLink>
        <MyLink to="/faq">
          <div className="p-0">FAQ</div>
        </MyLink>
        <MyLink to="/leaderboard">
          <div className="p-0">Leaderboard</div>
        </MyLink>
        <ShowLink to="/:tag/:slug" />
      </div>

      {/* Right side authentication */}
      <div className="flex items-center space-x-4">
        {current_session.value && current_session.value.user_name ? (
          <div 
            className="relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div
              className="hover:text-blue-500 transition-colors cursor-pointer"
              onClick={() => setLocation("/profile")}
            >
              {"@" + current_session.value.user_name}
            </div>
            {isHovered && (
              <ProfileHoverPane onClose={() => setIsHovered(false)} />
            )}
          </div>
        ) : (
          !isAuthPage && (
            <div className="flex items-center space-x-2">
              <button
                className="bg-blue-200 dark:bg-blue-950 hover:bg-blue-300 dark:hover:bg-blue-900 text-black dark:text-white px-3 py-1 transition-colors"
                onClick={() => setLocation("/login")}
              >
                login
              </button>
              <button
                className="bg-green-200 dark:bg-green-950 hover:bg-green-300 dark:hover:bg-green-900 text-black dark:text-white px-3 py-1 transition-colors"
                onClick={() => setLocation("/register")}
              >
                register
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
};

const LogoutRoute = () => {
  const [_, setLocation] = useLocation();

  useEffect(() => {
    const performLogout = async () => {
      try {
        const response = await fetch("/api/logout", {
          method: "POST",
          credentials: "include",
        });
        if (!response.ok) {
          const msg = await response.text();
          alert(msg);
        }
        await fetchSession();
        setLocation("/");
      } catch (error) {
        console.error("Logout failed:", error);
        setLocation("/");
      }
    };

    performLogout();
  }, [setLocation]);

  return null;
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Router>
      <TopNav />
      <Route path="/login">
        <Login />
      </Route>
      <Route path="/register">
        <Register />
      </Route>
      <Route path="/feed">
        {(params) => {
          tag.value = null;
          selected_item.value = false;
          return <FrontpageFeed />;
        }}
      </Route>
      {/* <Route path="/x">
        <Twitter />
      </Route> */}
      <Route path="/tags3">
        {(params) => {
          tag.value = null;
          selected_item.value = false;
          return <TagList3 />;
        }}
      </Route>
      <Route path="/tags2">
        {(params) => {
          tag.value = null;
          selected_item.value = false;
          return <TagList2 />;
        }}
      </Route>
      <Route path="/">
        {(params) => {
          tag.value = null;
          selected_item.value = false;
          return <TagList />;
        }}
      </Route>
      <Route path="/namespace/:namespace">
        {(params) => {
          namespace.value = params.namespace;
          return <App />;
        }}
      </Route>
      <Route path="/:tagid/:slug/graph">
        {(params) => {
          tag.value = null;
          selected_item.value = false;
          return <Graph tagid={params.tagid} />;
        }}
      </Route>
      <Route path="/:tagid/:slug">
        {(params) => {
          if (params.tagid === "namespace") {
            return <></>;
          }
          return <App tagid={params.tagid} />;
        }}
      </Route>
      <Route path="/:tagid/:slug/voting">
        {(params) => {
          return <App tagid={params.tagid} isVoting />;
        }}
      </Route>
      <Route path="/faq">
        <Faq />
      </Route>
      <Route path="/spotify/search/:key">
        <CallbackRoute />
      </Route>
      <Route path="/integrations">
        <Integrations />
      </Route>
      <Route path="/leaderboard">
        <Leaderboard />
      </Route>
      <Route path="/profile">
        <Profile />
      </Route>
      <Route path="/logout">
        <LogoutRoute />
      </Route>
    </Router>
  </React.StrictMode>
);