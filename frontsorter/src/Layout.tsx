import React from 'react';
import { Outlet } from 'react-router-dom';
import { useRequireAuth } from './contexts/AuthContext';
import { SpotifyPlayerProvider } from './contexts/SpotifyPlayerContext';
import BottomSpotifyPlayer from './components/BottomSpotifyPlayer';
import './styles/bottom-player.css';

function Layout() {
  const auth = useRequireAuth();

  if (auth.isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              border: '2px solid #f3f3f3',
              borderTop: '2px solid #1db954',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px',
            }}
          />
          <p style={{ color: '#6b7280' }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <SpotifyPlayerProvider user={auth.user}>
      <div style={{ position: 'relative', minHeight: '100vh' }}>
        <main style={{ padding: 0, maxWidth: '100%', minHeight: '100vh' }}>
          <Outlet />
        </main>
        <BottomSpotifyPlayer />
      </div>
    </SpotifyPlayerProvider>
  );
}

export default Layout;
