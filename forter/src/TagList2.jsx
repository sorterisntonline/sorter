import useSWR from "swr";
import { useLocation } from "wouter";
import { Modal } from "./Modal";
import { useState } from "react";
import { Spotify } from "./integrations/Spotify";
import { Youtube } from "./integrations/Youtube";
import { Linear } from "./integrations/Linear";
import { RedditLogo } from "./RedditLogo";
import { dark_mode } from "./utils/themeUtils";
import React from 'react';
import { TagForm } from './TagForm';

const LinearLogo = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" width="18" className="m-1" height="18" viewBox="0 0 100 100"> <path fill="#5E6AD2" d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857L39.3342 97.1782c.6889.6889.0915 1.8189-.857 1.5964C20.0515 94.4522 5.54779 79.9485 1.22541 61.5228ZM.00189135 46.8891c-.01764375.2833.08887215.5599.28957165.7606L52.3503 99.7085c.2007.2007.4773.3075.7606.2896 2.3692-.1476 4.6938-.46 6.9624-.9259.7645-.157 1.0301-1.0963.4782-1.6481L2.57595 39.4485c-.55186-.5519-1.49117-.2863-1.648174.4782-.465915 2.2686-.77832 4.5932-.92588465 6.9624ZM4.21093 29.7054c-.16649.3738-.08169.8106.20765 1.1l64.77602 64.776c.2894.2894.7262.3742 1.1.2077 1.7861-.7956 3.5171-1.6927 5.1855-2.684.5521-.328.6373-1.0867.1832-1.5407L8.43566 24.3367c-.45409-.4541-1.21271-.3689-1.54074.1832-.99132 1.6684-1.88843 3.3994-2.68399 5.1855ZM12.6587 18.074c-.3701-.3701-.393-.9637-.0443-1.3541C21.7795 6.45931 35.1114 0 49.9519 0 77.5927 0 100 22.4073 100 50.0481c0 14.8405-6.4593 28.1724-16.7199 37.3375-.3903.3487-.984.3258-1.3542-.0443L12.6587 18.074Z" /></svg>

export const SingleTag = ({ tagg, isEvenRow }) => {
  const [location, navigate] = useLocation();

  return (
    <tr 
      onClick={() => navigate("/" + tagg.id + "/" + tagg.slug)}
      className={`cursor-pointer ${
        isEvenRow 
          ? "bg-purple-50 dark:bg-purple-950/30" 
          : "bg-white dark:bg-transparent"
      }`}
    >
      <td className="flex items-center">
        {tagg.domain_pk_namespace === "spotify.playlist" && 
          <img width="18" className="mr-2" src="https://upload.wikimedia.org/wikipedia/commons/1/19/Spotify_logo_without_text.svg" />}
        {tagg.domain_pk_namespace === "linear.project" && 
          <LinearLogo />}
        {tagg.domain_pk_namespace === "reddit.sub" && 
          <RedditLogo />}
        {tagg.domain_pk_namespace === "youtube.liked" && 
          <img width="18" className="mr-2" src="https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg" />}
        <span>
          {tagg.ns && (
            <span className="text-gray-600 dark:text-gray-400">
              #{tagg.ns}/
            </span>
          )}
          {!tagg.ns && "#"}
          {tagg.slug}
        </span>
      </td>
      <td className="text-center">{tagg.item_count || 0}</td>
      <td className="text-center">{tagg.vote_count || 0}</td>
    </tr>
  );
}

