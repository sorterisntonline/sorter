import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { Router, Route, Switch, useLocation } from "wouter";
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
import { Profile } from "./Profile.jsx";
import { signal } from "@preact/signals-react";
import { current_session, fetchSession } from "./session";
import AnnouncementBar, { showAnnouncement } from './components/AnnouncementBar';
import { MobileNav } from './MobileNav';
import { MobileNewTagChooser } from './components/MobileNewTagChooser.jsx';
import { TopNav } from './TopNav';  // Import the new TopNav
import { handleLogout } from './authUtils';
import { NEW_TAG_ROUTES, NEW_ITEM_ROUTES } from './constants/navigation';


export const namespace = signal(false);

const LogoutRoute = () => {
  useEffect(() => {
    handleLogout();
  }, []);

  return null;
};

const Root = () => {
  useEffect(() => {
    fetchSession();
  }, []);

  const [location] = useLocation();
  const isVoting = location.includes('/voting');
  
  // Only handle tag chooser here
  const showTagChooser = NEW_TAG_ROUTES.includes(location) && current_session.value?.user_name;

  return (
    <React.StrictMode>
      {/* Only show nav bar and its space if not voting */}
      {!isVoting && (
        <div className="fixed top-0 left-0 right-0 h-[56px] min-h-[56px] flex-none bg-white dark:bg-black z-[9996] lg:hidden" />
      )}
      <MobileNav />
      <div className={`min-h-screen flex flex-col lg:pt-0 ${!isVoting ? 'pt-[56px]' : ''}`}>
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
              <Route path="/feed">
                {(params) => {
                  tag.value = null;
                  selected_item.value = false;
                  return <FrontpageFeed />;
                }}
              </Route>
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
              <Route path="/logout">
                <LogoutRoute />
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

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);