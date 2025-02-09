import React from "react";
import useSWR from "swr";

const fetcher = (arg) => fetch(arg).then((res) => res.json());
export const Leaderboard = () => {
    const { data, error, isLoading } = useSWR("/api/leaderboard", fetcher);
    if (isLoading) return <h1> loading... </h1>;
    if (error) return <h1> error </h1>;

    const sortedData = data.sort((a, b) => b.count - a.count);

    return (
        <div className="page-padding-top mt-5 w-full max-w-full overflow-x-hidden">
            <table className="w-full">
                {data.map((user) => {
                    return <tr className="dark:text-white text-left">  <td>{user.user_name}</td> <td>{user.count} votes</td> </tr>;
                })}
            </table>
        </div>
    );
};
