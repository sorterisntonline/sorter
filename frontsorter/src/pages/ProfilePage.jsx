import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AuthAPI } from '../api/auth';

export default function ProfilePage() {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <div className="p-6">
        <div className="text-gray-500">Loading profile...</div>
      </div>
    );
  }

  if (!auth.user) {
    return (
      <div className="p-6">
        <div className="text-gray-600">You need to be signed in to view your profile.</div>
      </div>
    );
  }

  const handleSpotifyLink = () => {
    window.location.href = AuthAPI.getSpotifyLinkUrl();
  };

  const spotifyConnected = auth.user.primary_provider === 'spotify';

  return (
    <div className="max-w-2xl space-y-8">
      <section className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-semibold text-gray-900">Your Profile</h1>
        <p className="text-gray-600 mt-2">@{auth.user.handle}</p>
      </section>

      <section className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Spotify Connection</h2>
        {spotifyConnected ? (
          <div className="space-y-3">
            <p className="text-gray-600">
              Your account is connected to Spotify. Enjoy music-powered ranking features.
            </p>
            <button
              onClick={handleSpotifyLink}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-400 transition-colors"
            >
              Reconnect Spotify
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-gray-600">
              Link your Spotify account to unlock personalized playlists and music analytics.
            </p>
            <button
              onClick={handleSpotifyLink}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-400 transition-colors"
            >
              Connect Spotify
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
