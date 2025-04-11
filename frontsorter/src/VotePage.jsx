import { useSearchParams, Link } from 'react-router-dom';

function VotePage() {
    const [searchParams] = useSearchParams();
    const parentNs = searchParams.get('parent_ns');
    const parentPk = searchParams.get('parent_pk');
    const childType = searchParams.get('type');

    // TODO: Fetch children based on parentNs, parentPk, childType
    // TODO: Implement voting UI and logic

    return (
        <div className="p-4">
            <h2 className="text-xl font-bold mb-4">Vote Page</h2>
            <p>Parent: {parentNs}/{parentPk}</p>
            <p>Voting on type: {childType}</p>
            <p className="mt-4 italic text-gray-500">(Voting UI will go here)</p>
             <Link to={`/?pk_namespace=${encodeURIComponent(parentNs)}&pk=${encodeURIComponent(parentPk)}`} className="text-blue-600 hover:underline mt-4 inline-block">
                 &larr; Back to Parent
             </Link>
        </div>
    );
}

export { VotePage };