import React, { useEffect, useState } from "react";
import useSWR from "swr";
import { ItemBatch, VoteBatch } from "./Feed";
import { Vote } from "./Vote";
import { useLocation } from "wouter";

const fetcher = (arg) => fetch(arg).then((res) => res.json());

const FrontpageFeedDay = ({ day, onDataLoaded }) => {
    const { data, error, isLoading } = useSWR("/api/frontpage?day=" + day, fetcher);
    const [collapsedIdx, setCollapsedIdx] = useState(-1);
    const [location, setLocation] = useLocation();

    useEffect(() => {
        if (data) {
            const totalItems = (data.votes || []).length +
                (data.items || []).length +
                (data.comments || []).length;
            onDataLoaded(totalItems);
        }
    }, [data]);

    if (isLoading) return <h1> loading... </h1>;
    if (error) return <h1> error </h1>;

    const { votes, items, comments } = data;
    const user_tag_to_vote = {};
    const user_tag_to_vote_info = {}
    for (let vote of votes) {
        const idx = "@" + vote.owner + " voted on " + vote.title;
        const existing = user_tag_to_vote[idx] || [];
        user_tag_to_vote[idx] = [...existing, vote];
        user_tag_to_vote_info[idx] = [vote.owner, vote.tag_id, vote.tag_slug, vote.title];
    }

    const user_tag_to_item = {};
    const user_tag_to_item_info = {}
    for (let item of items) {
        const idx = "@" + item.owner + " added items to tag " + item.tag_title;
        const existing = user_tag_to_item[idx] || [];
        user_tag_to_item[idx] = [...existing, item];
        user_tag_to_item_info[idx] = [item.owner, item.tag_id, item.tag_slug, item.tag_title];
    }

    return (
        <div className="dark:text-white">
            <div className="text-gray-500">{data.date}</div>
            {
                Object.keys(user_tag_to_vote).map((key) => {
                    const val = user_tag_to_vote[key];
                    const info = user_tag_to_vote_info[key];
                    return (
                        <div className="p-1 w-full flex">
                            <div className="px-3 text-left">
                                <span className="text-blue-500">@{info[0]}</span>{" "}
                                <span className="text-yellow-500">voted</span> on <span
                                    className="cursor-pointer text-black bg-purple-200 dark:text-white dark:bg-purple-950"
                                    onClick={() => setLocation("/" + info[1] + "/" + info[2])}
                                >#{info[2]}</span>
                            </div>
                            <div>
                                <VoteBatch key={key}
                                    batch={{ owner: "", children: val }}
                                    collapsed={collapsedIdx !== key}
                                    setCollapsed={() => setCollapsedIdx(collapsedIdx === key ? -1 : key)}
                                />
                            </div>
                        </div>
                    );
                })
            }
            {
                Object.keys(user_tag_to_item).map((key) => {
                    const val = user_tag_to_item[key];
                    const info = user_tag_to_item_info[key];
                    return (
                        <div className="p-1 w-full flex">
                            <div className="px-3 text-left">
                                <span className="text-blue-500">@{info[0]}</span>{" "}
                                added items to <span
                                    className="cursor-pointer bg-purple-200 text-black dark:text-white dark:bg-purple-950"
                                    onClick={() => setLocation("/" + info[1] + "/" + info[2])}
                                >#{info[2]}</span>
                            </div>
                            <div>
                                <ItemBatch key={key}
                                    batch={{ owner: "", children: val }}
                                    collapsed={false}
                                    setCollapsed={() => true}
                                    tagInfo={info}
                                />
                            </div>
                        </div>
                    );
                })
            }
            {
                comments.map((comment) => {
                    return (
                        <div className="p-1 w-full px-3 text-left flex">
                            <div>
                                <span className="text-blue-500">@{comment.owner}</span>{" "}
                                <span className="">commented</span> on
                                <span className="border-b border-dashed cursor-pointer"
                                    onClick={() => setLocation("/" + comment.tag_id + "/" + comment.tag_slug + "?item=" + comment.item_id)}>
                                    {" "}{comment.item_title}</span> {" "} in {" "}
                                <span
                                    className="cursor-pointer text-black bg-purple-200 dark:text-white dark:bg-purple-950"
                                    onClick={() => setLocation("/" + comment.tag_id + "/" + comment.tag_slug)}
                                >#{comment.tag_slug}</span>
                            </div>
                            <div className="mx-3 text-left bg-slate-300 dark:bg-gray-900">
                                {comment.body}
                            </div>
                        </div>
                    );
                })
            }
        </div>
    );
};

export const FrontpageFeed = () => {
    const [totalItems, setTotalItems] = useState(0);
    const [days, setDays] = useState([0]);
    const [reachedEnd, setReachedEnd] = useState(false);
    const [consecutiveZeros, setConsecutiveZeros] = useState(0);
    const ITEM_LIMIT = 10;
    const MAX_CONSECUTIVE_ZEROS = 100;

    const handleDataLoaded = (newItems) => {
        setTotalItems(prev => prev + newItems);

        if (newItems === 0) {
            setConsecutiveZeros(prev => prev + 1);
        } else {
            setConsecutiveZeros(0);
        }
    };

    useEffect(() => {
        // Check if we should stop fetching
        if (consecutiveZeros >= MAX_CONSECUTIVE_ZEROS) {
            setReachedEnd(true);
            return;
        }

        // If we haven't reached the limit and haven't hit the end, add another day
        if (totalItems < ITEM_LIMIT && !reachedEnd) {
            setDays(prev => [...prev, prev.length]);
        }
    }, [totalItems, consecutiveZeros]);

    const addDay = () => setDays(prev => [...prev, prev.length]);

    return (
        <div className="pt-4 w-full max-w-full overflow-x-hidden">
            {days.map((day) => (
                <FrontpageFeedDay
                    key={day}
                    day={day}
                    onDataLoaded={handleDataLoaded}
                />
            ))}
            {totalItems < ITEM_LIMIT && !reachedEnd && (
                <div className="text-center text-gray-500 dark:text-gray-400">
                    Loading more items...
                </div>
            )}
            {reachedEnd && totalItems < ITEM_LIMIT && (
                <div className="text-center text-gray-500 dark:text-gray-400">
                    No more items available
                </div>
            )}
            <button className="border-2 border-gray-500 dark:text-white"
                onClick={addDay}>load more</button>
        </div>
    );
};