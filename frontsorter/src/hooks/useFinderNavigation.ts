import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Entity, EntityAPI } from '../api/entity';
import { useQuery } from '@tanstack/react-query';

export interface FinderColumn {
  parent: Entity | null;
  entities: Entity[];
  isLoading: boolean;
  error: Error | null;
}

export interface UseFinderNavigationReturn {
  columns: FinderColumn[];
  activeColumnIndex: number;
  visitedEntities: Set<string>;
  navigateToEntity: (entity: Entity, columnIndex: number) => void;
  navigateToRoot: () => void;
  goBack: (toIndex: number) => void;
  refreshColumn: (index: number) => void;
}

/**
 * Hook for managing Finder-style navigation through the entity graph
 */
export function useFinderNavigation(): UseFinderNavigationReturn {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [columns, setColumns] = useState<FinderColumn[]>([]);
  const [visitedEntities, setVisitedEntities] = useState<Set<string>>(new Set());

  // Parse path from URL: "ns1:pk1/ns2:pk2" -> [{ns: ns1, pk: pk1}, {ns: ns2, pk: pk2}]
  const parsePath = useCallback((path: string | null): Array<{ ns: string; pk: string }> => {
    if (!path) return [];
    return path.split('/').map(segment => {
      const [ns, pk] = segment.split(':');
      return { ns: decodeURIComponent(ns), pk: decodeURIComponent(pk) };
    });
  }, []);

  // Encode path to URL: [{ns: ns1, pk: pk1}, {ns: ns2, pk: pk2}] -> "ns1:pk1/ns2:pk2"
  const encodePath = useCallback((path: Array<{ ns: string; pk: string }>): string => {
    return path.map(({ ns, pk }) => `${encodeURIComponent(ns)}:${encodeURIComponent(pk)}`).join('/');
  }, []);

  // Get root entities
  const { data: rootEntities, isLoading: rootsLoading } = useQuery({
    queryKey: ['entity-roots'],
    queryFn: EntityAPI.getRootEntities,
    refetchOnWindowFocus: false,
  });

  // Initialize or update columns based on URL path
  useEffect(() => {
    const path = parsePath(searchParams.get('path'));
    
    if (path.length === 0) {
      // Show root entities
      if (rootEntities) {
        setColumns([{
          parent: null,
          entities: rootEntities,
          isLoading: false,
          error: null,
        }]);
      } else if (rootsLoading) {
        setColumns([{
          parent: null,
          entities: [],
          isLoading: true,
          error: null,
        }]);
      }
      return;
    }

    // Build columns for the path
    const buildColumns = async () => {
      const newColumns: FinderColumn[] = [];
      const newVisited = new Set<string>();

      // First column: root entities
      if (rootEntities) {
        newColumns.push({
          parent: null,
          entities: rootEntities,
          isLoading: false,
          error: null,
        });
      } else {
        newColumns.push({
          parent: null,
          entities: [],
          isLoading: true,
          error: null,
        });
      }

      // Load each entity in the path and its children
      for (let i = 0; i < path.length; i++) {
        const { ns, pk } = path[i];
        const entityKey = `${ns}:${pk}`;
        newVisited.add(entityKey);

        try {
          const entityData = await EntityAPI.getEntity(ns, pk, false, true);
          const children = entityData.children || [];
          
          newColumns.push({
            parent: entityData.entity,
            entities: children,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          newColumns.push({
            parent: null, // We don't have the parent entity if fetch failed
            entities: [],
            isLoading: false,
            error: error as Error,
          });
        }
      }

      setColumns(newColumns);
      setVisitedEntities(newVisited);
    };

    if (rootEntities || rootsLoading) {
      buildColumns();
    }
  }, [searchParams, rootEntities, rootsLoading, parsePath]);

  const navigateToEntity = useCallback((entity: Entity, columnIndex: number) => {
    const entityKey = `${entity.ns}:${entity.pk}`;
    const newVisited = new Set(visitedEntities);
    newVisited.add(entityKey);

    // Truncate columns to the clicked column, then add new one
    const currentPath = parsePath(searchParams.get('path'));
    const newPath = currentPath.slice(0, columnIndex);
    newPath.push({ ns: entity.ns, pk: entity.pk });

    setSearchParams({ path: encodePath(newPath) });
    setVisitedEntities(newVisited);
  }, [searchParams, setSearchParams, visitedEntities, parsePath, encodePath]);

  const navigateToRoot = useCallback(() => {
    setSearchParams({});
    setVisitedEntities(new Set());
  }, [setSearchParams]);

  const goBack = useCallback((toIndex: number) => {
    const currentPath = parsePath(searchParams.get('path'));
    const newPath = currentPath.slice(0, toIndex);
    
    if (newPath.length === 0) {
      setSearchParams({});
    } else {
      setSearchParams({ path: encodePath(newPath) });
    }
  }, [searchParams, setSearchParams, parsePath, encodePath]);

  const refreshColumn = useCallback(async (index: number) => {
    if (index === 0) {
      // Refresh root entities
      window.location.reload(); // Simple approach for now
      return;
    }

    const column = columns[index];
    if (!column || !column.parent) return;

    setColumns(prev => {
      const newColumns = [...prev];
      newColumns[index] = {
        ...newColumns[index],
        isLoading: true,
      };
      return newColumns;
    });

    try {
      const entityData = await EntityAPI.getEntity(
        column.parent.ns,
        column.parent.pk,
        false,
        true
      );
      const children = entityData.children || [];

      setColumns(prev => {
        const newColumns = [...prev];
        newColumns[index] = {
          parent: column.parent,
          entities: children,
          isLoading: false,
          error: null,
        };
        return newColumns;
      });
    } catch (error) {
      setColumns(prev => {
        const newColumns = [...prev];
        newColumns[index] = {
          ...newColumns[index],
          isLoading: false,
          error: error as Error,
        };
        return newColumns;
      });
    }
  }, [columns]);

  const activeColumnIndex = columns.length > 0 ? columns.length - 1 : 0;

  return {
    columns,
    activeColumnIndex,
    visitedEntities,
    navigateToEntity,
    navigateToRoot,
    goBack,
    refreshColumn,
  };
}

