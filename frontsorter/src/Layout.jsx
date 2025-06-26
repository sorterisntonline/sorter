import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar'; // Import the Sidebar component

function Layout() {
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
