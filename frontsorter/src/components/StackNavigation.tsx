import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Entity } from '../api/entity';
import { getEntityRenderer } from '../renderers/entityRenderers';
import { RankingAPI } from '../api/ranking';
import { BreadcrumbItem } from '../hooks/useStackNavigation';

interface BreadcrumbTrailProps {
  breadcrumbs: BreadcrumbItem[];
  currentParent: Entity | null;
  onNavigateUp: () => void;
  onNavigateToRoot: () => void;
  onBreadcrumbClick: (index: number) => void;
}

function BreadcrumbTrail({
  breadcrumbs,
  currentParent,
  onNavigateUp,
  onNavigateToRoot,
  onBreadcrumbClick,
}: BreadcrumbTrailProps) {
  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid #333',
        backgroundColor: '#2a2a2a',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
      }}
    >
      {/* Root button */}
      <button
        onClick={onNavigateToRoot}
        style={{
          padding: '4px 8px',
          cursor: 'pointer',
          backgroundColor: '#3a3a3a',
          color: '#fff',
          border: '1px solid #444',
          borderRadius: '4px',
          fontSize: '12px',
        }}
      >
        Root
      </button>

      {/* Breadcrumb items (path TO current parent, not including current parent) */}
      {breadcrumbs.map((crumb, index) => {
        const renderer = getEntityRenderer(crumb.entity);
        const displayName = renderer.getDisplayName(crumb.entity);
        
        return (
          <React.Fragment key={`${crumb.ns}:${crumb.pk}`}>
            <span style={{ color: '#999' }}>/</span>
            <button
              onClick={() => onBreadcrumbClick(index)}
              style={{
                padding: '4px 8px',
                cursor: 'pointer',
                backgroundColor: 'transparent',
                color: '#fff',
                border: 'none',
                fontSize: '12px',
                textDecoration: 'underline',
              }}
            >
              {displayName}
            </button>
          </React.Fragment>
        );
      })}

      {/* Back button */}
      {(breadcrumbs.length > 0 || currentParent) && (
        <button
          onClick={onNavigateUp}
          style={{
            marginLeft: 'auto',
            padding: '4px 8px',
            cursor: 'pointer',
            backgroundColor: '#3a3a3a',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: '4px',
            fontSize: '12px',
          }}
        >
          ↑ Up
        </button>
      )}
    </div>
  );
}

interface EntityListProps {
  entities: Entity[];
  isLoading: boolean;
  error: Error | null;
  currentParent: Entity | null;
  onEntityClick: (entity: Entity) => void;
}

function EntityList({
  entities,
  isLoading,
  error,
  currentParent,
  onEntityClick,
}: EntityListProps) {
  // Fetch ranking data for current parent
  const { data: ranking } = useQuery({
    queryKey: ['ranking', currentParent?.ns, currentParent?.pk],
    queryFn: () => {
      if (!currentParent) return null;
      return RankingAPI.getRanking(currentParent.ns, currentParent.pk);
    },
    enabled: !!currentParent && entities.length > 0,
    refetchOnWindowFocus: false,
  });

  // Sort entities by ranking score (ranked first, then unranked)
  const sortedEntities = React.useMemo(() => {
    if (!ranking || !entities.length) {
      return entities.map(e => ({ entity: e, rankIndex: -1, score: 0 }));
    }

    // Create maps for quick lookup
    const rankedMap = new Map<string, { rankIndex: number; score: number }>();
    ranking.sorted?.forEach((item: any, index: number) => {
      const key = `${item.identifier.ns}:${item.identifier.pk}`;
      rankedMap.set(key, { rankIndex: index, score: item.score });
    });

    // Separate ranked and unranked
    const ranked: Array<{ entity: Entity; rankIndex: number; score: number }> = [];
    const unranked: Array<{ entity: Entity; rankIndex: number; score: number }> = [];

    entities.forEach((entity) => {
      const key = `${entity.ns}:${entity.pk}`;
      const rankData = rankedMap.get(key);
      if (rankData) {
        ranked.push({ entity, ...rankData });
      } else {
        unranked.push({ entity, rankIndex: -1, score: 0 });
      }
    });

    // Sort ranked by rankIndex (lower index = higher rank)
    ranked.sort((a, b) => a.rankIndex - b.rankIndex);

    // Combine: ranked first, then unranked
    return [...ranked, ...unranked];
  }, [entities, ranking]);

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: '#ff4444' }}>
        Error: {error.message}
      </div>
    );
  }

  if (entities.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
        No items
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#1a1a1a' }}>
      {sortedEntities.map((item, index) => {
        const entity = item.entity;
        const entityKey = `${entity.ns}:${entity.pk}`;
        const renderer = getEntityRenderer(entity);
        const rankingScore = item.score > 0 ? item.score : undefined;
        const rankNumber = item.rankIndex >= 0 ? item.rankIndex + 1 : undefined;

        return (
          <div key={entityKey}>
            {renderer.renderRow(entity, false, () => onEntityClick(entity))}
            {rankingScore !== undefined && rankNumber !== undefined && (
              <div
                style={{
                  fontSize: '10px',
                  color: '#666',
                  paddingLeft: '12px',
                  paddingBottom: '4px',
                }}
              >
                #{rankNumber} • {rankingScore.toFixed(4)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface StackNavigationProps {
  breadcrumbs: BreadcrumbItem[];
  currentParent: Entity | null;
  children: Entity[];
  isLoading: boolean;
  error: Error | null;
  onEntityClick: (entity: Entity) => void;
  onNavigateUp: () => void;
  onNavigateToRoot: () => void;
  onBreadcrumbClick: (index: number) => void;
}

export function StackNavigation({
  breadcrumbs,
  currentParent,
  children,
  isLoading,
  error,
  onEntityClick,
  onNavigateUp,
  onNavigateToRoot,
  onBreadcrumbClick,
}: StackNavigationProps) {
  return (
    <div
      style={{
        width: '300px',
        borderRight: '1px solid #333',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#1a1a1a',
      }}
    >
      <BreadcrumbTrail
        breadcrumbs={breadcrumbs}
        currentParent={currentParent}
        onNavigateUp={onNavigateUp}
        onNavigateToRoot={onNavigateToRoot}
        onBreadcrumbClick={onBreadcrumbClick}
      />
      <EntityList
        entities={children}
        isLoading={isLoading}
        error={error}
        currentParent={currentParent}
        onEntityClick={onEntityClick}
      />
    </div>
  );
}

