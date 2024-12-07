import { tag } from "../App";
import useSWR from "swr";
import { startTrackingLiked, youtubeLogin } from "./Youtube";
import { loginLinear, postView } from "./Linear";
import { current_session } from "../LoginForm";
import { loadTag } from "../Network";

const LinearControls = () => {
  return (
    <div className="text-xl">
      this tag is a linear project.
      <a
        className="cursor-pointer border-2 border-blue-300"
        onClick={loginLinear}
      >
        log in
      </a>
      <a
        className="cursor-pointer border-2 border-blue-300"
        onClick={() => postView(tag.value.tag["domain_pk"])}
      >
        refresh
      </a>
    </div>
  );
};

const SpotifyControls = () => {
  const refresh = async () => {
    const p = await fetch("/api/spotify/playlist/refresh", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tagid: tag.value.tag["id"],
        playlist_id: tag.value.tag["domain_pk"],
      }),
    });
    refresh();
  };
  return (
    <div className="text-xl">
      this tag is a spotify playlist.
      <a
        className="cursor-pointer border-2 border-green-300"
        onClick={spotifyLogin}
      >
        log in
      </a>
      <a className="cursor-pointer border-2 border-green-300" onClick={refresh}>
        refresh
      </a>
    </div>
  );
};

const YoutubeControls = () => {
  return (
    <div className="text-xl">
      this tag is your youtube liked videos.
      <a
        className="cursor-pointer border-2 border-red-300"
        onClick={youtubeLogin}
      >
        log in
      </a>
      <a
        className="cursor-pointer border-2 border-red-300"
        onClick={startTrackingLiked}
      >
        refresh
      </a>
    </div>
  );
};

const RedditControls = () => {
  const refreshReddit = async () => {
    const p = await fetch("/api/reddit/refresh", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tagid: tag.value.tag["id"],
      }),
    });
    loadTag(tag.value.tag["id"]);
  }
  return (
    <div className="text-xl">
      click to refresh
      <a
        className="cursor-pointer border-2 border-orange-300"
        onClick={refreshReddit}
      >
        refresh
      </a>
    </div>
  );
};

export const IntegrationsPanel = () => {
  if (!current_session.value.user_name === tag["owner"]) return <></>;
  if (!tag.value.tag["domain_pk_namespace"]) return <></>;
  if (tag.value.tag["domain_pk_namespace"] === "spotify.playlist")
    return <SpotifyControls />;
  if (tag.value.tag["domain_pk_namespace"] === "youtube.liked")
    return <YoutubeControls />;
  if (tag.value.tag["domain_pk_namespace"] === "linear.project")
    return <LinearControls />;
  if (tag.value.tag["domain_pk_namespace"] === "reddit.sub")
    return <RedditControls />;
  return <div>unknown integration type</div>;
};

const spotifyLogin = async () => {
  const params = new URLSearchParams("");
  params.append("client_id", "e61d249115c9451a8137a2a5af90d76b");
  params.append("response_type", "code");
  const redirect_uri = window.location.origin + "/api/spotify/callback";
  params.append("redirect_uri", redirect_uri);
  params.append(
    "scope",
    "playlist-read-private playlist-modify-private playlist-modify-public playlist-read-collaborative"
  );
  params.append("state", window.location);
  window.location.href =
    "https://accounts.spotify.com/authorize?" + params.toString();
};

const fetcher = (arg) => fetch(arg).then((res) => res.json());

const SpotifyRow = ({ playlist }) => {
  return (
    <div className="border-2 border-green-400">{playlist["title"]}</div>
  );
};

const SpotifyPanel = ({ code }) => {
  return (
    <div className="border-2 border-green-500 w-fit">
      logged into spotify as {code.id}
    </div>
  );
};

export const Integrations = () => {
  const { data, error, isLoading } = useSWR(
    "/api/integrations/status",
    fetcher
  );

  if (isLoading) return <div>loading...</div>;
  if (error) return <div>error</div>;

  return (
    <div className="flex flex-col">
      {JSON.stringify(data)}
      {data.spotify ? (
        <SpotifyPanel code={data.spotify} tags={data.spotifyTags} />
      ) : (
        <div
          className="border-2 border-green-500 w-fit cursor-pointer"
          onClick={spotifyLogin}
        >
          log in to spotify
        </div>
      )}
      {data.youtube ? (
        <div className="border-2 border-red-500 w-fit">logged into youtube</div>
      ) : (
        <div
          className="border-2 border-red-500 w-fit cursor-pointer"
          onClick={youtubeLogin}
        >
          log in to youtube
        </div>
      )}
      <div className="border-2 border-blue-500 w-fit cursor-pointer">
        log in to linear
      </div>
    </div>
  );
};
