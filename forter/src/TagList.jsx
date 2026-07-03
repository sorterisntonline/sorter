import useSWR from 'swr';
import { useLocation } from 'wouter';
import { Modal } from './Modal';
import { useState } from 'react';
import { Spotify } from './integrations/Spotify';
import { Youtube } from './integrations/Youtube';
import { Linear } from './integrations/Linear';
import { RedditLogo } from './RedditLogo';
import { TagForm } from './TagForm';
import { Button } from './components/ui/Button';

const LinearLogo = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" width="16" height="16" viewBox="0 0 100 100" className="shrink-0">
    <path fill="#5E6AD2" d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857L39.3342 97.1782c.6889.6889.0915 1.8189-.857 1.5964C20.0515 94.4522 5.54779 79.9485 1.22541 61.5228ZM.00189135 46.8891c-.01764375.2833.08887215.5599.28957165.7606L52.3503 99.7085c.2007.2007.4773.3075.7606.2896 2.3692-.1476 4.6938-.46 6.9624-.9259.7645-.157 1.0301-1.0963.4782-1.6481L2.57595 39.4485c-.55186-.5519-1.49117-.2863-1.648174.4782-.465915 2.2686-.77832 4.5932-.92588465 6.9624ZM4.21093 29.7054c-.16649.3738-.08169.8106.20765 1.1l64.77602 64.776c.2894.2894.7262.3742 1.1.2077 1.7861-.7956 3.5171-1.6927 5.1855-2.684.5521-.328.6373-1.0867.1832-1.5407L8.43566 24.3367c-.45409-.4541-1.21271-.3689-1.54074.1832-.99132 1.6684-1.88843 3.3994-2.68399 5.1855ZM12.6587 18.074c-.3701-.3701-.393-.9637-.0443-1.3541C21.7795 6.45931 35.1114 0 49.9519 0 77.5927 0 100 22.4073 100 50.0481c0 14.8405-6.4593 28.1724-16.7199 37.3375-.3903.3487-.984.3258-1.3542-.0443L12.6587 18.074Z" />
  </svg>
);

const SpotifyIcon = () => (
  <img
    width="16"
    height="16"
    className="shrink-0"
    src="https://upload.wikimedia.org/wikipedia/commons/1/19/Spotify_logo_without_text.svg"
    alt=""
  />
);

const TagButton = ({ mutate }) => {
  const [isCreating, setIsCreating] = useState(false);
  return (
    <>
      <Modal isOpen={isCreating} onClose={() => setIsCreating(false)}>
        <TagForm mutate={mutate} onClose={() => setIsCreating(false)} />
      </Modal>
      <Button variant="outline" size="sm" onClick={() => setIsCreating(true)}>
        + new tag
      </Button>
    </>
  );
};

const integrationIcon = (tagg) => {
  if (tagg.domain_pk_namespace?.startsWith('spotify.')) return <SpotifyIcon />;
  if (tagg.domain_pk_namespace === 'linear.project') return <LinearLogo />;
  if (tagg.domain_pk_namespace === 'reddit.sub') return <RedditLogo />;
  if (tagg.domain_pk_namespace === 'youtube.liked') {
    return (
      <img
        width="16"
        height="16"
        className="shrink-0"
        src="https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg"
        alt=""
      />
    );
  }
  return null;
};

export const SingleTag = ({ tagg }) => {
  const [, navigate] = useLocation();

  return (
    <button
      type="button"
      onClick={() => {
        window.scrollTo(0, 0);
        navigate(`/${tagg.id}/${tagg.slug}`);
      }}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-surface px-3 py-3 text-left transition-colors hover:border-accent/40 hover:bg-accent-soft/30 dark:border-zinc-800 dark:hover:border-accent/40"
    >
      <div className="flex min-w-0 items-center gap-2">
        {integrationIcon(tagg)}
        <span className="truncate font-medium">#{tagg.slug}</span>
      </div>
      <span className="shrink-0 text-xs text-ink-muted">
        {tagg.item_count ?? 0} items · {tagg.vote_count ?? 0} votes
      </span>
    </button>
  );
};

const fetcher = (arg) => fetch(arg).then((res) => res.json());

const TagSection = ({ title, tags }) => {
  if (!tags?.length) return null;
  return (
    <section className="surface-card p-4">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-muted">{title}</h2>
      <div className="flex flex-col gap-2">
        {tags.map((tagg) => (
          <SingleTag key={tagg.id} tagg={tagg} />
        ))}
      </div>
    </section>
  );
};

export const TagList = () => {
  const { data, error, isLoading, mutate } = useSWR('/api/tag', fetcher);
  const [search, setSearch] = useState('');
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-lg">failed to load tags</p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          reload
        </Button>
      </div>
    );
  }

  const sortedArray = [...data.public].sort(
    (a, b) => b.item_count + b.vote_count - (a.item_count + a.vote_count)
  );
  const filteredTags = sortedArray.filter((tagg) =>
    tagg.slug.toLowerCase().includes(search.toLowerCase()) ||
    tagg.ns?.toLowerCase().includes(search.toLowerCase())
  );

  const groups = [...new Set(filteredTags.map((tagg) => tagg.ns))];
  const tagsByGroup = groups.reduce((acc, group) => {
    acc[group] = filteredTags.filter((tagg) => tagg.ns === group);
    return acc;
  }, {});

  groups.sort(
    (a, b) =>
      tagsByGroup[b].reduce((acc, tagg) => acc + tagg.item_count + tagg.vote_count, 0) -
      tagsByGroup[a].reduce((acc, tagg) => acc + tagg.item_count + tagg.vote_count, 0)
  );

  if (groups.includes(null)) {
    groups.splice(groups.indexOf(null), 1);
    groups.push(null);
  }

  return (
    <div className="page flex flex-col gap-4">
      <div className="hidden flex-wrap gap-2 lg:flex">
        <TagButton mutate={mutate} />
        <Spotify refreshFrontpage={mutate} />
        <Youtube />
        <Linear />
      </div>

      <input
        className="h-11 w-full rounded-lg border border-zinc-300 bg-surface px-3 text-sm outline-none ring-accent focus:border-accent focus:ring-2 dark:border-zinc-700"
        placeholder="search tags..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => {
          if (group === null) return null;
          return <TagSection key={group} title={group} tags={tagsByGroup[group]} />;
        })}
      </div>

      {tagsByGroup[null] && <TagSection title="uncategorized" tags={tagsByGroup[null]} />}

      {search === '' && data.private.length > 0 && (
        <TagSection title="private" tags={data.private} />
      )}

      {search === '' && data.unlisted.length > 0 && (
        <TagSection title="unlisted" tags={data.unlisted} />
      )}

      {data.namespaces && (
        <section className="surface-card p-4">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-muted">namespaces</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.namespaces).map(([_, { domain_pk_namespace, count }]) => {
              if (!domain_pk_namespace) return null;
              return (
                <button
                  key={domain_pk_namespace}
                  type="button"
                  onClick={() => navigate(`/namespace/${domain_pk_namespace}`)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  {domain_pk_namespace} ({count})
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
