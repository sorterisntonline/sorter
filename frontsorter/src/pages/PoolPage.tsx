import { PoolManager } from '../components/PoolManager';
import '../styles/pool.css';

export function PoolPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto py-6 px-4">
          <h1 className="text-2xl font-bold text-gray-900">Pool Management</h1>
          <p className="mt-2 text-sm text-gray-600">
            Organize your Spotify tracks into pools for pairwise sorting. 
            Add tracks to your pool (✓) to include them in voting, or block them (✗) to exclude them.
          </p>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto py-8 px-4">
        <PoolManager namespace="spotify" />
      </div>
    </div>
  );
}
