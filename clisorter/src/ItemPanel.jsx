import useSWR from "swr";
import { current_session } from "./LoginForm";
import { useStore } from "./Cli";

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

export const ItemFull = ({ item, right, skipped, mutate }) => {
  right = right || false;
  skipped = skipped || false;

  const { setPinnedLeft, setPinnedRight } = useStore();

  const toggleSkip = async () => {
    await makeRequest("POST", "/api/item/skip", {
      "item_id": item["id"]
    })
    mutate();
  }

  return (
    <div className={"p-3 flex flex-col w-full " + (right ? "text-right" : "text-left")}>
      <a className="cursor-pointer" target="_blank">
        {
          item["title"] && (
            <h1 className="text-3xl">{item["title"]}</h1>
          )
        }
      </a>
      {
        <div className="text-blue-400">@{item["owner"]}</div>
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
          <div>
            <div className="whitespace-pre-line text-left bg-gray-300 dark:bg-gray-900 text-sm">{item["body"]}</div>
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
            className="p-3"
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
        {!skipped &&
          <button onClick={toggleSkip} className="border-2 bigbutton w-fit">
            skip
          </button>}
      </div>
    </div >
  );
};

import { Feed } from "./Feed";
import { useEffect, useState } from "react";
import { Comments } from "./Comments";
import { useLocation } from "wouter";
import { Tweet } from "react-twitter-widgets";

const fetcher = (arg) => fetch(arg).then((res) => res.json());
export const ItemPanel = ({ item }) => {
  const { setPinnedLeft, setPinnedRight } = useStore();

  const { data, error, isLoading, mutate } = useSWR(
    "/api/item/membership?item_id=" + (item["id"] ?? -1),
    fetcher
  );

  const [location, setLocation] = useLocation();

  const [isAddingToAnotherTag, setIsAddingToAnotherTag] = useState(false);

  if (isLoading) return <h1> loading... </h1>;
  if (error) return <h1> error </h1>;

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


  const notEditing = <>
    <ItemFull item={item} skipped={skips.length > 0} mutate={mutate} />
  </>

  const showMoreActions = skips?.length > 0 || isOwnedByUser;

  const showPinnedLeft = () => {
    setPinnedLeft(item);
  };

  const showPinnedRight = () => {
    setPinnedRight(item);
  };

  return (
    <div className="">
      <div className="flex justify-between mb-4">
        <button 
          onClick={showPinnedLeft} 
          className="border-2 bigbutton"
        >
          📍 Left Pin
        </button>
        <button 
          onClick={showPinnedRight}
          className="border-2 bigbutton"
        >
          📍 Right Pin
        </button>
      </div>
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
      {item.id && <Comments coord={"item:" + item.id} />}
    </div>
  );
};

const OtherTagInput = ({ mutate, close }) => {
  const [tagSlug, setTagSlug] = useState("");
  const { data, error, isLoading } = useSWR("/api/tag", fetcher);

  const completion = data?.public.filter(t => t.slug.startsWith(tagSlug));
  if (completion) completion.sort((a, b) => a.slug.length - b.slug.length);


  const onInput = async (e) => {
    // if enter key pressed
    setTagSlug(e.target.value);
    console.log(e.keyCode)
    if (e.keyCode === 13 && completion.length > 0) {
      console.log('enter key pressed');
      const tag = completion[0];
      await makeRequest("POST", "/api/item/membership", {
        "item_id": selected_item.value["id"],
        "tag_id": tag.id,
      });
      setTagSlug("");
      mutate();
      close();
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