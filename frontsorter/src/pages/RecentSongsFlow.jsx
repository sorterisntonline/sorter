import React, { useState } from "react";

export default function RecentSongsFlow() {
    const [stage, setStage] = useState("recent"); // stages: recent | voting | submitted
    const initialSongs = [
        "Song A",
        "Song B",
        "Song C",
        "Song D",
        "Song E",
    ];
    const [songs, setSongs] = useState(initialSongs);
    const [votes, setVotes] = useState(0);
    const maxVotes = 7;

    // helper to generate all unique pairs once per bundle
    const generatePairs = (items) => {
        const pairs = [];
        for (let i = 0; i < items.length; i++) {
            for (let j = i + 1; j < items.length; j++) {
                pairs.push([items[i], items[j]]);
            }
        }
        return pairs;
    };
    const [pairs] = useState(generatePairs(songs));
    const currentPair = pairs[votes] || [];

    const [sliderValue, setSliderValue] = useState(50);

    const handlePrimaryAction = () => {
        if (stage === "recent") {
            // proceed to voting stage when user clicks "Start Voting"
            setStage("voting");
            return;
        }

        if (stage === "voting") {
            if (votes + 1 < maxVotes) {
                // count vote and move to next pair
                setVotes(votes + 1);
                setSliderValue(50);
            } else {
                // final vote -> submit bundle
                setVotes(maxVotes);
                setStage("submitted");
            }
            return;
        }

        if (stage === "submitted") {
            // restart flow with empty bundle (placeholder: same songs)
            setSongs(initialSongs);
            setVotes(0);
            setStage("recent");
        }
    };

    const renderRecent = () => (
        <>
            <h2 className="text-2xl mb-4 font-semibold">5 Recent Songs</h2>
            <div className="grid grid-cols-3 gap-4 mb-8 w-60">
                {songs.map((song, idx) => (
                    <div
                        key={idx}
                        className="col-span-1 aspect-square bg-gray-800 text-white flex items-center justify-center text-sm text-center rounded"
                    >
                        {song}
                    </div>
                ))}
            </div>
            <button
                onClick={handlePrimaryAction}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
            >
                Start Voting
            </button>
        </>
    );

    const renderVoting = () => (
        <>
            <h2 className="text-2xl mb-2 font-semibold">Vote on Bundle</h2>
            {/* bundle grid */}
            <div className="grid grid-cols-5 gap-2 mb-4 w-full max-w-md">
                {songs.map((song, idx) => (
                    <div
                        key={idx}
                        className={`aspect-square flex items-center justify-center text-xs text-center rounded border ${
                            votes >= idx ? "bg-red-400" : "bg-white"
                        }`}
                    >
                        {song}
                    </div>
                ))}
            </div>

            {/* progress bar */}
            <div className="flex space-x-1 mb-6">
                {Array.from({ length: maxVotes }).map((_, idx) => (
                    <div
                        key={idx}
                        className={`w-6 h-2 rounded-sm ${idx < votes ? "bg-red-600" : "bg-gray-300"}`}
                    ></div>
                ))}
            </div>

            {/* current pair */}
            {currentPair.length === 2 && (
                <div className="flex flex-col items-center w-full max-w-sm">
                    <div className="text-center mb-4">
                        <span className="font-medium">{currentPair[0]}</span> vs. {" "}
                        <span className="font-medium">{currentPair[1]}</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={sliderValue}
                        onChange={(e) => setSliderValue(Number(e.target.value))}
                        className="w-full mb-6"
                    />
                </div>
            )}

            <button
                onClick={handlePrimaryAction}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
            >
                {votes + 1 < maxVotes ? "Submit Vote" : "Submit Bundle"}
            </button>
        </>
    );

    const renderSubmitted = () => (
        <>
            <h2 className="text-2xl mb-4 font-semibold">Bundle Submitted!</h2>
            <p className="mb-8 text-center text-sm w-64">
                You caused <span className="font-medium">{songs[0]}</span> to drop 3 spots.
            </p>
            <button
                onClick={handlePrimaryAction}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
            >
                Next
            </button>
        </>
    );

    return (
        <div className="flex flex-col items-center justify-center h-screen">
            {stage === "recent" && renderRecent()}
            {stage === "voting" && renderVoting()}
            {stage === "submitted" && renderSubmitted()}
        </div>
    );
}