import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { AuthAPI } from '../api/auth';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const RankingHistoryGraph = ({ user, songs }) => {
  
  // Query for ranking history
  const { data: historyData, isLoading, error } = useQuery({
    queryKey: ['ranking-history', user?.handle],
    queryFn: () => AuthAPI.getRankingHistory('sorter.user', user.handle),
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  // Create a map of songs by identifier for quick lookup
  const songsMap = React.useMemo(() => {
    if (!songs) return {};
    const map = {};
    songs.forEach(song => {
      const key = `${song.id}`;
      map[key] = song;
    });
    return map;
  }, [songs]);

  // Process data for Chart.js
  const chartData = React.useMemo(() => {
    if (!historyData?.snapshots || !songs) {
      return { datasets: [], labels: [] };
    }

    const snapshots = historyData.snapshots;
    const labels = snapshots.map((_, index) => `Vote ${index + 1}`);
    
    // Get all unique song identifiers
    const allSongIds = new Set();
    snapshots.forEach(snapshot => {
      snapshot.sorted.forEach(ranked => {
        allSongIds.add(ranked.identifier.pk);
      });
      snapshot.unsorted.forEach(identifier => {
        allSongIds.add(identifier.pk);
      });
    });

    // Generate colors for each song
    const songIds = Array.from(allSongIds);
    const colors = songIds.map((_, index) => 
      `hsl(${(index * 360) / songIds.length}, 70%, 50%)`
    );

    // Create datasets for each song
    const datasets = songIds.map((songId, index) => {
      const song = songsMap[songId];
      const songName = song ? song.title : songId;
      
      // Calculate ranking position for each snapshot
      const data = snapshots.map(snapshot => {
        // Find the song in sorted rankings
        const sortedIndex = snapshot.sorted.findIndex(
          ranked => ranked.identifier.pk === songId
        );
        
        if (sortedIndex !== -1) {
          // Convert to percentile score (1st place = 100, last place approaches 0)
          const totalRanked = snapshot.sorted.length;
          return totalRanked > 1 
            ? 100 - (sortedIndex / (totalRanked - 1)) * 100 
            : 100;
        }
        
        // Check if it's in unsorted (assign 0)
        const isUnsorted = snapshot.unsorted.some(
          identifier => identifier.pk === songId
        );
        return isUnsorted ? 0 : null;
      });

      return {
        label: songName,
        data,
        borderColor: colors[index],
        backgroundColor: colors[index] + '20',
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
      };
    });

    return { datasets, labels };
  }, [historyData, songsMap]);

  // Use the latest snapshot data
  const currentSnapshot = historyData?.snapshots?.[historyData.snapshots.length - 1];

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      mode: 'point',
      intersect: false,
    },
    plugins: {
      legend: {
        display: false, // We'll show our own legend
      },
      title: {
        display: true,
        text: 'Song Rankings Over Time',
        font: {
          size: 16,
          weight: 'bold',
        },
      },
      tooltip: {
        callbacks: {
          title: (tooltipItems) => {
            return tooltipItems[0]?.label || '';
          },
          label: (context) => {
            const value = context.parsed.y;
            if (value === null || value === undefined) return null;
            return `${context.dataset.label}: ${value.toFixed(1)}%`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        title: {
          display: true,
          text: 'Ranking Score (%)',
        },
        grid: {
          color: 'rgba(0,0,0,0.1)',
        },
      },
      x: {
        title: {
          display: true,
          text: 'Votes Timeline',
        },
        grid: {
          color: 'rgba(0,0,0,0.1)',
        },
      },
    },
  };

  // Show full chart data
  const fullChartData = chartData;

  if (isLoading) {
    return (
      <div className="panel-content">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading ranking history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel-content">
        <div className="error-container">
          <p>Error loading ranking history: {error.message}</p>
        </div>
      </div>
    );
  }

  if (!historyData?.snapshots || historyData.snapshots.length === 0) {
    return (
      <div className="panel-content">
        <div className="empty-state">
          <svg className="empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <div className="empty-title">No ranking history</div>
          <p className="empty-description">
            Start voting between songs to see how rankings evolve over time.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-content">
      <div className="ranking-history-header">
        <h3>📈 Ranking Evolution Over Time</h3>
        <p className="panel-subtitle">
          {historyData.snapshots.length} vote{historyData.snapshots.length !== 1 ? 's' : ''} recorded
        </p>
      </div>

      {/* Chart Container */}
      <div className="chart-timeline-container">
        <div className="chart-wrapper">
          <Line data={fullChartData} options={chartOptions} />
        </div>

        {/* Final Rankings Legend */}
        <div className="rankings-legend">
          <h4>Final Rankings</h4>
          {currentSnapshot?.sorted.length > 0 && (
            <div className="ranked-songs">
              {currentSnapshot.sorted.map((rankedEntity, index) => {
                const song = songsMap[rankedEntity.identifier.pk];
                const color = chartData.datasets.find(d => 
                  d.label === (song?.title || rankedEntity.identifier.pk)
                )?.borderColor || '#666';
                
                return (
                  <div key={index} className="legend-item">
                    <div 
                      className="color-indicator" 
                      style={{ backgroundColor: color }}
                    ></div>
                    <span className="rank-position">#{index + 1}</span>
                    <div className="song-info">
                      <div className="song-title">
                        {song?.title || rankedEntity.identifier.pk}
                      </div>
                      {song?.artist && (
                        <div className="song-artist">{song.artist}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {currentSnapshot?.unsorted.length > 0 && (
            <div className="unranked-songs">
              <h5>Unranked</h5>
              {currentSnapshot.unsorted.map((identifier, index) => {
                const song = songsMap[identifier.pk];
                return (
                  <div key={index} className="unranked-item">
                    <div className="song-info">
                      <div className="song-title">
                        {song?.title || identifier.pk}
                      </div>
                      {song?.artist && (
                        <div className="song-artist">{song.artist}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RankingHistoryGraph;
