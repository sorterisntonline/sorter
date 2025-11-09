import React from 'react';
import { Entity } from '../api/entity';

export interface EntityRenderer {
  // Render a row in the column list
  renderRow: (entity: Entity, isSelected: boolean, onClick: () => void) => React.ReactNode;
  
  // Render entity details in the workspace
  renderDetails: (entity: Entity) => React.ReactNode;
  
  // Render voting card (left/right entity in voting interface)
  renderVoteCard: (entity: Entity) => React.ReactNode;
  
  // Get display name for entity
  getDisplayName: (entity: Entity) => string;
  
  // Get icon/badge for namespace
  getIcon?: (entity: Entity) => React.ReactNode;
}

// Default renderer for unknown namespaces
const defaultRenderer: EntityRenderer = {
  renderRow: (entity, isSelected, onClick) => (
    <div
      key={`${entity.ns}:${entity.pk}`}
      onClick={onClick}
      style={{
        padding: '8px 12px',
        cursor: 'pointer',
        backgroundColor: isSelected ? '#333' : 'transparent',
        borderBottom: '1px solid #333',
        color: '#fff',
      }}
    >
      <div style={{ fontWeight: isSelected ? 'bold' : 'normal', color: '#fff' }}>
        {entity.title || entity.pk}
      </div>
      <div style={{ fontSize: '12px', color: '#999' }}>
        {entity.ns} / {entity.pk}
      </div>
    </div>
  ),
  
  renderDetails: (entity) => (
    <div style={{ color: '#fff' }}>
      <h3 style={{ color: '#fff' }}>{entity.title || entity.pk}</h3>
      <p style={{ color: '#999' }}>{entity.ns} / {entity.pk}</p>
      {entity.metadata && (
        <pre style={{ color: '#fff', backgroundColor: '#1a1a1a', padding: '10px', borderRadius: '4px' }}>{JSON.stringify(entity.metadata, null, 2)}</pre>
      )}
    </div>
  ),
  
  renderVoteCard: (entity) => (
    <div style={{ padding: '20px', textAlign: 'center', color: '#fff' }}>
      {entity.profile_picture_url && (
        <img
          src={entity.profile_picture_url}
          alt={entity.title || entity.pk}
          style={{ maxWidth: '200px', marginBottom: '10px' }}
        />
      )}
      <h3 style={{ color: '#fff' }}>{entity.title || entity.pk}</h3>
      <p style={{ color: '#999' }}>{entity.ns} / {entity.pk}</p>
    </div>
  ),
  
  getDisplayName: (entity) => entity.title || entity.pk,
};

// Spotify renderer
const spotifyRenderer: EntityRenderer = {
  renderRow: (entity, isSelected, onClick) => {
    const artist = entity.metadata?.artists?.[0]?.name || entity.metadata?.artist || 'Unknown Artist';
    const albumArt = entity.metadata?.album?.images?.[0]?.url || entity.metadata?.images?.[0]?.url || entity.profile_picture_url;
    
    return (
      <div
        key={`${entity.ns}:${entity.pk}`}
        onClick={onClick}
        style={{
          padding: '8px 12px',
          cursor: 'pointer',
          backgroundColor: isSelected ? '#333' : 'transparent',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        {albumArt && (
          <img
            src={albumArt}
            alt={entity.title || entity.pk}
            style={{ width: '40px', height: '40px', borderRadius: '4px' }}
          />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: isSelected ? 'bold' : 'normal', color: '#fff' }}>
            {entity.title || entity.pk}
          </div>
          <div style={{ fontSize: '12px', color: '#999' }}>{artist}</div>
        </div>
      </div>
    );
  },
  
  renderDetails: (entity) => {
    const artist = entity.metadata?.artists?.[0]?.name || entity.metadata?.artist || 'Unknown Artist';
    const albumArt = entity.metadata?.album?.images?.[0]?.url || entity.metadata?.images?.[0]?.url || entity.profile_picture_url;
    
    return (
      <div style={{ color: '#fff' }}>
        {albumArt && (
          <img
            src={albumArt}
            alt={entity.title || entity.pk}
            style={{ maxWidth: '300px', marginBottom: '20px' }}
          />
        )}
        <h3 style={{ color: '#fff' }}>{entity.title || entity.pk}</h3>
        <p style={{ color: '#999' }}>{artist}</p>
        {entity.metadata?.album && (
          <p style={{ color: '#999' }}>Album: {entity.metadata.album.name}</p>
        )}
      </div>
    );
  },
  
  renderVoteCard: (entity) => {
    const artist = entity.metadata?.artists?.[0]?.name || entity.metadata?.artist || 'Unknown Artist';
    const albumArt = entity.metadata?.album?.images?.[0]?.url || entity.metadata?.images?.[0]?.url || entity.profile_picture_url;
    
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#fff' }}>
        {albumArt && (
          <img
            src={albumArt}
            alt={entity.title || entity.pk}
            style={{ maxWidth: '200px', marginBottom: '10px', borderRadius: '8px' }}
          />
        )}
        <h3 style={{ color: '#fff' }}>{entity.title || entity.pk}</h3>
        <p style={{ color: '#999' }}>{artist}</p>
      </div>
    );
  },
  
  getDisplayName: (entity) => entity.title || entity.pk || 'Unknown Track',
};

// Registry of renderers by namespace prefix
const rendererRegistry: Map<string, EntityRenderer> = new Map([
  ['spotify', spotifyRenderer],
]);

/**
 * Get renderer for an entity based on its namespace
 */
export function getEntityRenderer(entity: Entity): EntityRenderer {
  // Check for exact namespace match first
  if (rendererRegistry.has(entity.ns)) {
    return rendererRegistry.get(entity.ns)!;
  }
  
  // Check for namespace prefix (e.g., "spotify.track" -> "spotify")
  const namespaceParts = entity.ns.split('.');
  for (let i = namespaceParts.length; i > 0; i--) {
    const prefix = namespaceParts.slice(0, i).join('.');
    if (rendererRegistry.has(prefix)) {
      return rendererRegistry.get(prefix)!;
    }
  }
  
  return defaultRenderer;
}

/**
 * Register a new namespace renderer
 */
export function registerNamespaceRenderer(prefix: string, renderer: EntityRenderer): void {
  rendererRegistry.set(prefix, renderer);
}

