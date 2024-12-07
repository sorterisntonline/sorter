import React, { useState } from "react";
import { current_session } from "./LoginForm";
import { UserPanel } from "./UserPanel";
import useSWR from "swr";
import { signal, useSignal } from "@preact/signals-react";

export const dark_mode = signal(localStorage.getItem("dark_mode") === "true");
const body = document.getElementsByTagName("body").item(0);

body.classList.add(dark_mode.value ? "dark" : "light");
body.classList.add(dark_mode.value ? "bg-black" : "bg-white");

const saveDarkMode = (e) => {
    localStorage.setItem("dark_mode", e.target.checked);
    dark_mode.value = e.target.checked;

    body.classList.remove(dark_mode.value ? "light" : "dark");
    body.classList.remove(dark_mode.value ? "bg-white" : "bg-black");
    body.classList.add(dark_mode.value ? "dark" : "white");
    body.classList.add(dark_mode.value ? "bg-black" : "bg-white");
}


const fetcher = (arg) => fetch(arg).then((res) => res.json());
const GroupRow = ({ group, users, mutate1 }) => {

    const selected_users = useSignal(group.users.map(u => {
        console.log(u);
        return { value: u.user_id, label: '@' + u.user_id }
    }));


    const delete_group = async (group) => {
        const r = await fetch("/api/user_group", {
            method: "DELETE",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ group_name: group.user_name }),
        });
        if (!r.ok) {
            alert(await r.text())
        }
        mutate1();
    }

    const save = async () => {
        const r = await fetch("/api/user_group", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ group_name: group.user_name, users: selected_users.value.map(u => u.value) }),
        });
        if (!r.ok) {
            alert(await r.text())
        }
        mutate1();
    }

    return <tr>
        <td className="text-blue-500">@@{group.user_name}</td>
        <td>
            <UserPanel users={users} selected_users={selected_users} />
        </td>
        <td>
            <button className="" onClick={save}>[save]</button>
            <button className="text-red-500" onClick={() => delete_group(group)}>[delete]</button>
        </td>
    </tr>
}


export const Profile = () => {
    const { data: users, error, isLoading } = useSWR("/api/users", fetcher);
    const { data, error: error1, isLoading: isLoading1, mutate: mutate1 } = useSWR("/api/user_group", fetcher);
    const { data: mygroups, error: error2, isLoading: isLoading2, mutate: mutate2 } = useSWR("/api/user_group/me", fetcher);

    const [newGroupName, setNewGroupName] = useState("")
    const selected_users = useSignal([]);

    if (isLoading || isLoading1 || isLoading2) return <h1>loading...</h1>;
    if (error || error1 || error2) return <h1>error</h1>;

    const save = async () => {
        if (newGroupName === "") {
            alert('no group name')
            return
        }
        const r = await fetch("/api/user_group", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ group_name: newGroupName, users: selected_users.value.map(u => u.value) }),
        });
        if (!r.ok) {
            alert(await r.text())
        }
        mutate1();
        mutate2();
    }

    return <div className="dark:text-white h-full">
        <div className="border m-3 border-dashed dark:border-gray-600 text-left lg:w-1/2"><span className="text-xl text-blue-500">@{current_session.value.user_name}</span></div>
        <div className="m-3 border border-dashed dark:border-gray-600 text-left lg:w-1/2">
            user groups you are in
            {mygroups.map((group) => {
                return <div className="text-blue-500">@@{group.usergroup_id}</div >
            })}
        </div>
        <div className="m-3 border border-dashed dark:border-gray-600 text-left lg:w-1/2">
            user groups you own
            <table className="w-full">
                {data.map((group) => {
                    return <GroupRow group={group} users={users} mutate1={() => { mutate1(); mutate2() }} />
                })}
                <tr>
                    <td className="text-blue-500">
                        {/* TODO validate that user group name satisfies regex, also do for username form. define regex as constant somewhere in frontent*/}
                        <input
                            placeholder="@@new_user_group"
                            value={newGroupName ? "@@" + newGroupName : ""}
                            onChange={e => setNewGroupName(e.target.value.replace("@@", ""))}>
                        </input>
                    </td>
                    <td>
                        <UserPanel users={users} selected_users={selected_users} />
                    </td>
                    <td>
                        <button className="" onClick={save}>[save]</button>
                        {/* <button className="text-red-500">[delete]</button> */}
                    </td>
                </tr>
                <tr>
                </tr>
            </table>
        </div>
        <div className="m-3 border border-dashed dark:border-gray-600 text-left lg:w-1/2">
            settings
            <br />
            <input type="checkbox" checked={dark_mode.value} onChange={saveDarkMode} /> dark mode
        </div>
    </div>
};
