import React, { useState, useEffect, useRef } from 'react';

// Store the API object globally once loaded to avoid race conditions
// and redundant script loading if multiple players are used.
let spotifyIframeApi = null;
// Queue for components waiting for the API to load
let apiReadyQueue = [];
let isApiLoading = false; // Prevent multiple script appends

// Define the global callback ONCE.
// It should process all queued components when the API loads.
if (typeof window !== 'undefined' && !window.onSpotifyIframeApiReady) {
    window.onSpotifyIframeApiReady = (IFrameAPI) => {
        console.log('Spotify IFrame API is ready.');
        spotifyIframeApi = IFrameAPI;
        isApiLoading = false;
        // Process any components that mounted and queued while the API was loading
        apiReadyQueue.forEach(callback => callback(IFrameAPI));
        apiReadyQueue = []; // Clear the queue
    };
}

/**
 * Appends the Spotify iFrame API script to the document head if not already present or loading.
 */
function loadSpotifyScript() {
    if (typeof window === 'undefined' || spotifyIframeApi || isApiLoading) {
        return; // Don't load if server-side, already loaded, or currently loading
    }
    const scriptId = 'spotify-iframe-api-script';
    if (document.getElementById(scriptId)) {
        return; // Script already added to DOM
    }

    console.log('Attempting to load Spotify IFrame API script...');
    isApiLoading = true;
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://open.spotify.com/embed/iframe-api/v1';
    script.async = true;
    document.head.appendChild(script);

    // Timeout fallback in case onSpotifyIframeApiReady never fires
    setTimeout(() => {
        if (!spotifyIframeApi) {
            console.warn('Spotify API load timed out or failed.');
            isApiLoading = false;
            // Potentially reject queued promises or handle error state
        }
    }, 10000); // 10 second timeout
}


/**
 * Renders a Spotify embed player.
 * Handles loading the Spotify iFrame API script if necessary.
 * @param {object} props - Component props.
 * @param {string} props.uri - The Spotify URI (e.g., "spotify:track:123").
 */
function SpotifyPlayer({ uri }) {
    const iframeContainerRef = useRef(null);
    const embedControllerRef = useRef(null);
    const uniqueId = useRef(`spotify-embed-${uri}-${Math.random().toString(36).substring(7)}`).current; // Unique ID for the container

    useEffect(() => {
        // Ensure the script is loaded or loading when the component mounts
        loadSpotifyScript();

        // Function to create the embed controller
        const createEmbed = (IFrameAPI) => {
            // Ensure the container exists and we don't already have a controller
            if (iframeContainerRef.current && !embedControllerRef.current) {
                console.log(`Creating Spotify embed for URI: ${uri} in ${uniqueId}`);
                const options = {
                    uri: uri,
                    height: 80, // Compact height
                    width: '100%'
                };
                const callback = (controller) => {
                    console.log('Embed controller created:', controller);
                    embedControllerRef.current = controller;
                    // Optional: Autoplay? controller.play();
                    // Add event listeners if needed: controller.addListener('event_name', callback);
                };
                // Ensure the API object is valid before calling
                if (typeof IFrameAPI?.createController === 'function') {
                    IFrameAPI.createController(iframeContainerRef.current, options, callback);
                } else {
                     console.error("Spotify IFrame API or createController is not available.", IFrameAPI);
                     // Potentially update state to show an error to the user
                }
            }
        };

        // If the container exists (always try to create embed now)
        if (iframeContainerRef.current) {
            if (spotifyIframeApi) {
                // API already loaded, create embed immediately
                 console.log('API was ready, creating embed.');
                createEmbed(spotifyIframeApi);
            } else if (isApiLoading) {
                // API is loading, add to queue
                 console.log('API is loading, queuing embed creation.');
                 // Store a reference to the create function bound with the correct API object when ready
                 const queueCallback = (IFrameAPI) => createEmbed(IFrameAPI);
                 apiReadyQueue.push(queueCallback);
            } else {
                // API not loaded and not loading? Should not happen if loadSpotifyScript was called.
                console.warn('Spotify API neither loaded nor loading. Attempting load again.');
                loadSpotifyScript();
                // Queue it optimistically
                const queueCallback = (IFrameAPI) => createEmbed(IFrameAPI);
                apiReadyQueue.push(queueCallback);
            }
        }

        // Cleanup function
        return () => {
            // Attempt to remove this specific component's callback from the queue if it hasn't run
            // Note: This simple queue doesn't support easy removal. For robustness, a more complex queue or state management might be needed.
            // If the controller was created, destroy it.
            if (embedControllerRef.current) {
                console.log('Destroying Spotify embed controller for', uri);
                // Check if destroy method exists before calling
                if (typeof embedControllerRef.current.destroy === 'function') {
                   embedControllerRef.current.destroy();
                }
                embedControllerRef.current = null;
            }
        };
    // Depend only on URI now.
    }, [uri, uniqueId]);

    return (
        <div className="spotify-player-container mt-3">
            {/* Container for the iframe. Always rendered now. */}
            <div
                ref={iframeContainerRef}
                id={uniqueId} // Use unique ID for the container
                className="w-full h-[80px]" // Set size explicitly
            >
                {/* Spotify iframe will be injected here */}
                {/* Optional: Add a loading indicator until the iframe loads */}
            </div>
        </div>
    );
}

export default SpotifyPlayer;
