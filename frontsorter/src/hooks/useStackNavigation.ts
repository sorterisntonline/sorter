import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Entity, EntityAPI } from '../api/entity';
import { useQuery } from '@tanstack/react-query';

export interface BreadcrumbItem {
  entity: Entity;
  ns: string;
  pk: string;
}

export interface UseStackNavigationReturn {
  breadcrumbs: BreadcrumbItem[];
  currentParent: Entity | null;
  children: Entity[];
  isLoading: boolean;
  error: Error | null;
  navigateToEntity: (entity: Entity) => void;
  navigateUp: () => void;
  navigateToRoot: () => void;
  navigateToBreadcrumb: (index: number) => void;
}

/**
 * Hook for managing stack/breadcrumb navigation through the entity graph
 */
export function useStackNavigation(): UseStackNavigationReturn {
  const [searchParams, setSearchParams] = useSearchParams();
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [currentParent, setCurrentParent] = useState<Entity | null>(null);
  const [children, setChildren] = useState<Entity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

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

  // Load current context based on URL path
  useEffect(() => {
    const path = parsePath(searchParams.get('path'));
    
    const loadContext = async () => {
      setIsLoading(true);
      setError(null);

      try {
        if (path.length === 0) {
          // Root level - show root entities
          setBreadcrumbs([]);
          setCurrentParent(null);
          setChildren(rootEntities || []);
          setIsLoading(rootsLoading);
        } else {
          // Load breadcrumbs and current parent
          const newBreadcrumbs: BreadcrumbItem[] = [];
          
          // Load each entity in the path to build breadcrumbs
          for (let i = 0; i < path.length; i++) {
            const { ns, pk } = path[i];
            const entityData = await EntityAPI.getEntity(ns, pk, false, false);
            newBreadcrumbs.push({
              entity: entityData.entity,
              ns,
              pk,
            });
          }

          // Get children of the last entity in path (current parent)
          const lastPath = path[path.length - 1];
          const currentEntityData = await EntityAPI.getEntity(lastPath.ns, lastPath.pk, false, true);
          
          setBreadcrumbs(newBreadcrumbs);
          setCurrentParent(currentEntityData.entity);
          setChildren(currentEntityData.children || []);
        }
      } catch (err) {
        setError(err as Error);
        setChildren([]);
      } finally {
        setIsLoading(false);
      }
    };

    if (path.length === 0 && rootEntities) {
      // Root level with data ready
      setBreadcrumbs([]);
      setCurrentParent(null);
      setChildren(rootEntities);
      setIsLoading(false);
    } else if (path.length > 0 || rootsLoading) {
      loadContext();
    }
  }, [searchParams, rootEntities, rootsLoading, parsePath]);

  const navigateToEntity = useCallback((entity: Entity) => {
    const currentPath = parsePath(searchParams.get('path'));
    const newPath = [...currentPath, { ns: entity.ns, pk: entity.pk }];
    setSearchParams({ path: encodePath(newPath) });
  }, [searchParams, setSearchParams, parsePath, encodePath]);

  const navigateUp = useCallback(() => {
    const currentPath = parsePath(searchParams.get('path'));
    const newPath = currentPath.slice(0, -1);
    
    if (newPath.length === 0) {
      setSearchParams({});
    } else {
      setSearchParams({ path: encodePath(newPath) });
    }
  }, [searchParams, setSearchParams, parsePath, encodePath]);

  const navigateToRoot = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  const navigateToBreadcrumb = useCallback((index: number) => {
    const currentPath = parsePath(searchParams.get('path'));
    const newPath = currentPath.slice(0, index + 1);
    
    if (newPath.length === 0) {
      setSearchParams({});
    } else {
      setSearchParams({ path: encodePath(newPath) });
    }
  }, [searchParams, setSearchParams, parsePath, encodePath]);

  return {
    breadcrumbs,
    currentParent,
    children,
    isLoading,
    error,
    navigateToEntity,
    navigateUp,
    navigateToRoot,
    navigateToBreadcrumb,
  };
}