const fetcher = (arg) => fetch(arg).then((res) => res.json());
export const TagList2 = () => {
  const { data, error, isLoading, mutate } = useSWR("/api/tag", fetcher);
  const [location, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState({
    key: 'votes',
    direction: 'desc'
  });

  if (isLoading) return <h1> loading... </h1>;
  if (error) return <h1> error </h1>;

  const groupAndSortTags = (tags) => {
    // First, filter by search term
    const filteredTags = tags.filter((tagg) => {
      return tagg.slug.toLowerCase().includes(search.toLowerCase()) || 
             tagg.ns?.toLowerCase().includes(search.toLowerCase());
    });

    // Group tags by namespace
    const groupedTags = filteredTags.reduce((acc, tag) => {
      const ns = tag.ns || '';
      if (!acc[ns]) {
        acc[ns] = [];
      }
      acc[ns].push(tag);
      return acc;
    }, {});

    // Sort tags within each namespace
    Object.keys(groupedTags).forEach(ns => {
      groupedTags[ns].sort((a, b) => {
        if (sortConfig.key === 'slug') {
          return sortConfig.direction === 'asc' 
            ? a.slug.localeCompare(b.slug)
            : b.slug.localeCompare(a.slug);
        }
        if (sortConfig.key === 'items') {
          return sortConfig.direction === 'asc'
            ? (a.item_count || 0) - (b.item_count || 0)
            : (b.item_count || 0) - (a.item_count || 0);
        }
        if (sortConfig.key === 'votes') {
          return sortConfig.direction === 'asc'
            ? (a.vote_count || 0) - (b.vote_count || 0)
            : (b.vote_count || 0) - (a.vote_count || 0);
        }
        return 0;
      });
    });

    // Convert to array and sort namespaces by combined item count
    return Object.entries(groupedTags)
      .map(([ns, tags]) => ({
        namespace: ns,
        tags,
        totalItems: tags.reduce((sum, tag) => sum + (tag.item_count || 0), 0),
        totalVotes: tags.reduce((sum, tag) => sum + (tag.vote_count || 0), 0)
      }))
      .sort((a, b) => {
        // First sort by whether they have a namespace
        if ((a.namespace === '') !== (b.namespace === '')) {
          return a.namespace === '' ? 1 : -1;
        }
        // Then sort by total items
        return b.totalItems - a.totalItems;
      });
  };

  const renderTagGroup = (groupedTags) => {
    return groupedTags.map((group, groupIndex) => (
      <React.Fragment key={group.namespace}>
        {group.tags.map((tagg, index) => (
          <SingleTag 
            key={tagg.id} 
            tagg={tagg} 
            isEvenRow={(groupIndex + index) % 2 === 0}
          />
        ))}
      </React.Fragment>
    ));
  };

  const sortedPrivateGroups = groupAndSortTags(data.private);
  const sortedUnlistedGroups = groupAndSortTags(data.unlisted);
  const sortedPublicGroups = groupAndSortTags(data.public);

  const requestSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction: 
        current.key === key && current.direction === 'asc' 
          ? 'desc' 
          : 'asc',
    }));
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return '↕️';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const TableHeader = () => (
    <tr className="bg-purple-200 dark:bg-purple-950">
      <th 
        className="text-left cursor-pointer hover:bg-purple-300 dark:hover:bg-purple-900"
        onClick={() => requestSort('slug')}
      >
        Tag {getSortIndicator('slug')}
      </th>
      <th 
        className="cursor-pointer hover:bg-purple-300 dark:hover:bg-purple-900"
        onClick={() => requestSort('items')}
      >
        Items {getSortIndicator('items')}
      </th>
      <th 
        className="cursor-pointer hover:bg-purple-300 dark:hover:bg-purple-900"
        onClick={() => requestSort('votes')}
      >
        Votes {getSortIndicator('votes')}
      </th>
    </tr>
  );

  return (
    <div className="flex flex-col page-padding-top w-full max-w-full overflow-x-hidden">
      {/* Hide integration buttons on mobile */}
      <div className="hidden lg:flex">
        <TagButton mutate={mutate} />
        <Spotify refreshFrontpage={mutate} />
        <Youtube />
        <Linear />
      </div>
      <input 
        className="w-full m-1 p-1 focus:outline-none dark:text-white dark:bg-[#181a1b]" 
        placeholder="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="w-ful">
        {(sortedPrivateGroups.length > 0 || sortedUnlistedGroups.length > 0) && (
          <>
            {sortedPrivateGroups.length > 0 && (
              <div className="">
                <h2 className="text-lg font-semibold dark:text-white mb-2">Private Tags</h2>
                <table className="w-full dark:text-white">
                  <thead>
                    <TableHeader />
                  </thead>
                  <tbody>
                    {renderTagGroup(sortedPrivateGroups)}
                  </tbody>
                </table>
              </div>
            )}
            
            {sortedUnlistedGroups.length > 0 && (
              <div className="">
                <h2 className="text-lg font-semibold dark:text-white mb-2">Unlisted Tags</h2>
                <table className="w-full dark:text-white">
                  <thead>
                    <TableHeader />
                  </thead>
                  <tbody>
                    {renderTagGroup(sortedUnlistedGroups)}
                  </tbody>
                </table>
              </div>
            )}
            
            <div className="border-t border-purple-300 dark:border-purple-700 my-4"></div>
          </>
        )}

        <h2 className="text-lg font-semibold dark:text-white">Public Tags</h2>
        <table className="w-full dark:text-white">
          <thead>
            <TableHeader />
          </thead>
          <tbody>
            {renderTagGroup(sortedPublicGroups)}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TagButton = ({ mutate }) => {
  const [isCreating, setIsCreating] = useState(false);
  return (
    <>
      <Modal isOpen={isCreating} onClose={() => setIsCreating(false)}>
        <TagForm mutate={mutate} onClose={() => setIsCreating(false)} />
      </Modal>
      <div
        className="w-fit cursor-pointer m-1"
        onClick={(_) => setIsCreating(true)}
      >
        <div className="px-3 py-1 bg-purple-200 dark:bg-purple-950 hover:bg-purple-300 dark:hover:bg-purple-900 transition-colors">
          + New Tag
        </div>
      </div>
    </>
  );
};
