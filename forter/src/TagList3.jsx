import useSWR from "swr";
import { useLocation } from "wouter";
import { Modal } from "./Modal";
import { useState } from "react";
import { Spotify } from "./integrations/Spotify";
import { Youtube } from "./integrations/Youtube";
import { Linear } from "./integrations/Linear";
import { RedditLogo } from "./RedditLogo";
import { dark_mode } from "./Profile";
import React from 'react';

const LinearLogo = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" width="18" className="m-1" height="18" viewBox="0 0 100 100"> <path fill="#5E6AD2" d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857L39.3342 97.1782c.6889.6889.0915 1.8189-.857 1.5964C20.0515 94.4522 5.54779 79.9485 1.22541 61.5228ZM.00189135 46.8891c-.01764375.2833.08887215.5599.28957165.7606L52.3503 99.7085c.2007.2007.4773.3075.7606.2896 2.3692-.1476 4.6938-.46 6.9624-.9259.7645-.157 1.0301-1.0963.4782-1.6481L2.57595 39.4485c-.55186-.5519-1.49117-.2863-1.648174.4782-.465915 2.2686-.77832 4.5932-.92588465 6.9624ZM4.21093 29.7054c-.16649.3738-.08169.8106.20765 1.1l64.77602 64.776c.2894.2894.7262.3742 1.1.2077 1.7861-.7956 3.5171-1.6927 5.1855-2.684.5521-.328.6373-1.0867.1832-1.5407L8.43566 24.3367c-.45409-.4541-1.21271-.3689-1.54074.1832-.99132 1.6684-1.88843 3.3994-2.68399 5.1855ZM12.6587 18.074c-.3701-.3701-.393-.9637-.0443-1.3541C21.7795 6.45931 35.1114 0 49.9519 0 77.5927 0 100 22.4073 100 50.0481c0 14.8405-6.4593 28.1724-16.7199 37.3375-.3903.3487-.984.3258-1.3542-.0443L12.6587 18.074Z" /></svg>

const fetcher = (arg) => fetch(arg).then((res) => res.json());

// Helper component for the tree node
const TreeNode = ({ node, depth = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  
  return (
    <div className="select-none">
      <div 
        className="flex items-center hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 cursor-pointer"
        style={{ paddingLeft: `${depth * 20}px` }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {hasChildren && (
          <span className="mr-2 w-4 inline-block">
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        {!hasChildren && <span className="mr-2 w-4 inline-block">•</span>}
        <span>{node.title}</span>
        <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">
          ({node.vote_count} votes)
        </span>
      </div>
      
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode 
              key={child.id} 
              node={child} 
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const TagList3 = () => {
  const [location, navigate] = useLocation();
  const { data, error, isLoading } = useSWR("/api/hierarchy", fetcher);
  
  return (
    <div className="dark:text-white w-full max-w-2xl py-4">
      <div 
        className="cursor-pointer mb-4"
        onClick={() => navigate("/namespace/tag-hierarchy")}
      >
        <div className="px-3 py-1 bg-purple-200 dark:bg-purple-950 hover:bg-purple-300 dark:hover:bg-purple-900 transition-colors w-fit">
          Vote on Tag Hierarchy
        </div>
      </div>

      <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
        {data && data.map((node) => (
          <TreeNode key={node.id} node={node} />
        ))}
      </div>
    </div>
  );
};
