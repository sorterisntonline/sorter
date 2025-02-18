import { useState } from "react";
import { useLocation } from "wouter";
import { dark_mode } from "./utils/themeUtils";

export const TagForm = ({ mutate, onClose }) => {
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
      if (onClose) onClose();
      if (mutate) mutate();
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
        className="border-2 w-full dark:bg-[#181a1b] text-black dark:text-white"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <input className="border-2 text-white" type="submit" value="New Tag"></input>
    </form>
  );
}; 