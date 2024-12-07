import { useState } from "react";
import useSWR from "swr";
import { useLocation } from "wouter";

export const loginLinear = async () => {
  const params = new URLSearchParams("");
  params.append("client_id", "169f3f75ce5946ad42e0df47eb23c2eb");
  const redirect_uri = window.location.origin + "/api/linear/callback";
  params.append("redirect_uri", redirect_uri);
  params.append("response_type", "code");
  params.append("scope", "read write");
  params.append("state", window.location);
  params.append("actor", "application");
  window.location.href =
    "https://linear.app/oauth/authorize?" + params.toString();
};

export const postView = async (id) => {
  const r = await fetch("/api/linear/views", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: id }),
  });

  await loadTag(undefined);

  console.log("posted");
};

const fetcher = (url) => fetch(url).then((res) => res.json());
const LinearViews = () => {
  const { data, error, isLoading } = useSWR("/api/linear/views", fetcher);

  if (isLoading) return <div>loading...</div>;
  if (error) return <div>error...</div>;

  if (data.errors) return <></>;

  return (
    <div className="border">
      {data.views.data.projects.nodes.map((project) => {
        return (
          <div
            key={project.id}
            className="cursor-pointer border border-blue-600"
            onClick={() => postView(project.id)}
          >
            {project.name}
          </div>
        );
      })}
    </div>
  );
};
export const Linear = ({ }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const body = (
    <>
      <div
        className="border-2 border-blue-500 w-fit cursor-pointer m-1"
        onClick={loginLinear}
      >
        log in to linear
      </div>
      <LinearViews />
    </>
  );
  return (
    <>
      <a
        className="w-fit cursor-pointer m-1"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="px-3 py-1 bg-blue-200 dark:bg-blue-950 hover:bg-blue-300 dark:hover:bg-blue-900 transition-colors flex items-center gap-2">
          + New Linear Tag
        </div>
      </a>
      {isOpen && body}
    </>
  );
};
