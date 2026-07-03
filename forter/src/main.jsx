import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import App from './App.jsx';
import './index.css';
import './App.css';
import { Router, Route, Switch, useLocation } from 'wouter';
import { TagList } from './TagList.jsx';
import { tag, selected_item } from './App.jsx';
import { Login } from './Login.jsx';
import { Register } from './Register.jsx';
import { Faq } from './Faq.jsx';
import { CallbackRoute } from './integrations/Spotify.jsx';
import { Integrations } from './integrations/IntegrationsPanel.jsx';
import { FrontpageFeed } from './FrontpageFeed.jsx';
import { Graph } from './Graph.jsx';
import { Leaderboard } from './Leaderboard.jsx';
import { Profile } from './Profile.jsx';
import APIKeys from './APIKeys.jsx';
import { signal } from '@preact/signals-react';
import { current_session, fetchSession } from './session';
import AnnouncementBar, { showAnnouncement } from './components/AnnouncementBar';
import { MobileNav } from './MobileNav';
import { MobileNewTagChooser } from './components/MobileNewTagChooser.jsx';
import { TopNav } from './TopNav';
import { handleLogout } from './utils/authUtils.js';
import { initializeTheme, dark_mode } from './utils/themeUtils';
import { EmailVerification } from './EmailVerification';
import { ForgotPassword, ResetPassword } from './ForgotPassword';
import { Button } from './components/ui/Button';

initializeTheme();

export const namespace = signal(false);

const LogoutRoute = () => {
  const { logout } = useAuth0();
  const [_, setLocation] = useLocation();

  useEffect(() => {
    const performLogout = async () => {
      const result = await handleLogout(logout);
      if (result && !logout) {
        current_session.value = false;
        setLocation('/noauth');
      }
    };
    performLogout();
  }, [logout, setLocation]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
};

const Root = () => {
  const [sessionInitialized, setSessionInitialized] = useState(false);

  useEffect(() => {
    const initializeApp = async () => {
      await fetchSession();
      setSessionInitialized(true);
    };
    initializeApp();
  }, []);

  const [location] = useLocation();
  const isVoting = location.includes('/voting');
  const showTagChooser = location === '/' && current_session.value?.user_name;

  if (!sessionInitialized) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-surface">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <React.StrictMode>
      <MobileNav />
      <div
        className={`app-shell ${isVoting ? 'app-shell--immersive' : ''}`}
        style={{ marginTop: showAnnouncement.value ? '2.5rem' : undefined }}
      >
        <AnnouncementBar />
        <TopNav />
        <main className="flex-1">
          <Router>
            <Switch>
              <Route path="/login"><Login /></Route>
              <Route path="/register"><Register /></Route>
              <Route path="/feed">
                {() => {
                  tag.value = null;
                  selected_item.value = false;
                  return <FrontpageFeed />;
                }}
              </Route>
              <Route path="/">
                {() => {
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
                {(params) => <App tagid={params.tagid} isVoting />}
              </Route>
              <Route path="/:tagid/:slug">
                {(params) => {
                  if (params.tagid === 'namespace') return <></>;
                  return <App tagid={params.tagid} isVoting={false} />;
                }}
              </Route>
              <Route path="/faq"><Faq /></Route>
              <Route path="/spotify/search/:key"><CallbackRoute /></Route>
              <Route path="/integrations"><Integrations /></Route>
              <Route path="/leaderboard"><Leaderboard /></Route>
              <Route path="/profile"><Profile /></Route>
              <Route path="/keys"><APIKeys /></Route>
              <Route path="/logout"><LogoutRoute /></Route>
              <Route path="/verify"><EmailVerification /></Route>
              <Route path="/forgot-password"><ForgotPassword /></Route>
              <Route path="/reset-password"><ResetPassword /></Route>
              <Route path="/:rest*">
                <div className="page flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
                  <h1 className="text-2xl">404: page not found</h1>
                  <p className="text-ink-muted">this page doesn&apos;t exist (...yet?)</p>
                  <Button variant="primary" onClick={() => window.history.back()}>
                    go back
                  </Button>
                </div>
              </Route>
            </Switch>
          </Router>
        </main>
      </div>
      {showTagChooser && (
        <div className="fixed bottom-4 right-4 z-fab pointer-events-auto">
          <MobileNewTagChooser />
        </div>
      )}
    </React.StrictMode>
  );
};

if (dark_mode.value) {
  document.documentElement.classList.add('dark');
} else {
  document.documentElement.classList.remove('dark');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <Auth0Provider
    domain="auth.sorter.social"
    clientId="GiBSx3V86zKjB4d0PRwso4mZBXTlRQci"
    authorizationParams={{
      redirect_uri: `${window.location.origin}/authorized`,
      response_type: 'code',
      scope: 'openid profile email',
    }}
    useRefreshTokens
    cacheLocation="localstorage"
  >
    <Root />
  </Auth0Provider>
);
