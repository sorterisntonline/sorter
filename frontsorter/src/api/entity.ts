const API_BASE = '/api';

export interface Entity {
  user_id: string;
  ns: string;
  pk: string;
  title: string | null;
  profile_picture_url: string | null;
  metadata: any;
  created_at: string | null;
}

export class EntityAPI {
  /**
   * Get root entities (entities with no parents)
   */
  static async getRootEntities(): Promise<Entity[]> {
    const response = await fetch(`${API_BASE}/entity?roots=true`, {
      credentials: 'include',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  /**
   * Get children of a specific entity
   */
  static async getChildren(parentNs: string, parentPk: string): Promise<Entity[]> {
    const response = await fetch(
      `${API_BASE}/entity/${encodeURIComponent(parentNs)}/${encodeURIComponent(parentPk)}?children=true`,
      {
        credentials: 'include',
      }
    );
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.children || [];
  }

  /**
   * Get a single entity with its parents and children
   */
  static async getEntity(
    ns: string,
    pk: string,
    includeParents = false,
    includeChildren = false
  ): Promise<{ entity: Entity; parents?: Entity[]; children?: Entity[] }> {
    const params = new URLSearchParams();
    if (includeParents) params.set('parents', 'true');
    if (includeChildren) params.set('children', 'true');
    
    const url = `${API_BASE}/entity/${encodeURIComponent(ns)}/${encodeURIComponent(pk)}${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url, {
      credentials: 'include',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }
}

