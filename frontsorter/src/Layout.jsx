import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Sidebar from './Sidebar';

function Layout() {
  const { isLoading } = useAuth();

  return (
    <div className="flex" data-auth-loading={isLoading ? 'true' : 'false'}>
      <Sidebar />
      {/* Main content area with padding to offset the fixed sidebar */}
      <main className="flex-grow p-6 pl-[280px]"> {/* pl = sidebar width + padding */}
        <Outlet /> {/* Child routes will render here */}
      </main>
    </div>
  );
}

export default Layout;
