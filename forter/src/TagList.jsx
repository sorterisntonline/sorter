import useSWR from "swr";
import { useLocation } from "wouter";
import { Modal } from "./Modal";
import { useState } from "react";
import { Spotify } from "./integrations/Spotify";
import { Youtube } from "./integrations/Youtube";
import { Linear } from "./integrations/Linear";
import { RedditLogo } from "./RedditLogo";
import { dark_mode } from "./Profile";

const LinearLogo = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" width="18" className="m-1" height="18" viewBox="0 0 100 100"> <path fill="#5E6AD2" d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857L39.3342 97.1782c.6889.6889.0915 1.8189-.857 1.5964C20.0515 94.4522 5.54779 79.9485 1.22541 61.5228ZM.00189135 46.8891c-.01764375.2833.08887215.5599.28957165.7606L52.3503 99.7085c.2007.2007.4773.3075.7606.2896 2.3692-.1476 4.6938-.46 6.9624-.9259.7645-.157 1.0301-1.0963.4782-1.6481L2.57595 39.4485c-.55186-.5519-1.49117-.2863-1.648174.4782-.465915 2.2686-.77832 4.5932-.92588465 6.9624ZM4.21093 29.7054c-.16649.3738-.08169.8106.20765 1.1l64.77602 64.776c.2894.2894.7262.3742 1.1.2077 1.7861-.7956 3.5171-1.6927 5.1855-2.684.5521-.328.6373-1.0867.1832-1.5407L8.43566 24.3367c-.45409-.4541-1.21271-.3689-1.54074.1832-.99132 1.6684-1.88843 3.3994-2.68399 5.1855ZM12.6587 18.074c-.3701-.3701-.393-.9637-.0443-1.3541C21.7795 6.45931 35.1114 0 49.9519 0 77.5927 0 100 22.4073 100 50.0481c0 14.8405-6.4593 28.1724-16.7199 37.3375-.3903.3487-.984.3258-1.3542-.0443L12.6587 18.074Z" /></svg>

const TagForm = ({ mutate }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [namespace, setNamespace] = useState("");
  const [titleError, setTitleError] = useState(false);
  const [location, navigate] = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (title === "") {
      alert("title is required");
      return;
    }

    const response = await fetch("/api/tag", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        title: title, 
        description: description,
        ns: namespace 
      }),
    });
    if (!response.ok) {
      const msg = await response.text();
      if (response.status === 401) {  // unauthorized
        setErrorMessage(msg);
        setIsModalOpen(true);
      } else {
        alert(msg);
      }
    } else {
      setTitle("");
      setDescription("");
      setNamespace("");
      const tag = await response.json();
      navigate("/" + tag["id"] + "/" + tag["slug"]);
    }
  };

  const checkTitle = async (title, ns) => {
    setTitle(title);
    const url = new URLSearchParams("");
    url.append("title", title);
    if (ns !== undefined) {
      url.append("ns", ns);
    } else if (namespace) {
      url.append("ns", namespace);
    }

    const response = await fetch("/api/tag/exists?" + url.toString(), {
      credentials: "include",
    });
    const exists = await response.json();
    setSlug(exists.slug);
    setTitleError(exists.exists);
  };

  return (
    <form onSubmit={handleSubmit} className="text-black">
      <input
        type="text"
        placeholder="namespace (optional)"
        className="border-2 w-full dark:text-white dark:bg-[#181a1b]"
        value={namespace}
        onChange={(e) => {
          const newNamespace = e.target.value;
          setNamespace(newNamespace);
          if (title) checkTitle(title, newNamespace);
        }}
      />
      <input
        type="text"
        placeholder="tag title"
        className={`border-2 w-full dark:bg-[#181a1b] ${
          titleError 
            ? "text-red-500" 
            : dark_mode.value ? "text-white" : "text-black"
        }`}
        value={title}
        autoFocus={true}
        onChange={(e) => checkTitle(e.target.value)}
      />
      <div className="p-1 text-black bg-purple-200 dark:text-white dark:bg-purple-950">
        #{namespace && namespace + "/"}{slug}
      </div>
      <textarea
        type="textarea"
        placeholder="tag description"
        className="border-2 w-full dark:bg-[#181a1b]"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <input className="border-2 text-white" type="submit" value="New Tag"></input>
    </form>
  );
};

const TagButton = ({ mutate }) => {
  const [isCreating, setIsCreating] = useState(false);
  return (
    <>
      <Modal isOpen={isCreating} onClose={() => setIsCreating(false)}>
        <TagForm mutate={mutate} />
      </Modal>
      <div
        className="w-fit cursor-pointer m-1"
        onClick={(_) => setIsCreating(true)}
      >
        <div className="px-3 py-1 bg-purple-200 dark:bg-purple-950 hover:bg-purple-300 dark:hover:bg-purple-900 transition-colors">
          + New Tag
        </div>
      </div>
    </>
  );
};

