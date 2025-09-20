import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useRequireAuth } from './contexts/AuthContext';
import FloatingNav from './components/FloatingNav';
import './styles/floating-nav.css';

function Layout() {
  const auth = useRequireAuth(); // This will redirect to login if not authenticated

  if (auth.isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '32px', 
            height: '32px', 
            border: '2px solid #f3f3f3', 
            borderTop: '2px solid #1db954',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }}></div>
          <p style={{ color: '#6b7280' }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <FloatingNav />
      {/* Main content area with full width */}
      <main style={{ padding: '24px', maxWidth: '100%' }}>
        <Outlet /> {/* Child routes will render here */}
      </main>
    </div>
  );
}

export default Layout;
