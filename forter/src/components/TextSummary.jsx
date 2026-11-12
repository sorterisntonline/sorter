import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { editing_item } from '../ItemPanel';
import { tag, selected_item } from '../App';
import { resetSelectedUsers } from '../UserPanel';
import { UserPanel } from '../UserPanel';
import { AttributePanel } from '../AttributePanel';
import { Modal } from '../Modal';
import { TagPreferences } from '../TagPreferences';
import { Button } from './ui/Button';

export const TextSummary = ({ can_vote, can_add }) => {
  const [_, setLocation] = useLocation();
  const namespace = useParams().namespace;
  const [isViewingTag, setIsViewingTag] = useState(false);

  const handleVoteNavigation = () => {
    resetSelectedUsers();
    if (namespace) {
      setLocation(`/namespace/${namespace}/voting`);
    } else {
      setLocation(`/${tag.value.tag.id}/${tag.value.tag.slug}/voting`);
    }
  };

  const openNewItem = () => {
    editing_item.value = {};
    selected_item.value = false;
  };

  const tagLabel = `#${tag.value.tag.ns ? `${tag.value.tag.ns}/` : ''}${tag.value.tag.slug}`;

  return (
    <section className="page border-b border-zinc-200 pb-4 dark:border-zinc-800">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setIsViewingTag(true)}
            className="rounded-lg bg-accent-soft px-3 py-2 text-left text-sm font-medium text-accent-strong dark:text-accent"
          >
            {tagLabel}
          </button>
          <Modal isOpen={isViewingTag} onClose={() => setIsViewingTag(false)}>
            <TagPreferences onSubmit={() => setIsViewingTag(false)} />
          </Modal>

          <div className="flex flex-wrap gap-2">
            {can_vote && (
              <Button variant="vote" size="md" onClick={handleVoteNavigation}>
                vote
              </Button>
            )}
            {can_add && (
              <Button variant="outline" size="md" onClick={openNewItem} className="hidden lg:inline-flex">
                add item
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <AttributePanel compact />
          <UserPanel users={tag.value.users_who_voted} compact />
        </div>
      </div>
    </section>
  );
};
