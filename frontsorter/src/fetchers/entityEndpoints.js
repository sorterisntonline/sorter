// --- Entity API Fetchers ---

export const fetchAllEntities = async () => {
  const res = await fetch('/api/entity');
  if (!res.ok) throw new Error(`Failed to fetch entities: ${res.status}`);
  return res.json();
};

export const fetchAllRelationships = async () => {
  const res = await fetch('/api/entity_relationships');
  if (!res.ok) throw new Error(`Failed to fetch relationships: ${res.status}`);
  return res.json();
};

export const fetchEntityWithChildren = async ({ pk_namespace, pk }) => {
  const url = `/api/entity/${encodeURIComponent(pk_namespace)}/${encodeURIComponent(pk)}?children=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch entity: ${res.status}`);
  return res.json();
};

export const createEntity = async (entityData) => {
  const res = await fetch('/api/entity', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(entityData),
  });
  if (!res.ok) throw new Error(`Failed to create entity: ${res.status}`);
  return res.json();
};

