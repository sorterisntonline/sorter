import React, { useState, useEffect } from "react";
import { current_session, fetchSession } from "./session";
import { UserPanel } from "./UserPanel";
import useSWR from "swr";
import { signal, useSignal } from "@preact/signals-react";
import { useLocation } from "wouter";
import { redirectToLogin, fetchUserProfile } from './utils/authUtils';
import { withAuth } from './utils/withAuth';
import { dark_mode, theme_mode, setThemeMode } from './utils/themeUtils';
import { useAuth0 } from "@auth0/auth0-react";

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

// Auth0 profile section component
const Auth0ProfileSection = () => {
    const { user: auth0User, isAuthenticated, isLoading } = useAuth0();
    const [profileData, setProfileData] = useState(null);
    const [isLoadingProfile, setIsLoadingProfile] = useState(true);
    const [linkedAccounts, setLinkedAccounts] = useState([]);

    useEffect(() => {
        const loadProfile = async () => {
            if (isAuthenticated) {
                try {
                    setIsLoadingProfile(true);
                    const data = await fetchUserProfile(['auth0_id', 'account_linked']);
                    setProfileData(data);
                    
                    // Parse linked accounts from the auth0_id
                    if (data && data.auth0_id) {
                        // Theoretically, we could have multiple IDs in the future
                        // For now, we'll just parse the single ID we have
                        const accounts = [getProviderInfo(data.auth0_id)];
                        setLinkedAccounts(accounts);
                    }
                } catch (error) {
                    console.error("Error loading profile:", error);
                } finally {
                    setIsLoadingProfile(false);
                }
            }
        };

        loadProfile();
    }, [isAuthenticated]);
    
    // Helper function to get provider name and icon
    const getProviderInfo = (authId) => {
        if (!authId) return { name: "Auth0", icon: "🔒", id: null };
        
        const [provider, id] = authId.split('|');
        const shortId = id ? `${id.substring(0, 4)}...${id.substring(id.length - 4)}` : '';
        
        switch (provider.toLowerCase()) {
            case 'github':
                return { 
                    name: "GitHub", 
                    id: shortId,
                    icon: (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z" />
                        </svg>
                    )
                };
            case 'google-oauth2':
                return { 
                    name: "Google", 
                    id: shortId,
                    icon: (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.345-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z" />
                        </svg>
                    )
                };
            default:
                return { name: "Auth0", id: shortId, icon: "🔒" };
        }
    };

    if (isLoading || isLoadingProfile) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500"></div>
                <span className="ml-3 text-gray-600 dark:text-gray-300">Loading linked accounts...</span>
            </div>
        );
    }

    // User is not authenticated with Auth0
    if (!isAuthenticated || !auth0User) {
        return (
            <div className="p-6 rounded-lg bg-gray-50 dark:bg-gray-700 mb-4 shadow-sm hover:shadow-md transition-all duration-300">
                <h4 className="text-lg font-medium mb-3">Authentication</h4>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                    You are not currently signed in with a third-party provider. Linking accounts provides enhanced security and faster login.
                </p>
                <a 
                    href="/login"
                    className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors duration-200 shadow-sm"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                    </svg>
                    Link Account
                </a>
            </div>
        );
    }

    return (
        <div className="p-6 rounded-lg bg-gray-50 dark:bg-gray-700 mb-4 shadow-sm hover:shadow-md transition-all duration-300">
            <h4 className="text-lg font-medium mb-4">Authentication</h4>
            
            <div className="mb-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                {auth0User.picture && (
                    <div className="flex justify-center mb-4">
                        <img 
                            src={auth0User.picture} 
                            alt="Auth0 Profile" 
                            className="w-16 h-16 rounded-full border-2 border-purple-200 dark:border-purple-700 transition-all duration-300 hover:border-purple-500 dark:hover:border-purple-500"
                        />
                    </div>
                )}
                <div className="text-center mb-4">
                    <div className="font-medium text-lg">{auth0User.name}</div>
                    <p className="text-gray-600 dark:text-gray-400">{auth0User.email}</p>
                </div>
                
                <div className="mt-4">
                    <h5 className="text-sm uppercase text-gray-500 dark:text-gray-400 mb-2 font-medium">Linked Providers</h5>
                    <div className="space-y-2">
                        {linkedAccounts.map((account, index) => (
                            <div 
                                key={index} 
                                className="flex items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600 transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                            >
                                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-blue-100 dark:bg-blue-900 rounded-full text-blue-700 dark:text-blue-300 mr-3">
                                    {typeof account.icon === 'string' ? account.icon : account.icon}
                                </div>
                                <div className="flex-grow">
                                    <div className="font-medium">{account.name}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">Connected</div>
                                </div>
                                <div className="flex-shrink-0">
                                    <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                                        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                        Active
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            
            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-600 pt-4">
                <p>You can link additional accounts by signing in with a different provider.</p>
                <a href="/login" className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 mt-2 inline-block">
                    Add another account
                </a>
            </div>
        </div>
    );
};

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

    return <div className="page dark:text-white">
        <div className="border m-3 border-dashed dark:border-gray-600 text-left lg:w-1/2">
            <div className="p-4">
                <div className="flex items-center mb-2">
                    {current_session.value.pfp_url && (
                        <img 
                            src={current_session.value.pfp_url} 
                            alt="Profile"
                            className="w-14 h-14 rounded-full mr-3 object-cover" 
                        />
                    )}
                    <span className="text-xl text-blue-500">@{current_session.value.user_name}</span>
                </div>
                {current_session.value.email && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {current_session.value.email}
                    </p>
                )}
            </div>
        </div>
        
        <div className="m-3 border border-dashed dark:border-gray-600 text-left lg:w-1/2">
            <div className="p-4">
                <h3 className="text-lg font-medium mb-4">Authentication</h3>
                <Auth0ProfileSection />
            </div>
        </div>
        
        <div className="m-3 border border-dashed dark:border-gray-600 text-left lg:w-1/2">
            <div className="p-4">
                <h3 className="text-lg font-medium mb-2">User Groups You Are In</h3>
                {mygroups.length === 0 ? (
                    <p className="text-sm text-gray-600 dark:text-gray-400">You are not a member of any user groups.</p>
                ) : (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {mygroups.map((group) => (
                            <div key={group.usergroup_id} className="text-blue-500 bg-blue-100 dark:bg-blue-900 dark:bg-opacity-30 px-2 py-1 rounded-md text-sm">
                                @@{group.usergroup_id}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
        
        <div className="m-3 border border-dashed dark:border-gray-600 text-left lg:w-1/2">
            <div className="p-4">
                <h3 className="text-lg font-medium mb-2">User Groups You Own</h3>
                <table className="w-full">
                    {data.map((group) => (
                        <GroupRow key={group.user_name} group={group} users={users} mutate1={() => { mutate1(); mutate2() }} />
                    ))}
                    <tr>
                        <td className="text-blue-500">
                            {/* TODO validate that user group name satisfies regex, also do for username form. define regex as constant somewhere in frontent*/}
                            <input
                                placeholder="@@new_user_group"
                                value={newGroupName ? "@@" + newGroupName : ""}
                                onChange={e => setNewGroupName(e.target.value.replace("@@", ""))}
                                className="p-1 border border-gray-300 dark:border-gray-600 rounded">
                            </input>
                        </td>
                        <td>
                            <UserPanel users={users} selected_users={selected_users} />
                        </td>
                        <td>
                            <button 
                                className="px-2 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm" 
                                onClick={save}
                            >
                                Save
                            </button>
                        </td>
                    </tr>
                </table>
            </div>
        </div>
        
        <div className="m-3 border border-dashed dark:border-gray-600 text-left lg:w-1/2">
            <div className="p-4">
                <h3 className="text-lg font-medium mb-2">Settings</h3>
                <div className="mb-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Theme</p>
                    <ThemeSelector />
                </div>
            </div>
        </div>
    </div>
};

export const Profile = withAuth(ProfileComponent, { showError: false });
