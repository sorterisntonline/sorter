import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
// Removed unused logos
// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
import './App.css'

// Fetch function for Spotify album search
const fetchSpotifyAlbums = async (query) => {
  if (!query) {
    // Don't fetch if the query is empty
    return { results: [] };
  }
  // Use relative path for the proxy
  const response = await fetch(`/spotify/albums/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    // Attempt to parse error response from backend if possible
    let errorBody = 'Network response was not ok';
    try {
        const errJson = await response.json();
        errorBody = errJson.error || errorBody; // Use backend error if available
    } catch (e) {
        // Ignore if response is not JSON
    }
    throw new Error(errorBody);
  }
  return response.json(); // Backend returns { results: [AlbumSearchResult] }
};

function App() {
  // Removed unused count state
  // const [count, setCount] = useState(0)
  // State for the search input
  const [searchQuery, setSearchQuery] = useState('');

  // useQuery hook to fetch data
  const { data, error, isLoading, isFetching } = useQuery({
    queryKey: ['spotifyAlbums', searchQuery], // Query key includes the search query
    queryFn: () => fetchSpotifyAlbums(searchQuery), // Query function
    enabled: !!searchQuery, // Only run the query if searchQuery is not empty
    staleTime: 1000 * 60 * 5, // Keep data fresh for 5 minutes
    // Keep previous data while loading new data for smoother UX
    keepPreviousData: true,
  });

  return (
    <>
      {/* Removed the default Vite/React boilerplate */}
      {/* <div> ... links and logos ... </div> */}
      {/* <h1>Vite + React</h1> */}
      {/* <div className="card"> ... counter button ... </div> */}

      {/* Spotify Search Section */}
      <div className="card">
        <h2>Search Spotify Albums</h2>
        <div style={{ marginBottom: '1rem' }}> {/* Add some spacing */}
            <input
              type="text"
              placeholder="Enter album name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ marginRight: '10px', padding: '8px', minWidth: '300px' }}
            />
            {/* Indicate fetching state */}
            {(isLoading || isFetching) && <span style={{ marginLeft: '10px' }}>Loading...</span>}
        </div>

        {/* Display error state */}
        {error && <p style={{ color: 'red' }}>Error: {error.message}</p>}

        {/* Display results */}
        {/* Only show results area if not initial loading and data exists */}
        {!isLoading && data && (
          <ul style={{ listStyle: 'none', padding: 0 }}> {/* Style list */}
            {data.results.map((album) => (
              // Use album.id as the key
              <li key={album.id || album.name} style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '1rem' }}>
                {/* Album Cover Image */}
                {album.image_url && (
                  <img
                    src={album.image_url}
                    alt={`Cover for ${album.name}`}
                    style={{ width: '64px', height: '64px', marginRight: '1rem', objectFit: 'cover' }}
                  />
                )}
                {/* Album Details */}
                <div>
                    <strong style={{ display: 'block' }}>{album.name}</strong>
                    <span style={{ display: 'block', color: '#555' }}>
                        {album.artists.join(', ')}
                    </span>
                    {album.release_date && (
                         <span style={{ display: 'block', color: '#888', fontSize: '0.9em' }}>
                            Released: {album.release_date}
                         </span>
                    )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {/* Display "No results" message */}
         {data && data.results.length === 0 && !isFetching && searchQuery && <p>No results found for "{searchQuery}".</p>}
      </div>

      {/* Removed the default Vite/React docs link */}
      {/* <p className="read-the-docs"> ... </p> */}
    </>
  )
}

export default App
