import { useState } from "react";
import useSWR from "swr";
import { useLocation } from "wouter";

const Playlists = ({ data, isLoading, error, onClick }) => {
  if (isLoading) return <h1> loading... </h1>;
  if (error) return <h1> error </h1>;

  console.log(data);
  return (
    <table>
      <tbody>
        {data.map((playlist) => playlist && (
          <tr
            className="dark:hover:bg-gray-800 hover:bg-gray-200 hover:cursor-pointer border-2 w-fit"
            key={playlist.id}
            onClick={() => onClick(playlist)}
          >
            <td>{playlist.name}</td>
            <td>{playlist.description}</td>
            <td>{playlist.tracks.total}songs </td>
            <td>
              {playlist.images && playlist.images.length > 0 && (
                <img src={playlist.images[0].url} width="100" height="100" />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const postPlaylist = async (playlist, finished) => {
  if (confirm("add playlist as tag?")) {
    const r = await fetch("/api/spotify/playlists", {
      method: "POST",
      body: JSON.stringify(playlist),
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    });
    if (!r.ok) {
      alert(JSON.stringify(await r.json()));
    }
    finished();
  }
};

export const CallbackRoute = ({ refreshFrontpage, setClosed }) => {
  const [page, setPage] = useState(0);
  const [_, setLocation] = useLocation();

  const { data, isLoading, error } = useSWR(
    "/api/spotify/playlists?offset=" + page,
    //const { data, isLoading } = useSWR("https://api.spotify.com/v1/me",
    (url) => fetch(url).then((res) => res.json())
  );

  if (error) return <h1> error </h1>;

  const onClick = async (playlist) => {
    postPlaylist(playlist, () => {
      setLocation("/");
      refreshFrontpage();
      setClosed(true);
    });
  };

  return (
    <div className="w-2/3 justify-self-center">
      {page >= 1 && (
        <button className="border-2" onClick={() => setPage(page - 20)}>
          prev
        </button>
      )}
      {page}
      <button className="border-2" onClick={() => setPage(page + 20)}>
        next
      </button>
      {isLoading && <h1> loading... </h1>}
      {!closed && data && (
        <Playlists
          data={data}
          isLoading={isLoading}
          error={false}
          onClick={onClick}
        />)}
    </div>
  );
};

export const login = async () => {
  window.location.href = `/api/spotify/auth?redirect=${encodeURIComponent(window.location.href)}`;
};

const getPlaylists = async (q) => {
  const url = new URLSearchParams("");
  url.append("q", q);
  const playlists = await fetch("/api/spotify/playlists?" + url.toString(), {});
  const data = await playlists.json();

  return data;
};

const SpotifyPanel = ({ refreshFrontpage, code }) => {
  const [closed, setClosed] = useState(false);

  if (closed) {
    return <></>
  }
  return (
    <div>
      {!code && (
        <button className="border-2 border-green-600" onClick={login}>
          log in to spotify to see private playlists
        </button>
      )}

      <CallbackRoute refreshFrontpage={refreshFrontpage} setClosed={setClosed} />
    </div>
  );
};

export const Spotify = ({ refreshFrontpage }) => {
  const [isInspecting, setIsInspecting] = useState(false);
  return (
    <>
      <div
        className="w-fit cursor-pointer m-1 "
        onClick={(_) => setIsInspecting(!isInspecting)}
      >
        <div className="px-3 py-1 bg-green-200 dark:bg-green-950 hover:bg-green-300 dark:hover:bg-green-900 transition-colors flex items-center gap-2">
          + New Spotify Tag
        </div>
      </div>
      {isInspecting && <SpotifyPanel refreshFrontpage={refreshFrontpage} code={false} />}
    </>
  );
};
