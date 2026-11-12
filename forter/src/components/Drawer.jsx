import { useState, useRef } from 'react';
import { ChevronDownIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/solid';
import { signal } from '@preact/signals-react';

export const drawer_maximized = signal(false);

export const Drawer = ({ children, isOpen, onClose }) => {
  const contentRef = useRef(null);

  const handleClose = () => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('item')) {
      params.delete('item');
      const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
      window.history.replaceState({}, '', newUrl);
    }
    onClose();
  };

  const height = drawer_maximized.value ? 'min(92dvh, 100%)' : 'min(58dvh, 100%)';

  return (
    <div className={`fixed inset-0 z-drawer ${isOpen ? 'visible' : 'invisible'}`}>
      <button className="absolute inset-0 bg-black/50" aria-label="close drawer" onClick={handleClose} />
      <div
        style={{ height }}
        className={`absolute inset-x-0 bottom-0 flex flex-col rounded-t-card border border-zinc-200 bg-surface shadow-float transition-transform duration-300 dark:border-zinc-800 ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <button
            onClick={() => (drawer_maximized.value = !drawer_maximized.value)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900"
            aria-label="resize drawer"
          >
            {drawer_maximized.value ? (
              <ArrowsPointingInIcon className="h-5 w-5" />
            ) : (
              <ArrowsPointingOutIcon className="h-5 w-5" />
            )}
          </button>
          <div className="h-1 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          <button
            onClick={handleClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900"
            aria-label="close drawer"
          >
            <ChevronDownIcon className="h-5 w-5" />
          </button>
        </div>
        <div ref={contentRef} className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </div>
  );
};
