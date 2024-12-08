import React, { useEffect, useState } from "react";
import useSWR from "swr";
import { SingleTag, TagList } from "./TagList";
import { Tag, tag } from "./App";
import { loadTag } from "./Network";

const CLIENT_ID = "cGJ1ZnVHcTY1cGJmcHhLTUt6SEk6MTpjaQ"

const redirect_uri = (window.location.hostname === "localhost") ?
    "http://localhost:3000/api/twitter/callback" :
    "https://sorter.isnt.online/api/twitter/callback";


const oauth2_url = "https://twitter.com/i/oauth2/authorize?client_id=" + CLIENT_ID +
    "&redirect_uri=" + encodeURIComponent(redirect_uri) +
    "&response_type=code" +
    "&scope=tweet.read%20users.read%20like.read" +
    "&state=state" +
    "&code_challenge=challenge" +
    "&code_challenge_method=plain";

const LikedTweets = () => {
    const [data, setData] = useState({});
    const [selected, setSelected] = useState(new Set());

    useEffect(() => {
        fetch("/api/twitter/liked")
            .then((res) => res.json())
            .then((data) => setData(data));
    }, [])

    if (data.error) {
        return <h1>{data.error}, come back later</h1>
    }

    if (data.done) {
        return <h1>imported!</h1>
    }

    if (!data.data) {
        return <h1>loading...</h1>;
    }


    const authors = {};
    data.includes.users.forEach((user) => {
        authors[user.id] = user;
    });

    const toggleItem = (id) => {
        const newSelected = new Set(selected);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelected(newSelected);
    }

    const importSelected = async () => {
        const tweet_ids = Array.from(selected);
        const tweets = data.data
            .filter((tweet) => tweet_ids.includes(tweet.id))
            .map(tweet => {
                const author = authors[tweet.author_id];
                tweet.author = author;
                return tweet;
            });
        const res = await fetch("/api/twitter/import", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ tweets }),
        });

        if (res.status === 200) {
            setSelected(new Set());
            setData({ done: true });
            console.log('imported tweets, reloading');
            loadTag(undefined);
        }
    }

    return <table>
        <tbody>
            {data.data && data.data.map((tweet) => {
                return <tr className="text-left border roudned-sm hover:bg-gray-100 cursor-pointer" key={tweet.id}
                    onClick={() => toggleItem(tweet.id)}>

                    <td><input type="checkbox"
                        checked={selected.has(tweet.id)}
                    ></input></td>
                    <td><img src={authors[tweet.author_id].profile_image_url}></img></td>
                    <td>@{authors[tweet.author_id].username}</td>
                    <td>{tweet.text}</td>
                </tr>
            })}

        </tbody>
        <div className="m-4">
            <button onClick={importSelected} className="border-2 bigbutton w-fit">import {selected.size} selected xeets</button>
        </div>
    </table>
};

export const Twitter = () => {

    const [showLiked, setShowLiked] = useState(false);
    const { data, error, isLoading } = useSWR("/api/twitter/page", (url) => fetch(url).then((res) => res.json()), {
        revalidateOnFocus: false,
        revalidateIfStale: false,
        revalidateOnReconnect: false
    });

    if (isLoading) return <h1>loading...</h1>;
    if (error) return <h1>error</h1>;
    if (!data) return <h1>no data</h1>;
    if (!tag.value) {
        tag.value = data.tag;
    }


    return <div>
        {data.other_tags && data.other_tags.map((tag) => {
            return <SingleTag tagg={tag} key={tag.id} />
        })}
        <a className="border-2 bigbutton w-fit" href={oauth2_url}>
            log in with x
        </a>
        <br />

        <button className="border-2 bigbutton w-fit" onClick={() => setShowLiked(true)}>
            get liked xeets
        </button>

        {showLiked && <LikedTweets />}
        {tag.value && <Tag showVote={true} />}
    </div>;
};