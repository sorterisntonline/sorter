import { useLocation } from 'wouter';
import { VotesPanel } from './VotesPanel';
import { UserPanel } from './UserPanel';
import { VotePanel } from './VotePanel';
import { AttributePanel } from './AttributePanel';
import { namespace } from './main';
import { ItemsLists } from './ItemsLists';
import { tag, current_attribute } from './App';
import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/solid';
import { Button } from './components/ui/Button';
import { isMobileViewport } from './utils/layout';

const MobileVotesHeader = () => (
  <section className="page border-b border-zinc-200 pb-4 dark:border-zinc-800">
    <div className="mb-3 rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-accent-strong dark:text-accent">
      #{tag.value.tag.ns ? `${tag.value.tag.ns}/` : ''}{tag.value.tag.slug}
    </div>
    <div className="grid gap-3">
      <AttributePanel compact />
      <UserPanel users={tag.value.users_who_voted} compact />
    </div>
  </section>
);

export const Voting = ({ handleError, onSelectItem }) => {
  const [location, setLocation] = useLocation();
  const [showVotesPanel, setShowVotesPanel] = useState(false);

  const filteredVotes =
    tag.value?.votes?.filter((v) => v.attribute === current_attribute.value?.id) || [];
  const sorteditems = tag.value?.sorted || [];
  const unsorteditems = tag.value?.unsorted || [];

  const exitVoting = () => {
    if (namespace.value) {
      setLocation(`/namespace/${namespace.value}`);
    } else {
      setLocation(`/${tag.value.tag.id}/${tag.value.tag.slug}`);
    }
  };

  if (isMobileViewport()) {
    return (
      <div className="min-h-[100dvh] bg-surface">
        <div className={showVotesPanel ? 'hidden' : 'block'}>
          <VotePanel handleError={handleError} isMobile />
          <div className="fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom,0px))] z-fab flex justify-center gap-2 px-4">
            <Button variant="danger" size="sm" onClick={exitVoting}>
              stop voting
            </Button>
            <Button variant="outline" size="icon" onClick={() => setShowVotesPanel(true)} aria-label="show votes">
              <ChevronDownIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className={showVotesPanel ? 'block' : 'hidden'}>
          <div className="sticky top-0 z-nav border-b border-zinc-200 bg-surface/95 backdrop-blur dark:border-zinc-800">
            <div className="flex items-center gap-2 px-4 py-3">
              <Button variant="outline" size="icon" onClick={() => setShowVotesPanel(false)} aria-label="back to voting">
                <ChevronUpIcon className="h-5 w-5" />
              </Button>
              <span className="text-sm text-ink-muted">votes & rankings</span>
            </div>
          </div>
          <MobileVotesHeader />
          <VotesPanel votes={filteredVotes} onSelectItem={onSelectItem} />
          <ItemsLists
            sorteditems={sorteditems}
            unsorteditems={unsorteditems}
            skippedItems={tag.value.skipped}
            onSelectItem={onSelectItem}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="page flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-muted">voting on</span>
        <AttributePanel />
        <span className="text-ink-muted">according to</span>
        <UserPanel users={tag.value.users_who_voted} />
      </section>

      <div className="page flex gap-4">
        <Button variant="danger" size="sm" className="h-fit shrink-0" onClick={exitVoting}>
          stop voting
        </Button>
        <div className="min-w-0 flex-1">
          <VotePanel handleError={handleError} />
          <VotesPanel votes={filteredVotes} onSelectItem={onSelectItem} />
        </div>
      </div>

      <ItemsLists
        sorteditems={sorteditems}
        unsorteditems={unsorteditems}
        skippedItems={tag.value.skipped}
        onSelectItem={onSelectItem}
      />
    </div>
  );
};
