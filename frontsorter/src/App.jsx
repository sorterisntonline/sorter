import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
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
    throw new Error('Network response was not ok');
  }
  return response.json(); // The backend returns JSON { results: [...] }
};

function App() {
  const [count, setCount] = useState(0)
  // State for the search input
  const [searchQuery, setSearchQuery] = useState('');

  // useQuery hook to fetch data
  const { data, error, isLoading, isFetching } = useQuery({
    queryKey: ['spotifyAlbums', searchQuery], // Query key includes the search query
    queryFn: () => fetchSpotifyAlbums(searchQuery), // Query function
    enabled: !!searchQuery, // Only run the query if searchQuery is not empty
    staleTime: 1000 * 60 * 5, // Keep data fresh for 5 minutes
  });

  return (
    <>
      {/* Spotify Search Section */}
      <div className="card">
        <h2>Search Spotify Albums</h2>
        <input
          type="text"
          placeholder="Enter album name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ marginRight: '10px' }}
        />
        {/* Display loading/fetching state */}
        {(isLoading || isFetching) && <p>Loading...</p>}
        {/* Display error state */}
        {error && <p style={{ color: 'red' }}>Error: {error.message}</p>}
        {/* Display results */}
        {data && (
          <ul>
            {data.results.map((album, index) => (
              <li key={index}>{album}</li> // Use a proper key if data has IDs
            ))}
          </ul>
        )}
         {data && data.results.length === 0 && !isLoading && searchQuery && <p>No results found.</p>}
      </div>
    </>
  )
}

export default App
