import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';

interface VoteRecord {
  created_at: string;
  magnitude: number;
}

interface VoteProgress {
  totalVotes: number;
  votesToday: number;
}

export const useVoteProgress = () => {
  const auth = useAuth();
  const userId = auth.user?.id;

  const voteQuery = useQuery<VoteRecord[]>({
    queryKey: ['vote-history', userId],
    queryFn: async () => {
      if (!userId) return [];
      const response = await fetch(`/api/vote?user_id=${userId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch vote history');
      }
      return response.json();
    },
    enabled: !!userId,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const progress: VoteProgress = useMemo(() => {
    const votes = voteQuery.data ?? [];
    const totalVotes = votes.length;
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const votesToday = votes.filter((vote) => vote.created_at.startsWith(todayKey)).length;

    return { totalVotes, votesToday };
  }, [voteQuery.data]);

  return {
    progress,
    isLoading: voteQuery.isLoading,
  };
};
