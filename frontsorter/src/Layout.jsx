import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Sidebar from './Sidebar';

function Layout() {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      {/* Main content area with padding to offset the fixed sidebar */}
      <main className="flex-grow p-6 pl-[280px]"> {/* pl = sidebar width + padding */}
        <Outlet /> {/* Child routes will render here */}
      </main>
    </div>
  );
}

export default Layout;
