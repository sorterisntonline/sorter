import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuthAPI } from '../api/auth';
import { useFinderNavigation } from '../hooks/useFinderNavigation';
import { FinderColumns } from '../components/FinderColumns';
import { VoteWorkspace } from '../components/VoteWorkspace';
import { Entity } from '../api/entity';

export default function FinderVotePage() {
  const finder = useFinderNavigation();
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);

  // Get current user
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: AuthAPI.getMe,
    refetchOnWindowFocus: false,
  });

  // Determine active entity (rightmost column's parent, or null for root)
  const activeEntity =
    finder.columns.length > 0 && finder.columns[finder.activeColumnIndex]?.parent
      ? finder.columns[finder.activeColumnIndex].parent
      : null;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: '#000' }}>
      {/* Left: Finder Columns */}
      <div style={{ flexShrink: 0 }}>
        <FinderColumns finder={finder} selectedEntity={selectedEntity} />
      </div>

      {/* Right: Voting Workspace */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#000' }}>
        <VoteWorkspace parentEntity={activeEntity} user={user} />
      </div>
    </div>
  );
}

