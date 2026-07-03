const variants = {
  primary:
    'bg-accent text-white hover:bg-accent-strong dark:bg-accent dark:text-zinc-950 dark:hover:bg-accent-strong',
  vote:
    'bg-vote text-zinc-950 hover:brightness-95 shadow-sm',
  ghost:
    'bg-transparent text-ink hover:bg-zinc-100 dark:hover:bg-zinc-800',
  outline:
    'border border-zinc-300 bg-transparent text-ink hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900',
  danger:
    'border border-red-300 bg-transparent text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40',
};

const sizes = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
  icon: 'h-10 w-10 p-0',
};

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}) => (
  <button
    type={type}
    className={[
      'inline-flex items-center justify-center gap-2 rounded-lg font-medium lowercase transition-colors',
      'disabled:pointer-events-none disabled:opacity-50',
      variants[variant],
      sizes[size],
      className,
    ].join(' ')}
    {...props}
  >
    {children}
  </button>
);
