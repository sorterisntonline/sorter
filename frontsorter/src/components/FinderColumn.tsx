import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FinderColumn } from '../hooks/useFinderNavigation';
import { Entity } from '../api/entity';
import { getEntityRenderer } from '../renderers/entityRenderers';
import { RankingAPI } from '../api/ranking';

interface FinderColumnProps {
  column: FinderColumn;
  columnIndex: number;
  selectedEntity: Entity | null;
  visitedEntities: Set<string>;
  onEntityClick: (entity: Entity, columnIndex: number) => void;
  onBackClick?: (toIndex: number) => void;
}

export function FinderColumnComponent({
  column,
  columnIndex,
  selectedEntity,
  visitedEntities,
  onEntityClick,
  onBackClick,
}: FinderColumnProps) {
  const renderer = column.parent ? getEntityRenderer(column.parent) : null;
  const parentTitle = column.parent 
    ? (renderer?.getDisplayName(column.parent) || column.parent.title || `${column.parent.ns}/${column.parent.pk}`)
    : 'Root';

  // Fetch ranking data for this column's parent
  const { data: ranking } = useQuery({
    queryKey: ['ranking', column.parent?.ns, column.parent?.pk],
    queryFn: () => {
      if (!column.parent) return null;
      return RankingAPI.getRanking(column.parent.ns, column.parent.pk);
    },
    enabled: !!column.parent && !column.isLoading && column.entities.length > 0,
    refetchOnWindowFocus: false,
  });

  // Sort entities by ranking score (ranked first, then unranked)
  const sortedEntities = React.useMemo(() => {
    if (!ranking || !column.entities.length) {
      return column.entities;
    }

    // Create maps for quick lookup
    const rankedMap = new Map<string, { rankIndex: number; score: number }>();
    ranking.sorted?.forEach((item: any, index: number) => {
      const key = `${item.identifier.ns}:${item.identifier.pk}`;
      rankedMap.set(key, { rankIndex: index, score: item.score });
    });

    const unrankedSet = new Set<string>();
    ranking.unsorted?.forEach((item: any) => {
      const key = `${item.ns}:${item.pk}`;
      unrankedSet.add(key);
    });

    // Separate ranked and unranked
    const ranked: Array<{ entity: Entity; rankIndex: number; score: number }> = [];
    const unranked: Entity[] = [];

    column.entities.forEach((entity) => {
      const key = `${entity.ns}:${entity.pk}`;
      const rankData = rankedMap.get(key);
      if (rankData) {
        ranked.push({ entity, ...rankData });
      } else if (!unrankedSet.has(key)) {
        // Only add if not explicitly in unsorted (means it might not have votes yet)
        unranked.push(entity);
      }
    });

    // Sort ranked by rankIndex (lower index = higher rank)
    ranked.sort((a, b) => a.rankIndex - b.rankIndex);

    // Combine: ranked first, then unranked
    return [...ranked, ...unranked.map(e => ({ entity: e, rankIndex: -1, score: 0 }))];
  }, [column.entities, ranking]);

  return (
    <div
      style={{
        width: '250px',
        borderRight: '1px solid #333',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#1a1a1a',
      }}
    >
      {/* Column Header */}
      <div
        style={{
          padding: '12px',
          borderBottom: '1px solid #333',
          backgroundColor: '#2a2a2a',
          fontWeight: 'bold',
          color: '#fff',
        }}
      >
        {columnIndex > 0 && onBackClick && (
          <button
            onClick={() => onBackClick(columnIndex - 1)}
            style={{
              marginRight: '8px',
              padding: '4px 8px',
              cursor: 'pointer',
              backgroundColor: '#3a3a3a',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: '4px',
            }}
          >
            ←
          </button>
        )}
        {parentTitle}
      </div>

      {/* Column Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          backgroundColor: '#1a1a1a',
        }}
      >
        {column.isLoading && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
            Loading...
          </div>
        )}

        {column.error && (
          <div style={{ padding: '20px', color: '#ff4444' }}>
            Error: {column.error.message}
          </div>
        )}

        {!column.isLoading && !column.error && column.entities.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
            No items
          </div>
        )}

        {!column.isLoading &&
          !column.error &&
          sortedEntities.map((item, index) => {
            const entity = 'entity' in item ? item.entity : item;
            const entityKey = `${entity.ns}:${entity.pk}`;
            const isSelected = selectedEntity?.ns === entity.ns && selectedEntity?.pk === entity.pk;
            const isVisited = visitedEntities.has(entityKey);
            const renderer = getEntityRenderer(entity);

            // Get ranking score if available
            const rankingScore = 'score' in item && item.score > 0 ? item.score : undefined;
            const rankNumber = 'rankIndex' in item && item.rankIndex >= 0 ? item.rankIndex + 1 : undefined;

            return (
              <div key={entityKey}>
                {renderer.renderRow(entity, isSelected, () => onEntityClick(entity, columnIndex))}
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
                {isVisited && (
                  <div
                    style={{
                      fontSize: '10px',
                      color: '#666',
                      paddingLeft: '12px',
                      paddingBottom: '4px',
                    }}
                  >
                    ↺ visited
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