export const SingleTag = ({ tagg }) => {
  const [location, navigate] = useLocation();

  return (
    <div
      onClick={() => {
        navigate("/" + tagg.id + "/" + tagg.slug);
      }}
      key={tagg.d}
      className={`text-black flex flex-row w-fit cursor-pointer bg-purple-200 dark:text-white dark:bg-purple-950 m-2`}
    >
      {tagg.domain_pk_namespace === "spotify.playlist" &&
        <img
          width="18"
          className="m-1"
          src="https://upload.wikimedia.org/wikipedia/commons/1/19/Spotify_logo_without_text.svg"></img>}
      {tagg.domain_pk_namespace === "linear.project" &&
        <LinearLogo />}
      {tagg.domain_pk_namespace === "reddit.sub" &&
        <RedditLogo />}
      {tagg.domain_pk_namespace === "youtube.liked" &&
        <img
          width="18"
          className="m-1"
          src="https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg"></img>}
      <span className="ml-1">#{tagg["slug"]}</span>
      {tagg.item_count != undefined && <span className="text-sm m-1 text-gray-400">
        {tagg.item_count}items{tagg.vote_count}votes
      </span>}
    </div>
  );
}

const fetcher = (arg) => fetch(arg).then((res) => res.json());
export const TagList = () => {
  const { data, error, isLoading, mutate } = useSWR("/api/tag", fetcher);
  const [location, navigate] = useLocation();
  const [search, setSearch] = useState("");

  if (isLoading) return <h1> loading... </h1>;
  if (error) return <h1> error </h1>;

  const sortedArray = data.public.sort(
    (a, b) => b.item_count + b.vote_count - (a.item_count + a.vote_count)
  );
  const filteredTags = sortedArray.filter((tagg) => {
    return tagg.slug.toLowerCase().includes(search.toLowerCase()) || tagg.ns?.toLowerCase().includes(search.toLowerCase());
  });

  const groups = [...new Set(filteredTags.map((tagg) => tagg.ns))]
  const tagsByGroup = groups.reduce((acc, group) => {
    acc[group] = filteredTags.filter((tagg) => tagg.ns === group)
    return acc
  }, {});
  // sort groups inplace
  groups.sort((a, b) =>
    tagsByGroup[b].reduce((acc, tagg) => acc + tagg.item_count + tagg.vote_count, 0)
    - tagsByGroup[a].reduce((acc, tagg) => acc + tagg.item_count + tagg.vote_count, 0))
  console.log(groups);

  // remvove nil from groups
  if (groups.includes(null)) {
    groups.splice(groups.indexOf(null), 1)
    groups.push(null)
  }

  return (
    <div className="flex flex-col">
      <div className="dark:text-white flex">
        <TagButton mutate={mutate} />
        <Spotify refreshFrontpage={mutate} />
        <Youtube />
        <Linear />
      </div>


      <input 
        className="w-full m-1 p-1 focus:outline-none dark:text-white dark:bg-[#181a1b]" 
        placeholder="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div
        className="w-fit cursor-pointer m-1"
        onClick={() => navigate("/namespace/tag-hierarchy")}
      >
        <div className="dark:text-white px-3 py-1 bg-purple-200 dark:bg-purple-950 hover:bg-purple-300 dark:hover:bg-purple-900 transition-colors">
          Vote on Tag Hierarchy
        </div>
      </div>
      <div className="dark:text-white flex flex-row flex-wrap">
        {groups.map((group) => {
          const tags = tagsByGroup[group]
          if (!tags || tags.length === 0) {
            return <></>
          }
          const body = tags.map((tagg) => {
            return <SingleTag tagg={tagg} />;
          });
          if (group === null) {
            return null;
          }
          return <div className="h-fit w-fit border border-dashed border-gray-200 dark:border-gray-600">
            <div className="flex m-1">{group}</div>
            {body}
          </div>
        })}
      </div>
      {tagsByGroup[null] && <div className="h-fit">{tagsByGroup[null].map(tag => <SingleTag tagg={tag} />)}</div>}
      {search === "" && data.private.length > 0 && (
        <div className="dark:text-white border border-dashed w-fit border-gray-200 dark:border-gray-600 ">
          <div className="flex m-1">
            private
          </div>
          {data.private.map((tagg) => {
            return <SingleTag tagg={tagg} />;
          })}
        </div>
      )}
      {search === "" && data.unlisted.length > 0 && (
        <div className="dark:text-white border border-dashed w-fit border-gray-200 dark:border-gray-600 ">
          <div className="flex m-1">
            unlisted that you own
          </div>
          {data.unlisted.map((tagg) => {
            return <SingleTag tagg={tagg} />;
          })}
        </div>
      )}
      {data.namespaces && (
        <div className="dark:text-white border border-dashed w-fit border-gray-200 dark:border-gray-600 mb-4">
          <div className="flex m-1">items by namespace</div>
          <div className="flex flex-wrap">
            {Object.entries(data.namespaces).map(([_, {domain_pk_namespace, count}]) => {
              if (domain_pk_namespace === null) {
                return null;
              } else {
                return <div
                  key={domain_pk_namespace}
                  onClick={() => navigate(`/namespace/${domain_pk_namespace}`)}
                  className="cursor-pointer m-2 px-3 py-1 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700"
              >
                  {domain_pk_namespace} ({count} items)
                </div>
              }
            })}
          </div>
        </div>
      )}
    </div>
  );
};
