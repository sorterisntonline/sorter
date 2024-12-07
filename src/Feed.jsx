import useSWR from "swr";
import { tag } from "./App";
import { useState } from "react";
import { Vote } from "./Vote";
import { useLocation } from "wouter";

export const VoteBatch = ({ batch, collapsed, setCollapsed }) => {
    const title = batch.owner == "" ? batch.children.length + " votes" : "@" + batch.owner + " voted " + batch.children.length + " times...";
    if (collapsed) {
        return <div className="text-gray-500">
            <h1 className="text-lg cursor-pointer"
                onClick={() => setCollapsed(!collapsed)}>{title}</h1>
        </div>
    }

    return <div className="border border-dashed" >
        <h1 className="text-lg cursor-pointer" onClick={() => setCollapsed(!collapsed)}>votes</h1>
        <div className="text-left">
            {batch.children.map((vote) => {
                console.log(vote)
                return <Vote key={vote["votes/id"]} vote={vote} showDelete={false} />
            })}
        </div>
    </div>
};

export const ItemBatch = ({ batch, collapsed, setCollapsed, tagInfo }) => {
    const title = batch.owner == "" ? batch.children.length + " items" : "@" + batch.owner + " added " + batch.children.length + " items...";
    const [location, setLocation] = useLocation();
    if (collapsed) {
        return <div className="text-gray-500">
            <h1 className="text-lg cursor-pointer"
                onClick={() => setCollapsed(!collapsed)}>{title}</h1>
        </div>
    }

    return <div className="" >
        <h1 className="text-lg cursor-pointer" onClick={() => setCollapsed(!collapsed)}>items</h1>
        <div className="text-left">
            {batch.children.map((item) => {
                return <div className="cursor-pointer border-b border-dashed border-blue-950" key={item["id"]}
                    onClick={() => setLocation('/' + tagInfo[1] + '/' + tagInfo[2] + '?item=' + item["id"])}>{item["title"]}</div>
            }
            )}
        </div>
    </div>
};

const fetcher = (url) => fetch(url).then((res) => res.json());
export const Feed = () => {
    const { data, error, isLoading, mutate } = useSWR("/api/feed?tag_id=" + tag.value.tag["id"], fetcher);

    const [collapsedIdx, setCollapsedIdx] = useState(-1);

    if (isLoading) return <h1>loading...</h1>;
    if (error) return <h1>error</h1>;

    const batches = []

    var i = 0;
    var person = "EMPTY";
    var typ = "EMPTY";
    var curBatch = []
    while (i < data.length) {
        var item = data[i];
        var newtyp = item.type;
        var newperson = item["owner"];

        if (newtyp === typ && newperson === person) {
            curBatch.push(item);
        } else {
            batches.push({ type: typ, owner: person, children: curBatch });

            curBatch = [item];
            typ = newtyp;
            person = newperson;
        }
        i++;
    }
    batches.push({ type: typ, owner: person, children: curBatch });
    batches.shift(); // remove first empty batch


    return <div>
        <h1 className="text-xl">log</h1>
        <div className="text-left">
            {batches.map((batch, i) => {
                if (batch.type === "Vote") {
                    return <VoteBatch batch={batch}
                        collapsed={collapsedIdx !== i}
                        setCollapsed={() => i === collapsedIdx ? setCollapsedIdx(-1) : setCollapsedIdx(i)} />
                } else if (batch.type === "Item") {
                    return <ItemBatch batch={batch}
                        collapsed={collapsedIdx !== i}
                        setCollapsed={() => i === collapsedIdx ? setCollapsedIdx(-1) : setCollapsedIdx(i)} />
                } else return <div>ERROR</div>
            })}
        </div>
    </div>;
};
