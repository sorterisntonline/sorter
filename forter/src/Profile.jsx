import React, { useState, useEffect } from "react";
import { current_session, fetchSession } from "./session";
import { UserPanel } from "./UserPanel";
import useSWR from "swr";
import { signal, useSignal } from "@preact/signals-react";
import { useLocation } from "wouter";
import { redirectToLogin } from './utils/authUtils';
import { withAuth } from './utils/withAuth';
import { dark_mode, theme_mode, setThemeMode } from './utils/themeUtils';

// Theme selector component
const ThemeSelector = () => {
    const [animating, setAnimating] = useState(false);
    
    const handleThemeChange = (mode) => {
        if (theme_mode.value !== mode) {
            setAnimating(true);
            setThemeMode(mode);
            setTimeout(() => setAnimating(false), 300); // Animation duration
        }
    };
    
    // Calculate the position of the highlight based on the current theme
    const getHighlightPosition = () => {
        switch(theme_mode.value) {
            case "light": return "0%";
            case "auto": return "33.33%";
            case "dark": return "66.66%";
            default: return "33.33%";
        }
    };
    
    return (
        <div className="my-4">
            <div className="relative w-64 h-10 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center p-1 overflow-hidden">
                {/* Animated highlight */}
                <div 
                    className={`absolute h-8 w-1/3 bg-blue-500 rounded-full transition-all duration-300 ease-in-out ${animating ? 'opacity-70' : 'opacity-100'}`}
                    style={{ left: getHighlightPosition() }}
                />
                
                {/* Theme options */}
                <button 
                    className={`relative z-10 flex-1 h-full rounded-full flex items-center justify-center text-sm font-medium transition-colors ${theme_mode.value === 'light' ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}
                    onClick={() => handleThemeChange('light')}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    Light
                </button>
                <button 
                    className={`relative z-10 flex-1 h-full rounded-full flex items-center justify-center text-sm font-medium transition-colors ${theme_mode.value === 'auto' ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}
                    onClick={() => handleThemeChange('auto')}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                    Auto
                </button>
                <button 
                    className={`relative z-10 flex-1 h-full rounded-full flex items-center justify-center text-sm font-medium transition-colors ${theme_mode.value === 'dark' ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}
                    onClick={() => handleThemeChange('dark')}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                    Dark
                </button>
            </div>
        </div>
    );
};

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
            body: JSON.stringify({ group_name: group.user_name, users: Array.isArray(selected_users.value) ? selected_users.value.map(u => u.value) : [] }),
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


const ProfileComponent = () => {
    // Theme is already initialized in main.jsx, no need to initialize it again here
    
    const { data: user, error, isLoading } = useSWR("/api/users?user_name=" + current_session.value.user_name, fetcher);
    const { data, error: error1, isLoading: isLoading1, mutate: mutate1 } = useSWR("/api/user_group", fetcher);
    const { data: mygroups, error: error2, isLoading: isLoading2, mutate: mutate2 } = useSWR("/api/user_group/me", fetcher);
    const [_, setLocation] = useLocation();
    const [newGroupName, setNewGroupName] = useState("");
    const selected_users = useSignal([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const users = [user]

    if (isLoading || isLoading1 || isLoading2) return <h1>loading...</h1>;
    if (error || error1 || error2) return <h1>error</h1>;

    const save = async () => {
        if (newGroupName === "") {
            alert('no group name');
            return;
        }
        try {
            const r = await fetch("/api/user_group", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ group_name: newGroupName, users: Array.isArray(selected_users.value) ? selected_users.value.map(u => u.value) : [] }),
            });
            if (!r.ok) {
                const msg = await r.text();
                if (r.status === 401) {  // unauthorized
                    setErrorMessage(msg);
                    setIsModalOpen(true);
                } else {
                    alert(msg);
                }
            }
            mutate1();
            mutate2();
        } catch (error) {
            if (error.status === 401) {  // unauthorized
                setErrorMessage(error.message);
                setIsModalOpen(true);
            }
        }
    }

    return <div className="page-padding-top dark:text-white h-full">
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
            <h3 className="text-lg font-medium mb-2">Settings</h3>
            <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Theme</p>
                <ThemeSelector />
            </div>
        </div>
    </div>
};

export const Profile = withAuth(ProfileComponent, { showError: false });
