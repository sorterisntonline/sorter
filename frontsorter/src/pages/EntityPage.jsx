import React from 'react';
import { useParams } from 'react-router-dom';

function EntityPage() {
    const { pk_namespace, pk } = useParams();
  // TODO: Move EntityDetailsDisplay and related fetching logic here
  return (
    <div>
        <h1 className="text-xl font-semibold">Entity Details Page (Content TBD)</h1>
        <p>Namespace: {pk_namespace}</p>
        <p>PK: {pk}</p>
    </div>
   );
}

export default EntityPage;
