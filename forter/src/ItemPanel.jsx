import useSWR from "swr";
import { current_session } from "./session";
import { loadTag, makeRequest } from "./Network";
import { signal } from "@preact/signals-react";
import MarkdownRenderer from "./MarkdownRenderer";
import { motion, AnimatePresence } from 'framer-motion';
import { Item } from "./components/Item";
const createEmbedUrl = (item) => {
  const [code, time] = item["domain_pk"].split("?t=")

  if (time === undefined) {
    return "https://www.youtube.com/embed/" + code;
  } else {
    return "https://www.youtube.com/embed/" + code + "?start=" + time;
  }
}

const shortenString = (str, maxLen) => {
  if (str.length > maxLen) {
    return str.substring(0, maxLen - 3) + "...";
  }
  return str;
};

const TikTokEmbed = ({ item }) => {
  const id = "tiktokembed" + item.domain_pk;
  useEffect(() => {
    console.log('loading tiktok embed');
    const oldscript = document.getElementById(id + 'script');
    if (oldscript) {
      oldscript.remove();
    }
    const script = document.createElement("script");
    script.src = "https://www.tiktok.com/embed.js";
    script.async = true;
    script.id = id + 'script';
    document.getElementById(id).appendChild(script);

    return () => {
      const oldscript = document.getElementById(id + 'script');
      if (oldscript) {
        console.log('removing tiktok embed');
        oldscript.remove();
      }
    }
  });

  return <div key={id} id={id}>
    <blockquote class="tiktok-embed" cite={item.url}
      data-video-id={item.domain_pk} style={{ maxWidth: "605px", minWidth: "325px" }}>
      <section>
        <a target="_blank" title="@curlyfuq" href="https://www.tiktok.com/@curlyfuq?refer=embed">@curlyfuq</a>
      </section>
    </blockquote>
  </div >
}

import { items_by_id, magnitude, tag } from "./App";
export const pinned_left = signal(false);
export const pinned_right = signal(false);

export const ItemFull = ({ item, right, skipped, mutate }) => {
  right = right || false;
  skipped = skipped || false;

  const pinLeft = () => {
    pinned_left.value = pinned_left.value === item.id ? false : item.id;
  };

  const pinRight = () => {
    pinned_right.value = pinned_right.value === item.id ? false : item.id;
  };

  const toggleSkip = async () => {
    await makeRequest("POST", "/api/item/skip", {
      "item_id": item["id"]
    })
    mutate();
  }

  return (
    <div className={"page-padding-top flex flex-col w-full " + (right ? "text-right" : "text-left")}>
      <a className="cursor-pointer" href={"/" + tag.value.tag.id + '/' + tag.value.tag.slug + '?item=' + item.id} target="_blank">
        {
          item["title"] && (
            <h1 className="text-3xl">{item["title"]}</h1>
          )
        }
      </a>
      {
        !tag.value.tag.hide_item_authors && <div className="text-blue-400">@{item["owner"]}</div>
      }
      {
        item["url"] && (
          <div>
            <div className="text-sm text-blue-700 underline">
              <a target="_blank" href={item["url"]}>
                {shortenString(item["url"], 70)}
              </a>
            </div>
          </div>
        )
      }
      {
        item["body"] && (
          <div className="markdown-body">
            <MarkdownRenderer content={item["body"]} />
          </div>
        )
      }
      {
        (item["domain_pk_namespace"] === "IMG" || item["domain_pk_namespace"] === "reddit.post") && item["url"] && (
          <img className="object-cover" style={{ maxHeight: '100%' }} src={item["url"]} />
        )
      }
      {
        item["domain_pk_namespace"] === "spotify.track" && (
          <div className={"flex " + (right ? "justify-end" : "")} >
            <iframe
              src={`https://open.spotify.com/embed/track/${item["domain_pk"]}`}
              width="300"
              height="380"
              allowtransparency="true"
              allow="encrypted-media"
            ></iframe>
          </div>
        )
      }
      {
        item["domain_pk_namespace"] === "youtube.video" && (
          <iframe
            width="100%" height="500px"
            className="page-padding-top"
            src={createEmbedUrl(item)}>
          </iframe>
        )
      }
      {
        item["domain_pk_namespace"] === "tiktok.video" && (
          <TikTokEmbed item={item} />
        )
      }
      {
        item["domain_pk_namespace"] === "x.xeet" && (
          <div>
            <Tweet tweetId={item["domain_pk"]} />
          </div>
        )
      }
      <div>
        <div>
          <button onClick={pinLeft} className="border-2 bigbutton w-fit">
            {pinned_left.value === item.id ? "📍 unpin left" : "📌 pin left"}
          </button>
          <button onClick={pinRight} className="border-2 bigbutton w-fit">
            {pinned_right.value === item.id ? "📍 unpin right" : "📌 pin right"}
          </button>
          {!skipped &&
            <button onClick={toggleSkip} className="border-2 bigbutton w-fit">
              skip
            </button>}
        </div>
      </div>
    </div >
  );
};

