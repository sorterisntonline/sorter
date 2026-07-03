export const Modal = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal">
      <button
        className="absolute inset-0 bg-black/50"
        aria-label="close"
        onClick={onClose}
      />
      <div className="flex min-h-full items-end justify-center p-4 sm:items-center">
        <div
          className="relative w-full max-w-lg animate-fade-up rounded-card border border-zinc-200 bg-surface p-4 shadow-float dark:border-zinc-800"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
