import React, { useEffect, useRef, useState } from 'react';

const SpotifyEmbed = ({ spotifyUri, height = 352 }) => { // Default height suggested by Spotify
    const embedContainerRef = useRef(null);
    const embedControllerRef = useRef(null);
    const [isApiReady, setIsApiReady] = useState(!!window.SpotifyIframeApi); // Check if loaded initially

    useEffect(() => {
        // Function to initialize the embed controller
        const initializeController = () => {
            if (window.SpotifyIframeApi && embedContainerRef.current && spotifyUri) {
                console.log("Spotify API ready, creating controller for:", spotifyUri);
                const options = {
                    uri: spotifyUri,
                    height: height, // Use prop for height
                    width: '100%',  // Make it responsive width-wise
                };
                const callback = (controller) => {
                    console.log("Embed controller created:", controller);
                    embedControllerRef.current = controller;
                    // Optional: Add event listeners here if needed (e.g., controller.addListener('ready', () => ...))
                };

                // Clean up previous controller if any
                if (embedControllerRef.current) {
                    console.log("Destroying previous embed controller.");
                    embedControllerRef.current.destroy();
                    embedControllerRef.current = null;
                    // Clear the container manually if needed, as destroy might not remove the iframe immediately
                    if (embedContainerRef.current) {
                        embedContainerRef.current.innerHTML = '';
                    }
                }

                 // Need slight delay sometimes for destroy to finish DOM cleanup before creating new one
                 setTimeout(() => {
                    if (embedContainerRef.current) { // Check if still mounted
                        window.SpotifyIframeApi.createController(embedContainerRef.current, options, callback);
                    }
                 }, 50);

            } else {
                console.log("API not ready or container/URI missing for initialization.");
            }
        };

        // If API is ready, initialize immediately
        if (isApiReady) {
            initializeController();
        } else {
            // If API wasn't ready, set up the callback and check again
            // This handles cases where the component mounts before the script loads fully
            console.log("Spotify API not ready yet, setting up ready callback.");
            window.onSpotifyIframeApiReady = (IFrameAPI) => {
                console.log("onSpotifyIframeApiReady called.");
                setIsApiReady(true);
                 // Store API reference if needed, though window.SpotifyIframeApi should persist
                 // Now initialize
                 initializeController();
            };
            // Double-check in case it became ready between initial check and setting callback
            if (window.SpotifyIframeApi) {
                setIsApiReady(true);
                initializeController();
            }
        }

        // Cleanup function to destroy controller on component unmount or URI change
        return () => {
            if (embedControllerRef.current) {
                console.log("Cleaning up embed controller for:", spotifyUri);
                embedControllerRef.current.destroy();
                embedControllerRef.current = null;
            }
            // Important: Remove the global callback reference if this component unmounts
            // to avoid conflicts if another instance mounts later or it triggers incorrectly.
            if (window.onSpotifyIframeApiReady && !isApiReady) {
                 // Only clear if we set it and it hasn't fired yet.
                 // If it fired, isApiReady is true and we don't want to clear it for other potential components.
                 // A more robust solution might use a shared context or singleton pattern for API readiness.
                 // window.onSpotifyIframeApiReady = null; // Be cautious with this global cleanup
            }
        };
    // Rerun effect if spotifyUri or height changes, or when API becomes ready
    }, [spotifyUri, isApiReady, height]);

    // Optional: If URI changes, load the new URI into the existing controller
    useEffect(() => {
        if (embedControllerRef.current && spotifyUri) {
            console.log("Loading new URI into existing controller:", spotifyUri);
            embedControllerRef.current.loadUri(spotifyUri);
        }
        // No cleanup needed here, the main effect handles controller recreation/destruction
    }, [spotifyUri]);


    return (
        <div ref={embedContainerRef} id={`spotify-embed-${spotifyUri}`}>
            {/* Placeholder while loading? */}
             {!isApiReady && <div>Loading Spotify Player...</div>}
        </div>
    );
};

export default SpotifyEmbed;
