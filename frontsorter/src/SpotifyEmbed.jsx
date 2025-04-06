import React, { useEffect, useRef } from 'react';

// Simple queue to hold initialization functions if API isn't ready
let waitingInitializers = [];
let isApiLoaded = !!window.SpotifyIframeApi; // Check initial state

// Define the global ready function ONCE
if (!window.onSpotifyIframeApiReady) {
    window.onSpotifyIframeApiReady = (IFrameAPI) => {
        console.log("Global onSpotifyIframeApiReady called.");
        isApiLoaded = true;
        // Process any waiting initializers
        waitingInitializers.forEach(initFunc => initFunc(IFrameAPI));
        waitingInitializers = []; // Clear the queue
    };
}

const SpotifyEmbed = ({ spotifyUri, height = 352 }) => {
    const embedContainerRef = useRef(null);
    const embedControllerRef = useRef(null);

    useEffect(() => {
        const containerElement = embedContainerRef.current; // Capture ref value

        // Function to perform the actual controller creation
        const createEmbedController = (IFrameAPI) => {
            // Double-check container existence in case of fast unmount
            if (!containerElement || !spotifyUri) {
                console.warn("Skipping controller creation: container or URI missing.");
                return;
            }

            console.log("Attempting to create controller for:", spotifyUri, "in element:", containerElement);

            // Clean up previous controller if any
            if (embedControllerRef.current) {
                console.log("Destroying previous embed controller.");
                try {
                    embedControllerRef.current.destroy();
                } catch (e) {
                    console.error("Error destroying previous controller:", e);
                }
                embedControllerRef.current = null;
                // Clear the container manually
                 containerElement.innerHTML = '';

            }

            const options = {
                uri: spotifyUri,
                height: height,
                width: '100%',
            };

            const callback = (controller) => {
                console.log("Embed controller CREATED:", controller);
                // Check if component is still mounted conceptually
                if (embedContainerRef.current) {
                     embedControllerRef.current = controller;
                } else {
                    console.warn("Component unmounted before controller callback finished, destroying new controller.");
                    controller.destroy();
                }
            };

             // Use a small timeout to ensure DOM is ready after potential innerHTML clear
             setTimeout(() => {
                // Final check before creating
                if (embedContainerRef.current === containerElement && spotifyUri) {
                    console.log("Calling IFrameAPI.createController...");
                     IFrameAPI.createController(containerElement, options, callback);
                } else {
                    console.warn("Aborted createController due to changed element or URI.");
                }
             }, 50); // Keep the small delay
        };

        // --- Initialization Logic ---
        if (isApiLoaded && window.SpotifyIframeApi) {
            // API is ready, initialize directly
            console.log("API already loaded, initializing controller.");
            createEmbedController(window.SpotifyIframeApi);
        } else {
            // API not ready, add initializer to queue
            console.log("API not loaded, adding initializer to queue.");
            const initializer = (IFrameAPI) => createEmbedController(IFrameAPI);
            waitingInitializers.push(initializer);

             // Return a function to remove this specific initializer if the component unmounts before API is ready
             return () => {
                 console.log("Cleaning up: Removing initializer from queue.");
                 waitingInitializers = waitingInitializers.filter(init => init !== initializer);
                 // Also destroy controller if it managed to get created
                 if (embedControllerRef.current) {
                     console.log("Cleaning up: Destroying controller on unmount (API load race).");
                     try {
                         embedControllerRef.current.destroy();
                     } catch (e) { console.error("Error destroying controller during cleanup:", e); }
                     embedControllerRef.current = null;
                 }
             };
        }

        // Cleanup for when the component unmounts OR spotifyUri/height changes
        return () => {
            if (embedControllerRef.current) {
                console.log("Cleaning up: Destroying controller for:", spotifyUri);
                 try {
                    embedControllerRef.current.destroy();
                } catch (e) { console.error("Error destroying controller during cleanup:", e); }
                embedControllerRef.current = null;
            }
            // No need to remove from queue here, that's handled if API wasn't ready
        };
    // Rerun effect only if spotifyUri or height changes
    }, [spotifyUri, height]);

    return (
        // Use a key derived from the URI to help React differentiate elements if URI changes fast
        <div ref={embedContainerRef} id={`spotify-embed-container-${spotifyUri?.replace(/[^a-zA-Z0-9]/g, '')}`} key={spotifyUri}>
            {/* Keep a simple loading indicator maybe, but the logic doesn't depend on isApiReady state anymore */}
            {/* You might want to show loading based on whether embedControllerRef.current exists */}
            {!embedControllerRef.current && <div>Loading Spotify Player...</div>}
        </div>
    );
};

export default SpotifyEmbed;
