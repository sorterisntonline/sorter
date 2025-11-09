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

// GitHub repository renderer
const githubRenderer: EntityRenderer = {
  renderRow: (entity, isSelected, onClick) => {
    const metadata = entity.metadata || {};
    const owner = metadata.owner || {};
    const ownerAvatar = owner.avatar_url || entity.profile_picture_url;
    const fullName = metadata.full_name || entity.title || entity.pk;
    const description = metadata.description || '';
    const stars = metadata.stargazers_count || 0;
    const language = metadata.language || '';
    
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
        {ownerAvatar && (
          <img
            src={ownerAvatar}
            alt={fullName}
            style={{ width: '32px', height: '32px', borderRadius: '4px' }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: isSelected ? 'bold' : 'normal', color: '#fff', fontSize: '14px' }}>
            {fullName}
          </div>
          {description && (
            <div style={{ fontSize: '11px', color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {description}
            </div>
          )}
          <div style={{ fontSize: '11px', color: '#666', marginTop: '2px', display: 'flex', gap: '8px' }}>
            {stars > 0 && <span>⭐ {stars}</span>}
            {language && <span>• {language}</span>}
          </div>
        </div>
      </div>
    );
  },
  
  renderDetails: (entity) => {
    const metadata = entity.metadata || {};
    const owner = metadata.owner || {};
    const ownerAvatar = owner.avatar_url || entity.profile_picture_url;
    const ownerLogin = owner.login || '';
    const ownerUrl = owner.html_url || '';
    const fullName = metadata.full_name || entity.title || entity.pk;
    const description = metadata.description || '';
    const stars = metadata.stargazers_count || 0;
    const forks = metadata.forks_count || 0;
    const openIssues = metadata.open_issues_count || 0;
    const watchers = metadata.watchers_count || 0;
    const language = metadata.language || '';
    const htmlUrl = metadata.html_url || '';
    const createdAt = metadata.created_at || '';
    const updatedAt = metadata.updated_at || '';
    const pushedAt = metadata.pushed_at || '';
    
    return (
      <div style={{ color: '#fff' }}>
        {/* Header with avatar and name */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
          {ownerAvatar && (
            <img
              src={ownerAvatar}
              alt={fullName}
              style={{ width: '64px', height: '64px', borderRadius: '8px' }}
            />
          )}
          <div style={{ flex: 1 }}>
            <h2 style={{ color: '#fff', margin: '0 0 8px 0', fontSize: '24px' }}>
              {fullName}
            </h2>
            {ownerLogin && (
              <div style={{ marginBottom: '8px' }}>
                <a
                  href={ownerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#58a6ff', textDecoration: 'none' }}
                >
                  @{ownerLogin}
                </a>
              </div>
            )}
            {htmlUrl && (
              <a
                href={htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#58a6ff', textDecoration: 'none', fontSize: '14px' }}
              >
                View on GitHub →
              </a>
            )}
          </div>
        </div>

        {/* Description */}
        {description && (
          <p style={{ color: '#c9d1d9', fontSize: '16px', lineHeight: '1.5', marginBottom: '20px' }}>
            {description}
          </p>
        )}

        {/* Stats */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
          {stars > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#c9d1d9' }}>
              <span>⭐</span>
              <span style={{ fontWeight: 'bold' }}>{stars.toLocaleString()}</span>
              <span style={{ fontSize: '12px', color: '#8b949e' }}>stars</span>
            </div>
          )}
          {forks > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#c9d1d9' }}>
              <span>🍴</span>
              <span style={{ fontWeight: 'bold' }}>{forks.toLocaleString()}</span>
              <span style={{ fontSize: '12px', color: '#8b949e' }}>forks</span>
            </div>
          )}
          {openIssues > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#c9d1d9' }}>
              <span>⚠️</span>
              <span style={{ fontWeight: 'bold' }}>{openIssues.toLocaleString()}</span>
              <span style={{ fontSize: '12px', color: '#8b949e' }}>open issues</span>
            </div>
          )}
          {watchers > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#c9d1d9' }}>
              <span>👁️</span>
              <span style={{ fontWeight: 'bold' }}>{watchers.toLocaleString()}</span>
              <span style={{ fontSize: '12px', color: '#8b949e' }}>watchers</span>
            </div>
          )}
        </div>

        {/* Language and dates */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '14px', color: '#8b949e' }}>
          {language && (
            <div>
              <span style={{ color: '#c9d1d9' }}>Language:</span> {language}
            </div>
          )}
          {createdAt && (
            <div>
              <span style={{ color: '#c9d1d9' }}>Created:</span> {new Date(createdAt).toLocaleDateString()}
            </div>
          )}
          {updatedAt && (
            <div>
              <span style={{ color: '#c9d1d9' }}>Updated:</span> {new Date(updatedAt).toLocaleDateString()}
            </div>
          )}
          {pushedAt && (
            <div>
              <span style={{ color: '#c9d1d9' }}>Last push:</span> {new Date(pushedAt).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
    );
  },
  
  renderVoteCard: (entity) => {
    const metadata = entity.metadata || {};
    const owner = metadata.owner || {};
    const ownerAvatar = owner.avatar_url || entity.profile_picture_url;
    const fullName = metadata.full_name || entity.title || entity.pk;
    const description = metadata.description || '';
    const stars = metadata.stargazers_count || 0;
    const language = metadata.language || '';
    
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#fff' }}>
        {ownerAvatar && (
          <img
            src={ownerAvatar}
            alt={fullName}
            style={{ width: '80px', height: '80px', borderRadius: '8px', marginBottom: '12px' }}
          />
        )}
        <h3 style={{ color: '#fff', marginBottom: '8px', fontSize: '18px' }}>{fullName}</h3>
        {description && (
          <p style={{ color: '#999', fontSize: '12px', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {description}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', fontSize: '12px', color: '#666' }}>
          {stars > 0 && <span>⭐ {stars}</span>}
          {language && <span>• {language}</span>}
        </div>
      </div>
    );
  },
  
  getDisplayName: (entity) => {
    const metadata = entity.metadata || {};
    return metadata.full_name || entity.title || entity.pk || 'Unknown Repository';
  },
};

// Registry of renderers by namespace prefix
const rendererRegistry: Map<string, EntityRenderer> = new Map([
  ['spotify', spotifyRenderer],
  ['github', githubRenderer],
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

