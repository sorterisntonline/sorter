import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuthAPI } from '../api/auth';
import { useStackNavigation } from '../hooks/useStackNavigation';
import { StackNavigation } from '../components/StackNavigation';
import { VoteWorkspace } from '../components/VoteWorkspace';

export default function FinderVotePage() {
  const stack = useStackNavigation();

  // Get current user
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: AuthAPI.getMe,
    refetchOnWindowFocus: false,
  });

  const handleBreadcrumbClick = (index: number) => {
    stack.navigateToBreadcrumb(index);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: '#000' }}>
      {/* Left: Stack Navigation */}
      <div style={{ flexShrink: 0 }}>
        <StackNavigation
          breadcrumbs={stack.breadcrumbs}
          currentParent={stack.currentParent}
          children={stack.children}
          isLoading={stack.isLoading}
          error={stack.error}
          onEntityClick={stack.navigateToEntity}
          onNavigateUp={stack.navigateUp}
          onNavigateToRoot={stack.navigateToRoot}
          onBreadcrumbClick={handleBreadcrumbClick}
        />
      </div>

      {/* Right: Voting Workspace */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#000' }}>
        <VoteWorkspace parentEntity={stack.currentParent} user={user} />
      </div>
    </div>
  );
}

