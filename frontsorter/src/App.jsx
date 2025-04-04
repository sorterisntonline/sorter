import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDebounce } from 'use-debounce'
// Removed unused logos
// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
// import { useQuery } from '@tanstack/react-query'
// import { useDebounce } from 'use-debounce'
import './App.css'


// Fetch function for Spotify album search
const fetchSpotifyAlbums = async (artistId, query) => {
  if (!query && !artistId) {
      // Don't fetch if no artist is selected and query is empty
      return { results: [] };
  }

  let url = '/spotify/albums/search?';
  const params = new URLSearchParams();

  if (artistId) {
    // TODO: Add backend support for filtering by artist ID
    // For now, we still just search by query, but conceptually we might want
    // an endpoint like `/spotify/artists/{artistId}/albums?q=...`
    // params.append('artistId', artistId); // Placeholder
    console.warn("Filtering albums by artist ID not yet implemented on backend.");
  }
  if (query) {
      params.append('q', query);
  }

  url += params.toString();


  const response = await fetch(url);
  if (!response.ok) {
      let errorBody = 'Network response was not ok';
      try {
          const errJson = await response.json();
          errorBody = errJson.error || errorBody;
      } catch (e) {
          // Ignore
      }
      throw new Error(errorBody);
  }
  return response.json(); // Expects { results: [AlbumSearchResult] }
};

// TODO: Add fetch functions for artists and songs
// const fetchSpotifyArtists = async (query) => { ... };
// const fetchSpotifySongs = async (albumId, query) => { ... };

// Artist Panel Component
function ArtistPanel({ onArtistSelect }) {
    const [searchQuery, setSearchQuery] = useState('');
    // TODO: Add artist search logic (useQuery, debouncing)

    const handleSelect = (artist) => {
        onArtistSelect(artist);
    };

    return (
        <div className="panel artist-panel">
            <h2>Artists</h2>
            <input
                type="text"
                placeholder="Search artists..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '90%', padding: '8px', marginBottom: '10px' }}
            />
            {/* TODO: Display artist results */}
            <p>(Artist Search Results Here)</p>
            {/* Example interaction */}
            <button onClick={() => handleSelect({ id: 'artist1', name: 'Example Artist' })}>Select Example Artist</button>
        </div>
    );
}

// Album Panel Component (incorporates previous search logic)
function AlbumPanel({ selectedArtist, onAlbumSelect }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery] = useDebounce(searchQuery, 500);

    // Fetch albums based on selected artist (if any) and the search query
    const { data, error, isLoading, isFetching } = useQuery({
        queryKey: ['spotifyAlbums', selectedArtist?.id, debouncedSearchQuery],
        queryFn: () => fetchSpotifyAlbums(selectedArtist?.id, debouncedSearchQuery),
        // Enable query if a search term exists OR an artist is selected (to show their albums)
        enabled: !!debouncedSearchQuery || !!selectedArtist,
        staleTime: 1000 * 60 * 5, // 5 minutes
        keepPreviousData: true,
    });

    // Effect to clear search if artist changes (optional, depends on desired UX)
    // useEffect(() => {
    //   setSearchQuery('');
    // }, [selectedArtist]);

    return (
        <div className="panel album-panel">
            <h2>Albums {selectedArtist ? `by ${selectedArtist.name}` : ''}</h2>
            <input
                type="text"
                placeholder="Search albums..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '90%', padding: '8px', marginBottom: '10px' }}
            />
             {(isLoading || isFetching) && <span style={{ marginLeft: '10px' }}>Loading...</span>}
             {error && <p style={{ color: 'red' }}>Error: {error.message}</p>}

             {/* Display results */}
             {!isLoading && data && (
                 <ul style={{ listStyle: 'none', padding: 0, overflowY: 'auto', maxHeight: 'calc(100vh - 150px)' /* Adjust height as needed */ }}>
                    {data.results.map((album) => (
                        <li key={album.id || album.name} onClick={() => onAlbumSelect(album)} className="list-item">
                           {/* Basic display for now, add image later if needed */}
                           <strong>{album.name}</strong>
                           <span style={{ display: 'block', color: '#555', fontSize: '0.9em' }}>
                                {album.artists?.join(', ') || 'Unknown Artist'}
                           </span>
                            {album.release_date && (
                               <span style={{ display: 'block', color: '#888', fontSize: '0.8em' }}>
                                  {album.release_date}
                               </span>
                            )}
                        </li>
                    ))}
                 </ul>
             )}
             {data && data.results.length === 0 && !isFetching && (debouncedSearchQuery || selectedArtist) && <p>No results found.</p>}
        </div>
    );
}

// Song Panel Component
function SongPanel({ selectedAlbum }) {
    const [searchQuery, setSearchQuery] = useState('');
    // TODO: Add song fetching/filtering logic (useQuery, debouncing)

    if (!selectedAlbum) {
        return (
            <div className="panel song-panel">
                <h2>Songs</h2>
                <p>Select an album to see songs.</p>
            </div>
        );
    }

    return (
        <div className="panel song-panel">
            <h2>Songs in {selectedAlbum.name}</h2>
             <input
                type="text"
                placeholder="Filter songs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '90%', padding: '8px', marginBottom: '10px' }}
            />
            {/* TODO: Display song results */}
            <p>(Song List Here)</p>
        </div>
    );
}

// Main App Component
function App() {
    const [selectedArtist, setSelectedArtist] = useState(null)
    const [selectedAlbum, setSelectedAlbum] = useState(null)

    // When a new artist is selected, clear the album selection
    const handleArtistSelect = (artist) => {
        setSelectedAlbum(null)
        setSelectedArtist(artist)
    }

    return (
        <div className="app-container">
            <ArtistPanel
                onArtistSelect={handleArtistSelect}
            />
            <AlbumPanel
                selectedArtist={selectedArtist}
                onAlbumSelect={setSelectedAlbum}
            />
            <SongPanel
                selectedAlbum={selectedAlbum}
            />
        </div>
    )
}

export default App
