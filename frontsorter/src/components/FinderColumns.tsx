import React from 'react';
import { FinderColumn as FinderColumnType, UseFinderNavigationReturn } from '../hooks/useFinderNavigation';
import { Entity } from '../api/entity';
import { FinderColumnComponent } from './FinderColumn';

interface FinderColumnsProps {
  finder: UseFinderNavigationReturn;
  selectedEntity: Entity | null;
}

export function FinderColumns({ finder, selectedEntity }: FinderColumnsProps) {
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflowX: 'auto',
        backgroundColor: '#f5f5f5',
      }}
    >
      {finder.columns.map((column, index) => (
        <FinderColumnComponent
          key={index}
          column={column}
          columnIndex={index}
          selectedEntity={selectedEntity}
          visitedEntities={finder.visitedEntities}
          onEntityClick={finder.navigateToEntity}
          onBackClick={finder.goBack}
        />
      ))}
    </div>
  );
}

