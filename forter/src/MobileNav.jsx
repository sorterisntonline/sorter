import { useState } from 'react';
import { useLocation } from 'wouter';
import { current_session } from './session';
import { NAV_ITEMS } from './constants/navigation';
import { redirectToLogin, redirectToRegister, handleLogout } from './utils/authUtils';
import { useAuth0 } from '@auth0/auth0-react';
import { Button } from './components/ui/Button';

export const MobileNav = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { logout, isAuthenticated } = useAuth0();

  if (location.includes('/voting')) {
    return null;
  }

  const handleNavClick = (path) => {
    setLocation(path);
    setIsOpen(false);
  };

  const handleLogoutClick = async () => {
    const success = await handleLogout(isAuthenticated ? logout : null);
    if (success) {
      current_session.value = false;
      setIsOpen(false);
      setLocation('/');
    }
  };

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-nav flex h-nav items-center justify-between border-b border-zinc-200 bg-surface/95 px-4 backdrop-blur dark:border-zinc-800 lg:hidden">
        <button
          onClick={() => setIsOpen((open) => !open)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900"
          aria-label="menu"
        >
          <span className="sr-only">menu</span>
          <div className="flex w-5 flex-col gap-1.5">
            <span className={`block h-0.5 bg-ink transition-transform ${isOpen ? 'translate-y-2 rotate-45' : ''}`} />
            <span className={`block h-0.5 bg-ink transition-opacity ${isOpen ? 'opacity-0' : ''}`} />
            <span className={`block h-0.5 bg-ink transition-transform ${isOpen ? '-translate-y-2 -rotate-45' : ''}`} />
          </div>
        </button>

        <span className="text-sm font-medium text-ink-muted">sorter</span>

        <button
          onClick={() => handleNavClick(current_session.value?.user_name ? '/profile' : '/login')}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900"
          aria-label={current_session.value?.user_name ? 'profile' : 'login'}
        >
          {current_session.value?.pfp_url ? (
            <img src={current_session.value.pfp_url} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium dark:bg-zinc-800">
              {current_session.value?.user_name?.[0] || '→'}
            </div>
          )}
        </button>
      </header>

      {isOpen && (
        <button
          className="fixed inset-0 z-overlay bg-black/40 lg:hidden"
          aria-label="close menu"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed bottom-0 left-0 top-0 z-drawer w-[min(18rem,84vw)] border-r border-zinc-200 bg-surface p-4 transition-transform duration-200 dark:border-zinc-800 lg:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col pt-nav">
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.name}
                onClick={() => handleNavClick(item.path)}
                className="rounded-lg px-3 py-3 text-left text-base hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                {item.name}
              </button>
            ))}
          </nav>

          <div className="mt-auto space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            {current_session.value?.user_name ? (
              <>
                <button
                  onClick={() => handleNavClick('/profile')}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  <span className="text-sm">@{current_session.value.user_name}</span>
                </button>
                <Button variant="danger" size="md" className="w-full" onClick={handleLogoutClick}>
                  logout
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" size="md" className="w-full" onClick={() => redirectToLogin()}>
                  login
                </Button>
                <Button variant="outline" size="md" className="w-full" onClick={() => redirectToRegister()}>
                  register
                </Button>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