import { selected_item, toggle } from "./App";
import { ItemForm } from "./ItemForm";
import { Feed } from "./Feed";
import { useEffect, useRef, useState } from "react";
import { VotesPanel } from "./VotesPanel";
import { Comments } from "./Comments";
import { useLocation } from "wouter";
import { selected_attribute } from "./AttributePanel";
import { Tweet } from "react-twitter-widgets";
import { useSearch } from "wouter/use-location";

export const editing_item = signal(false);

const fetcher = (arg) => fetch(arg).then((res) => res.json());
export const ItemPanel = () => {
  const item = selected_item.value;

  const showPinnedLeft = () => {
    if (pinned_left.value) {
      const pinnedItem = items_by_id.value[pinned_left.value];
      if (pinnedItem) {
        selected_item.value = pinnedItem;
      }
    }
  };

  const showPinnedRight = () => {
    if (pinned_right.value) {
      const pinnedItem = items_by_id.value[pinned_right.value];
      if (pinnedItem) {
        selected_item.value = pinnedItem;
      }
    }
  };

  const { data, error, isLoading, mutate } = useSWR(
    "/api/item/membership?item_id=" + (item["id"] ?? -1),
    fetcher
  );

  const [location, setLocation] = useLocation();

  const [isAddingToAnotherTag, setIsAddingToAnotherTag] = useState(false);

  const isMobileDevice = () => window.innerWidth < 1024; // 1024px is the 'lg' breakpoint in Tailwind

  if (isLoading) return <h1> loading... </h1>;
  if (error) return <h1> error </h1>;
  if (!item && !editing_item.value) return <Feed />;

  const { membership, skips } = data;

  const isOwnedByUser = current_session.value.user_name === item["owner"];
  const onRemoveTag = async (tagid) => {
    //selected_item.value = false;
    await makeRequest("DELETE", "/api/item/membership", {
      "item_id": item["id"],
      "tag_id": tagid,
    });
    mutate();
  };

  const unskip = async () => {
    await makeRequest("DELETE", "/api/item/skip", {
      "item_id": item["id"],
    })
    mutate();
  }

  const editItem = () => {
    editing_item.value = item;
  }

  const attrid = selected_attribute.value.value.id;

  const filteredVotes = tag.value.votes.filter(v => (v.attribute === attrid) && (v.left_item_id === item.id || v.right_item_id === item.id)).map(v => {
    console.log(v);
    if (v.left_item_id === item.id) {
      return v;
    } else {
      const replacement = {
        ...v,
        left_item_id: v.right_item_id,
        right_item_id: v.left_item_id,
        magnitude: 100 - v.magnitude
      };
      return replacement;
    }
  })

  const notEditing = <>
    <ItemFull item={item} skipped={skips.length > 0} mutate={mutate} />
  </>

  const showMoreActions = skips?.length > 0 || isOwnedByUser;

  // Desktop version - no animation
  if (!isMobileDevice()) {
    return (
      <div className="">
        <div className="flex justify-between mb-4">
          <button 
            onClick={showPinnedLeft} 
            className={`border-2 bigbutton ${!pinned_left.value && 'opacity-50'}`}
            disabled={!pinned_left.value}
          >
            📍 Left Pin
          </button>
          <button 
            onClick={showPinnedRight}
            className={`border-2 bigbutton ${!pinned_right.value && 'opacity-50'}`}
            disabled={!pinned_right.value}
          >
            📍 Right Pin
          </button>
        </div>
        {editing_item.value ? <ItemForm /> : notEditing}
        <br />
        <table>
          <tbody className="text-left">
            {showMoreActions &&
              <tr>
                <td className="flex flex-row">
                  {isOwnedByUser && <div className="cursor-pointer border-2 bigbutton" onClick={editItem}>edit item</div>}
                  {skips?.length > 0 && <div className="cursor-pointer border-2 bigbutton" onClick={unskip}>unskip</div>}
                </td>
              </tr>}
            <tr>
              <td>
                {membership?.map((tag) => (
                  <div className="bg-purple-200 text-black dark:text-white dark:bg-purple-950 m-1 cursor-pointer"
                    key={tag["id"]}
                    onClick={() => {
                      setLocation('/' + tag.id + '/' + tag.slug)
                      loadTag(tag.id);
                    }}>
                    <td>#{tag["slug"]}</td>
                    {isOwnedByUser && (
                      <td>
                        <button
                          className="border-2 bigbutton text-red-600 border-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveTag(tag["tag_id"])
                          }}>
                          remove
                        </button>
                      </td>
                    )}
                  </div>
                ))}
              </td>
            </tr>
            <div className="cursor-pointer" onClick={() => setIsAddingToAnotherTag(true)}>
              {!isAddingToAnotherTag && <div className="border-2 bigbutton">add to another tag</div>}
              {isAddingToAnotherTag && <OtherTagInput mutate={mutate} close={() => setIsAddingToAnotherTag(false)} />}
            </div>
          </tbody>
        </table>
        {!toggle.value &&
          <VotesPanel votes={filteredVotes} />}
        {item.id && <Comments coord={"item:" + item.id} />}
      </div>
    );
  }

  // Mobile version - with animation
  return (
    <AnimatePresence mode="wait">
      {(item || editing_item.value) && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className=""
        >
          <div className="flex justify-between mb-4">
            <button 
              onClick={showPinnedLeft} 
              className={`border-2 bigbutton ${!pinned_left.value && 'opacity-50'}`}
              disabled={!pinned_left.value}
            >
              📍 Left Pin
            </button>
            <button 
              onClick={showPinnedRight}
              className={`border-2 bigbutton ${!pinned_right.value && 'opacity-50'}`}
              disabled={!pinned_right.value}
            >
              📍 Right Pin
            </button>
          </div>
          {editing_item.value ? <ItemForm /> : notEditing}
          <br />
          <table>
            <tbody className="text-left">
              {showMoreActions &&
                <tr>
                  <td className="flex flex-row">
                    {isOwnedByUser && <div className="cursor-pointer border-2 bigbutton" onClick={editItem}>edit item</div>}
                    {skips?.length > 0 && <div className="cursor-pointer border-2 bigbutton" onClick={unskip}>unskip</div>}
                  </td>
                </tr>}
              <tr>
                <td>
                  {membership?.map((tag) => (
                    <div className="bg-purple-200 text-black dark:text-white dark:bg-purple-950 m-1 cursor-pointer"
                      key={tag["id"]}
                      onClick={() => {
                        setLocation('/' + tag.id + '/' + tag.slug)
                        loadTag(tag.id);
                      }}>
                      <td>#{tag["slug"]}</td>
                      {isOwnedByUser && (
                        <td>
                          <button
                            className="border-2 bigbutton text-red-600 border-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveTag(tag["tag_id"])
                            }}>
                            remove
                          </button>
                        </td>
                      )}
                    </div>
                  ))}
                </td>
              </tr>
              <div className="cursor-pointer" onClick={() => setIsAddingToAnotherTag(true)}>
                {!isAddingToAnotherTag && <div className="border-2 bigbutton">add to another tag</div>}
                {isAddingToAnotherTag && <OtherTagInput mutate={mutate} close={() => setIsAddingToAnotherTag(false)} />}
              </div>
            </tbody>
          </table>
          {!toggle.value &&
            <VotesPanel votes={filteredVotes} />}
          {item.id && <Comments coord={"item:" + item.id} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const OtherTagInput = ({ mutate, close }) => {
  const [tagSlug, setTagSlug] = useState("");
  const { data, error, isLoading } = useSWR("/api/tag", fetcher);

  const completion = data?.public.filter(t => t.slug.startsWith(tagSlug));
  if (completion) completion.sort((a, b) => a.slug.length - b.slug.length);


  const onInput = async (e) => {
    setTagSlug(e.target.value);
    if (e.keyCode === 13 && completion.length > 0) {
      const tag = completion[0];
      try {
        await makeRequest("POST", "/api/item/membership", {
          "item_id": selected_item.value["id"],
          "tag_id": tag.id,
        });
        setTagSlug("");
        mutate();
        close();
      } catch (error) {
        if (error.status === 401) {  // unauthorized
          setErrorMessage(error.message);
          setIsModalOpen(true);
        }
      }
    }
  }

  return <div>
    {tagSlug !== "" && <div className="bg-purple-200 text-black dark:bg-purple-950 dark:text-white">
      #{completion && completion.length > 0 && completion[0].slug}
    </div>}
    <input autoFocus
      className="dark:bg-black dark:text-white bg-white text-black"
      value={tagSlug}
      onKeyDown={onInput}
      onChange={(e) => setTagSlug(e.target.value)}
    >
    </input>

  </div>
}