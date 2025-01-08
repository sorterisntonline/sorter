import { useState } from "react";
import { useLocation } from "wouter";

export const youtubeLogin = async () => {
  const params = new URLSearchParams("");
  params.append(
    "client_id",
    import.meta.env.VITE_YOUTUBE_CLIENT_ID
  );
  const redirect_uri = window.location.origin + "/api/youtube/callback";
  params.append("redirect_uri", redirect_uri);
  params.append("response_type", "code");
  params.append("scope", "https://www.googleapis.com/auth/youtube.readonly");
  params.append("state", window.location);
  params.append("access_type", "offline");
  params.append("approval_type", "force");
  window.location.href =
    "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
};

export const startTrackingLiked = async () => {
  const r = await fetch("/api/youtube/playlist", {
    method: "POST",
    credentials: "include",
  });
  const j = await r.json();
  console.log(j);
  window.location = window.location;
};

export const Youtube = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [location, setLocation] = useLocation();

  return <></>
  return (
    <>
      <a
        className="w-fit cursor-pointer m-1"
        onClick={(e) => setIsOpen(!isOpen)}
      >
        [+ youtube tag]
      </a>
      <div hidden={!isOpen}>
        <div
          className="border-2  m-1 border-red-500 w-fit cursor-pointer"
          onClick={youtubeLogin}
        >
          log in to youtube
        </div>
        <div
          onClick={startTrackingLiked}
          className="border-2 border-red-500 w-fit cursor-pointer"
        >
          start tracking liked videos
        </div>
      </div>
    </>
  );
};
