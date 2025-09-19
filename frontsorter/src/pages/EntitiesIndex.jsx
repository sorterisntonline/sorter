import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllEntities, fetchAllRelationships } from '../fetchers/entityEndpoints';
import { AuthAPI } from '../api/auth';

function EntitiesIndex() {
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const queryClient = useQueryClient();
  
  const entitiesQuery = useQuery({ queryKey: ['entities'], queryFn: fetchAllEntities, refetchOnWindowFocus: false });
  const relationshipsQuery = useQuery({ queryKey: ['relationships'], queryFn: fetchAllRelationships, refetchOnWindowFocus: false });

  const handleImportSongs = async () => {
    setIsImporting(true);
    setImportMessage('');
    
    try {
      const result = await AuthAPI.importRecentSongs();
      setImportMessage(result.message);
      
      // Refresh entities and relationships data
      queryClient.invalidateQueries(['entities']);
      queryClient.invalidateQueries(['relationships']);
    } catch (error) {
      setImportMessage(`Error: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  if (entitiesQuery.isLoading || relationshipsQuery.isLoading) {
    return <div className="text-gray-500">Loading…</div>;
  }

  if (entitiesQuery.isError) {
    return <div className="text-red-600">Error loading entities: {String(entitiesQuery.error?.message || entitiesQuery.error)}</div>;
  }
  if (relationshipsQuery.isError) {
    return <div className="text-red-600">Error loading relationships: {String(relationshipsQuery.error?.message || relationshipsQuery.error)}</div>;
  }

  const entities = entitiesQuery.data || [];
  const relationships = relationshipsQuery.data || [];

  // Build a set of keys for entities that appear as children in any relationship
  const childKeySet = new Set(
    relationships.map(r => `${r.child_pk_namespace}::${r.child_pk}`)
  );

  // Root entities = those that never appear as a child
  const roots = entities.filter(e => !childKeySet.has(`${e.pk_namespace}::${e.pk}`));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Entities</h1>
          <p className="text-sm text-gray-600">Entities with no parents</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleImportSongs}
            disabled={isImporting}
            className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            {isImporting ? 'Importing...' : 'Import Spotify Songs'}
          </button>
          <Link
            to="/entity/new"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Create Entity
          </Link>
        </div>
      </div>

      {importMessage && (
        <div className={`p-4 rounded-md ${importMessage.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {importMessage}
        </div>
      )}

      {roots.length === 0 ? (
        <div className="text-gray-500">No root entities found.</div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roots.map((e) => (
            <li key={`${e.pk_namespace}::${e.pk}`} className="border rounded-lg p-4 bg-white hover:shadow">
              <div className="flex items-center space-x-3">
                {e.profile_picture_url ? (
                  <img src={e.profile_picture_url} alt={e.title || e.pk} className="w-12 h-12 rounded object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center text-gray-400">•</div>
                )}
                <div className="min-w-0">
                  <div className="font-medium truncate">{e.title || e.pk}</div>
                  <div className="text-xs text-gray-500 truncate">{e.pk_namespace} / {e.pk}</div>
                </div>
              </div>
              <div className="mt-3">
                <Link
                  to={`/entity/${encodeURIComponent(e.pk_namespace)}/${encodeURIComponent(e.pk)}`}
                  className="text-blue-600 hover:underline"
                >
                  View children
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default EntitiesIndex;

