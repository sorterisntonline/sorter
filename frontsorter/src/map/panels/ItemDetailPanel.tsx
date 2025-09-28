import React from 'react';
import { useMapContext } from '../MapContext';
import '../../styles/map-room.css';

const extractArtist = (entity: any) => entity?.metadata?.artists?.[0]?.name || entity?.metadata?.artist || 'Unknown Artist';
const extractAlbum = (entity: any) => entity?.metadata?.album?.name || entity?.metadata?.album_name;
const extractImage = (entity: any) => entity?.metadata?.album?.images?.[0]?.url || entity?.profile_picture_url;

export const ItemDetailPanel: React.FC = () => {
  const { selectedEntity } = useMapContext();

  if (!selectedEntity) {
    return (
      <div className="room-panel room-panel--empty">
        <p>Pick a track from another room to inspect it here.</p>
      </div>
    );
  }

  const artist = extractArtist(selectedEntity);
  const album = extractAlbum(selectedEntity);
  const artwork = extractImage(selectedEntity);
  const spotifyUrl = selectedEntity.metadata?.external_urls?.spotify;

  return (
    <div className="room-panel room-panel--detail">
      {artwork && <img src={artwork} alt={selectedEntity.title || 'Artwork'} className="detail-art" />}
      <div className="detail-meta">
        <h3 className="detail-title">{selectedEntity.title || 'Untitled'}</h3>
        <p className="detail-artist">{artist}</p>
        {album && <p className="detail-album">Album: {album}</p>}
        <p className="detail-ns">{selectedEntity.ns} · {selectedEntity.pk}</p>
        {spotifyUrl && (
          <a className="room-button room-button--accent" href={spotifyUrl} target="_blank" rel="noreferrer">
            Open in Spotify
          </a>
        )}
      </div>
      {selectedEntity.metadata?.description && (
        <p className="detail-description">{selectedEntity.metadata.description}</p>
      )}
    </div>
  );
};
