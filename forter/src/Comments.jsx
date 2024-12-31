import { useState } from "react";
import useSWR from "swr";
import { current_session } from "./session";

const fetcher = (url) => fetch(url).then((res) => res.json());

const ReplyBox = ({ coord, mutate, parent_id, onSubmit }) => {
    const [comment, setComment] = useState("");
    const onkeyDown = (e) => {
        if (e.keyCode === 13 && (e.ctrlKey || e.metaKey)) {
            submit();
        }
    }
    const submit = async () => {
        console.log('submit');
        const b = await fetch("/api/comments", {
            method: "POST",
            body: JSON.stringify({
                coord: coord,
                body: comment,
                parent_id: parent_id
            }),
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (b.ok) {
            setComment("");
            mutate();
            if (onSubmit) {
                onSubmit();
            }
        }
    }

    return <div class={"flex flex-col " + (parent_id ? "ml-10" : "")}>
        <textarea class="w-full h-24 bg-white dark:bg-black border-2 border-gray-400"
            value={comment}
            onKeyDown={onkeyDown}
            placeholder="Write your comment here.."
            onChange={(e) => setComment(e.target.value)}>

        </textarea>
        <div class="cursor-pointer text-right"
            onClick={submit}
        >
            [submit]
        </div>
    </div>
}


const Comment = ({ padding, coord, comment, mutate }) => {
    const [hovered, setHovered] = useState(false);
    const [replying, setReplying] = useState(false);

    const onDelete = async () => {
        await fetch("/api/comments", {
            method: "DELETE",
            body: JSON.stringify({
                id: comment.id
            }),
            headers: {
                "Content-Type": "application/json",
            },
        });
        mutate();
    }

    return (
        <div className={"" + (padding ? "ml-3" : "")} >
            <div class={`text-left my-2 bg-slate-300 dark:bg-gray-900 whitespace-pre-line w-100`}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            >
                <span class="text-blue-500">@{comment.owner}:</span>
                {comment.body}
                {hovered && <span class="cursor-pointer">
                    <span onClick={() => setReplying(true)}>[reply]</span>
                    {comment.owner === current_session.value.user_name &&
                        <span class="text-red-500" onClick={onDelete}>[delete]</span>}
                </span>}

            </div>
            {replying && <ReplyBox className="ml-10" coord={coord} mutate={mutate} parent_id={comment.id} onSubmit={() => setReplying(false)} />}
            {
                comment.children.map((child) => {
                    return <Comment padding={true} coord={coord} comment={child} mutate={mutate} />
                })
            }
        </div >
    );
}

export const Comments = ({ coord }) => {
    const { data, error, isLoading, mutate } = useSWR("/api/comments?coord=" + coord, fetcher);
    if (isLoading) return <h1>loading...</h1>;
    if (error) return <h1>error</h1>;
    if (!data) return <h1>no data</h1>;

    console.log(data);
    const comments_by_id = {};
    data.forEach((comment) => {
        comment.children = [];
        comments_by_id[comment.id] = comment;
    });
    data.forEach((comment) => {
        if (comment.parent_id) {
            comments_by_id[comment.parent_id].children.push(comment);
        } else {
            comment.children = [];
        }
    });

    const parentComments = data.filter((comment) => !comment.parent_id);


    return <div class="my-4">
        <ReplyBox coord={coord} mutate={mutate} parent_id={null} />
        <div class="w-full">
            {data && parentComments.map((comment) => {
                return <Comment coord={coord} comment={comment} mutate={mutate} />
            })}
        </div>
    </div >;
};
