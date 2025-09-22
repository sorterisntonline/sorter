import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchEntityWithChildren } from '../fetchers/entityEndpoints';

function EntityDetail() {
  const { pk_namespace, pk } = useParams();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['entity', pk_namespace, pk],
    queryFn: () => fetchEntityWithChildren({ pk_namespace, pk }),
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <div className="text-gray-500">Loading…</div>;
  if (isError) return <div className="text-red-600">Error: {String(error?.message || error)}</div>;

  const entity = data?.entity;
  const children = data?.children || [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{entity?.title || pk}</h1>
          <div className="text-sm text-gray-500">{pk_namespace} / {pk}</div>
        </div>
        <Link to="/" className="text-blue-600 hover:underline">Back to Roots</Link>
      </div>

      <section className="space-y-2">
        <h2 className="text-xl font-medium">Children</h2>
        {children.length === 0 ? (
          <div className="text-gray-500">No children</div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {children.map((c) => (
              <li key={`${c.pk_namespace}::${c.pk}`} className="border rounded-lg p-4 bg-white hover:shadow">
                <div className="flex items-center space-x-3">
                  {c.profile_picture_url ? (
                    <img src={c.profile_picture_url} alt={c.title || c.pk} className="w-12 h-12 rounded object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center text-gray-400">•</div>
                  )}
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.title || c.pk}</div>
                    <div className="text-xs text-gray-500 truncate">{c.pk_namespace} / {c.pk}</div>
                  </div>
                </div>
                <div className="mt-3">
                  <Link
                    to={`/entity/${encodeURIComponent(c.pk_namespace)}/${encodeURIComponent(c.pk)}`}
                    className="text-blue-600 hover:underline"
                  >
                    View children
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default EntityDetail;

