import React from 'react';
import { Outlet } from 'react-router-dom';

function Layout() {
  return (
    <div className="min-h-screen bg-gray-100">
      <main className="flex-grow p-6 overflow-y-auto">
        <Outlet /> {/* Child routes will render here */}
      </main>
    </div>
  );
}

export default Layout;
