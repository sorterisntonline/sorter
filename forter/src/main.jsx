import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import App from "./App.jsx";
import "./index.css";
import { Router, Route, Switch, useLocation } from "wouter";
import { TagList } from "./TagList.jsx";
import { tag, selected_item } from "./App.jsx";
import { Login } from "./Login.jsx";
import { Register } from "./Register.jsx";
import { Faq } from "./Faq.jsx";
import { CallbackRoute } from "./integrations/Spotify.jsx";
import { Integrations } from "./integrations/IntegrationsPanel.jsx";
import { FrontpageFeed } from "./FrontpageFeed.jsx";
import { Graph } from "./Graph.jsx";
import { Leaderboard } from "./Leaderboard.jsx";
import { Profile } from "./Profile.jsx";
import APIKeys from "./APIKeys.jsx";
import { signal } from "@preact/signals-react";
import { current_session, fetchSession } from "./session";
import AnnouncementBar, { showAnnouncement } from './components/AnnouncementBar';
import { MobileNav } from './MobileNav';
import { MobileNewTagChooser } from './components/MobileNewTagChooser.jsx';
import { TopNav } from './TopNav';  // Import the new TopNav
import { handleLogout } from './utils/authUtils.js';
import { initializeTheme, dark_mode } from './utils/themeUtils';
import { EmailVerification } from './EmailVerification';
import { ForgotPassword, ResetPassword } from './ForgotPassword';
import { Authorized } from './Authorized.jsx';
import { NoAuth } from './NoAuth.jsx';
import { LinkAuth0 } from './LinkAuth0.jsx';
import { SetupUsername } from './SetupUsername.jsx';

// Initialize theme immediately before any rendering
initializeTheme();

export const namespace = signal(false);

const LogoutRoute = () => {
  const { logout } = useAuth0();
  const [_, setLocation] = useLocation();
  
  useEffect(() => {
    const performLogout = async () => {
      const result = await handleLogout(logout);
      
      // If we're not using Auth0 logout (which handles redirect itself),
      // we need to manually redirect to /noauth
      if (result && !logout) {
        // Clear the session state after logout
        current_session.value = false;
        setLocation('/noauth');
      }
    };
    
    performLogout();
  }, [logout, setLocation]);

  return (
    <div className="flex items-center justify-center h-screen bg-white dark:bg-black">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
    </div>
  );
};

const Root = () => {
  const [sessionInitialized, setSessionInitialized] = useState(false);

  useEffect(() => {
    const initializeApp = async () => {
      await fetchSession();
      // Theme is already initialized at the top level
      setSessionInitialized(true);
    };
    
    initializeApp();
  }, []);

  const [location] = useLocation();
  const isVoting = location.includes('/voting');
  
  // Only handle tag chooser here
  const showTagChooser = location == "/" && current_session.value?.user_name;

  // Don't render the app until session is initialized
  if (!sessionInitialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-black">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <React.StrictMode>
      {/* Only show nav bar and its space if not voting */}
      {!isVoting && (
        <div className="fixed top-0 left-0 right-0 h-[56px] min-h-[56px] flex-none bg-white dark:bg-black z-[9996] lg:hidden" />
      )}
      <MobileNav />
      <div className={`min-h-screen flex flex-col lg:pt-0 ${!isVoting ? 'pt-[56px]' : ''} bg-white dark:bg-black text-black dark:text-white`}>
        <AnnouncementBar />
        <TopNav />
        <div 
          className="flex-1 transition-[margin] duration-300 ease-in-out"
          style={{ marginTop: showAnnouncement.value ? '40px' : '0' }}
        >
          <Router>
            <Switch>
              <Route path="/login"><Login /></Route>
              <Route path="/register"><Register /></Route>
              <Route path="/authorized"><Authorized /></Route>
              <Route path="/noauth"><NoAuth /></Route>
              <Route path="/link-auth0"><LinkAuth0 /></Route>
              <Route path="/setup-username"><SetupUsername /></Route>
              <Route path="/feed">
                {(params) => {
                  tag.value = null;
                  selected_item.value = false;
                  return <FrontpageFeed />;
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
              <Route path="/:tagid/:slug/voting">
                {(params) => {
                  console.log("Voting route hit:", params);
                  return <App tagid={params.tagid} isVoting={true} />;
                }}
              </Route>
              <Route path="/:tagid/:slug">
                {(params) => {
                  if (params.tagid === "namespace") {
                    return <></>;
                  }
                  console.log("Regular tag route hit:", params);
                  return <App tagid={params.tagid} isVoting={false} />;
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
              <Route path="/keys">
                <APIKeys />
              </Route>
              <Route path="/logout">
                <LogoutRoute />
              </Route>
              <Route path="/verify">
                <EmailVerification />
              </Route>
              <Route path="/forgot-password">
                <ForgotPassword />
              </Route>
              <Route path="/reset-password">
                <ResetPassword />
              </Route>
              {/* 404 catch-all route */}
              <Route path="/:rest*">
                <div className="flex flex-col items-center justify-center min-h-screen dark:text-white">
                  <h1 className="text-2xl mb-4">404: page not found</h1>
                  <p className="text-lg mb-8">this page doesn't exist <sub><i>(...yet?)</i></sub></p>
                  <button 
                    onClick={() => window.history.back()}
                    className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-2 rounded transition-colors"
                  >
                    go back
                  </button>
                </div>
              </Route>
            </Switch>
          </Router>
        </div>
      </div>
      <div className="fixed bottom-6 right-6 z-[99999] pointer-events-auto">
        {showTagChooser && <MobileNewTagChooser />}
      </div>
    </React.StrictMode>
  );
};

// Add dark mode class to html element based on initial state
if (dark_mode.value) {
  document.documentElement.classList.add('dark');
} else {
  document.documentElement.classList.remove('dark');
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <Auth0Provider
    domain="auth.sorter.social"
    clientId="GiBSx3V86zKjB4d0PRwso4mZBXTlRQci"
    authorizationParams={{
      redirect_uri: `${window.location.origin}/authorized`,
      response_type: 'code',
      scope: 'openid profile email'
    }}
    useRefreshTokens={true}
    cacheLocation="localstorage"
  >
    <Root />
  </Auth0Provider>
);