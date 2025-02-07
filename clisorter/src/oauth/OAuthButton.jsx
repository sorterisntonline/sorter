import { initiateOAuth, useOAuthStatus } from './useOAuth';

export const OAuthButton = ({ 
  service,
  connectedText = "Connected",
  connectText = "Connect",
  className = "",
  brandColor = "",
  brandName = ""
}) => {
  const { isConnected, isLoading } = useOAuthStatus(service);

  if (isLoading) {
    return <div className="opacity-50">{connectText}...</div>;
  }

  if (isConnected) {
    return <div className="opacity-50">{connectedText}</div>;
  }

  return (
    <button
      onClick={() => initiateOAuth(service)}
      className={`flex items-center gap-2 px-3 py-1 transition-colors ${className}`}
    >
      {connectText} {brandName && (
        <span className={`bg-[${brandColor}] text-black font-bold px-1`}>
          {brandName}
        </span>
      )}
    </button>
  );
};

// Specific implementation for Spotify
export const SpotifyAuthButton = (props) => {
  const { isConnected } = useOAuthStatus('spotify');
  
  if (isConnected) {
    return null;
  }

  return (
    <OAuthButton
      service="spotify"
      brandColor="#1DB954"
      brandName="spotify"
      connectText="Link your"
      connectedText="Spotify connected"
      {...props}
    />
  );
};