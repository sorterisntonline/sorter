import React from 'react';
import { FinderColumn } from '../hooks/useFinderNavigation';
import { Entity } from '../api/entity';
import { getEntityRenderer } from '../renderers/entityRenderers';

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

  return (
    <div
      style={{
        width: '250px',
        borderRight: '1px solid #ddd',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#f5f5f5',
      }}
    >
      {/* Column Header */}
      <div
        style={{
          padding: '12px',
          borderBottom: '1px solid #ddd',
          backgroundColor: '#fff',
          fontWeight: 'bold',
        }}
      >
        {columnIndex > 0 && onBackClick && (
          <button
            onClick={() => onBackClick(columnIndex - 1)}
            style={{
              marginRight: '8px',
              padding: '4px 8px',
              cursor: 'pointer',
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
        }}
      >
        {column.isLoading && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            Loading...
          </div>
        )}

        {column.error && (
          <div style={{ padding: '20px', color: '#d32f2f' }}>
            Error: {column.error.message}
          </div>
        )}

        {!column.isLoading && !column.error && column.entities.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            No items
          </div>
        )}

        {!column.isLoading &&
          !column.error &&
          column.entities.map((entity) => {
            const entityKey = `${entity.ns}:${entity.pk}`;
            const isSelected = selectedEntity?.ns === entity.ns && selectedEntity?.pk === entity.pk;
            const isVisited = visitedEntities.has(entityKey);
            const renderer = getEntityRenderer(entity);

            return (
              <div key={entityKey}>
                {renderer.renderRow(entity, isSelected, () => onEntityClick(entity, columnIndex))}
                {isVisited && (
                  <div
                    style={{
                      fontSize: '10px',
                      color: '#999',
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

