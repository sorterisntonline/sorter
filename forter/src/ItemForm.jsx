import { useState } from "react";
import { selected_item, tag } from "./App";
import { makeRequest } from "./Network";

import { editing_item } from "./ItemPanel";

export const ItemForm = () => {
  const item = editing_item.value;
  const isEditing = item["id"] !== undefined;

  const [title, setTitle] = useState(item["title"] || "");
  const [url, setUrl] = useState(item["url"] || "");
  const [body, setBody] = useState(item["body"] || "");
  const [image, setImage] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (title === "") {
      alert("title is required");
      return;
    }
    setTitle("");
    setBody("");
    setUrl("");

    const data = {
      title: title,
      url: url,
      body: body,
      tags_id: tag.value["tags/id"],
      "id": isEditing ? item["id"] : undefined,
    };

    if (image) {
      data.domain_pk_namespace = "IMG";
    }

    data.tag_id = tag.value.tag.id;

    await makeRequest("POST", "/api/item", data);

    if (isEditing) {
      editing_item.value = false;
    }

    const freshItem = [...tag.value.unsorted, ...tag.value.sorted]
      .filter((x) => x["id"] === item["id"])
      .at(0);

    if (freshItem) {
      selected_item.value = freshItem;
    } else {
      selected_item.value = false;
    }
  };

  const handleTitleChange = (event) => setTitle(event.target.value);

  const handleUrlChange = (event) => setUrl(event.target.value);

  const handleBodyChange = (event) => setBody(event.target.value);

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          className="w-full text-lg bg-slate-200 dark:bg-gray-900"
          type="text"
          placeholder="title"
          value={title}
          onChange={handleTitleChange}
        />
        <br />
        <div className="flex flex-cols">
          <input
            className="w-full bg-slate-200 dark:bg-gray-900"
            type="url"
            placeholder="url (optional)"
            required={false}
            value={url}
            onChange={handleUrlChange}
          />
          <label className="flex flex-row">
            image?
            <input
              checked={image}
              onChange={(e) => setImage(e.target.checked)}
              type="checkbox"
            />
          </label>
        </div>
        <textarea
          className="w-full bg-slate-200 dark:bg-gray-900"
          type="text"
          placeholder="body (optional)"
          value={body}
          onChange={handleBodyChange}
        />
        <br />
        {image && <img src={url} />}
        <input
          className="border-2 cursor-pointer"
          type="submit"
          value={isEditing ? "Update Item" : "New item"}
        />
        <button
          className="border-2 cursor-pointer bg-red-600"
          onClick={() => (editing_item.value = false)}
        >
          {" "}
          cancel{" "}
        </button>
      </form>
    </div>
  );
};
