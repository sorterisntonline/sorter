export const NAV_ITEMS = [
  { name: 'Tags2', path: '/tags2' },
  { name: 'Tags', path: '/' },
  { name: 'Feed', path: '/feed' },
  { name: 'FAQ', path: '/faq' },
  { name: 'Leaderboard', path: '/leaderboard' },
];

// Routes where the new tag button should be shown
export const NEW_TAG_ROUTES = ['/', '/tags2', '/feed', '/faq', '/leaderboard'];

// New tag button options
export const NEW_TAG_BUTTONS = [
  {
    label: 'Linear Tag',
    color: 'bg-blue-200 dark:bg-blue-950 hover:bg-blue-300 dark:hover:bg-blue-900',
    textColor: 'text-blue-900 dark:text-blue-100',
    action: 'linear'
  },
  {
    label: 'Spotify Tag',
    color: 'bg-green-200 dark:bg-green-950 hover:bg-green-300 dark:hover:bg-green-900',
    textColor: 'text-green-900 dark:text-green-100',
    action: 'spotify'
  },
  {
    label: 'Tag',
    color: 'bg-purple-200 dark:bg-purple-950 hover:bg-purple-300 dark:hover:bg-purple-900',
    textColor: 'text-purple-900 dark:text-purple-100',
    action: 'normal'
  }
]; 