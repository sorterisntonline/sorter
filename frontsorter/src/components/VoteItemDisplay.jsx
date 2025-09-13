import { Link } from 'react-router-dom';

const getSmallestImageUrl = (images) => {
    if (!images || images.length === 0) return null;
    return images[images.length - 1].url;
};

function VoteItemDisplay({ item, isDisabled }) {
    if (!item) return null;

    const { title, pk_namespace, pk, metadata, profile_picture_url } = item;
    const entityType = pk_namespace?.split('.')[1] || 'item';
    const isSpotifyTrack = pk_namespace?.includes('spotify.track');
    const isSpotifyAlbum = pk_namespace?.includes('spotify.album');

    const content = isSpotifyTrack || isSpotifyAlbum ? (
        <SpotifyEmbed 
            type={isSpotifyTrack ? 'track' : 'album'}
            pk={pk}
            title={title}
            entityType={entityType}
            isDisabled={isDisabled}
        />
    ) : (
        <DefaultItemDisplay
            title={title}
            imageUrl={profile_picture_url || getSmallestImageUrl(metadata?.images)}
            entityType={entityType}
            isDisabled={isDisabled}
        />
    );

    return (
        <Link 
            to={`/?pk_namespace=${encodeURIComponent(pk_namespace)}&pk=${encodeURIComponent(pk)}`} 
            className="no-underline hover:opacity-80 transition-opacity"
        >
            {content}
        </Link>
    );
}

function SpotifyEmbed({ type, pk, title, entityType, isDisabled }) {
    return (
        <div className={`flex flex-col items-center p-1 transition-all duration-200 ease-in-out ${isDisabled ? 'opacity-50' : ''}`}>
            <iframe
                style={{ borderRadius: '12px' }}
                src={`https://open.spotify.com/embed/${type}/${pk}`}
                width="300"
                height="380"
                frameBorder="0"
                allowFullScreen=""
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                title={`${type}: ${title || 'Spotify Content'}`}
            />
            <h4 className="text-xs font-semibold text-center truncate w-full mt-2" title={title}>
                {title || 'Unknown Title'}
            </h4>
            <p className="text-xs text-gray-500 capitalize">[{entityType}]</p>
        </div>
    );
}

function DefaultItemDisplay({ title, imageUrl, entityType, isDisabled }) {
    return (
        <div className={`flex flex-col items-center p-3 transition-all duration-200 ease-in-out w-40 ${isDisabled ? 'opacity-50' : 'bg-white'}`}>
            {imageUrl ? (
                <img src={imageUrl} alt={`Cover for ${title}`} className="w-28 h-28 object-cover rounded-md mb-2" />
            ) : (
                <div className="w-28 h-28 bg-gray-200 rounded-md mb-2 flex items-center justify-center text-gray-400 text-3xl">?</div>
            )}
            <h4 className="text-xs font-semibold text-center truncate w-full" title={title}>
                {title || 'Unknown Title'}
            </h4>
            <p className="text-xs text-gray-500 capitalize">[{entityType}]</p>
        </div>
    );
}

export default VoteItemDisplay;