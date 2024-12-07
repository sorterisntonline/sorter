import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { Router, Route, Link, useRoute } from "wouter";
import { TagList } from "./TagList.jsx";
import { TagList2 } from "./TagList2.jsx";
import { TagList3 } from "./TagList3.jsx";
import { tag } from "./App";
import { LoginForm, current_session } from "./LoginForm";
import { selected_item } from "./App.jsx";
import { Faq } from "./Faq.jsx";
import { CallbackRoute } from "./integrations/Spotify.jsx";
import { Integrations } from "./integrations/IntegrationsPanel.jsx";
import { FrontpageFeed } from "./FrontpageFeed.jsx";
import { Graph } from "./Graph.jsx";
import { Leaderboard } from "./Leaderboard.jsx";
import { Profile, dark_mode } from "./Profile.jsx";
import { signal } from "@preact/signals-react";
// import { Twitter } from "./Twitter.jsx";

export const namespace = signal(false);

const MyLink = (props) => {
  const [isActive] = useRoute(props.to);

  return (
    <Link {...props} className="flex">
      <a className={isActive ? "dark:bg-blue-900 bg-blue-300 px-1" : "px-1"}>{props.children}</a>
    </Link>
  );
};

const ShowLink = (props) => {
  const [isActive, params] = useRoute(props.to);

  return (
    <a className={"" + (isActive ? "dark:bg-black px-2 underline" : "")}>
      {params && params.slug !== undefined && params.slug}
    </a>
  );
};

const TopNav = () => {
  return (
    <div
      className={"top-0 flex dark:bg-black text-black dark:text-white"}
      style={{ position: "fixed", top: 0 }}
    >
      {/* <MyLink to="/x">
        <div className=" p-0">Twitter</div>
      </MyLink> */}
      <MyLink to="/tags3">
        <div className=" p-0">Heirarchy</div>
      </MyLink>
      <MyLink to="/tags2">
        <div className=" p-0">Tags2</div>
      </MyLink>
      <MyLink to="/">
        <div className=" p-0">Tags</div>
      </MyLink>
      <MyLink to="/feed">
        <div className=" p-0">Feed</div>
      </MyLink>
      <MyLink to="/faq">
        <div className=" p-0">FAQ</div>
      </MyLink>
      <MyLink to="/leaderboard">
        <div className=" p-0">Leaderboard</div>
      </MyLink>
      {current_session.value.user_name && (
        <MyLink to="/profile">
          <div className=" p-0">Profile</div>
        </MyLink>
      )}
      {/* <MyLink to="/integrations">
        <div className="text-white p-0">Integrations</div>
      </MyLink> */}
      <ShowLink to="/:tag/:slug" />
    </div>
  );
};


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Router>
      <TopNav />
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
          if (params.tagid == "namespace") {
            return <></>
          }
          return <App tagid={params.tagid} />;
        }}
      </Route>
      <Route path="/:tagid/:slug/voting">
        {(params) => {
          return <App tagid={params.tagid} isVoting/>;
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
    </Router>
    <LoginForm />
  </React.StrictMode >
);
