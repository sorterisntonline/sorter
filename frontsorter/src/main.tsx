import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom';
import './index.css'
import App from './App'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import { DynamicThemeProvider } from './contexts/DynamicThemeContext'

// Create a client
const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DynamicThemeProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </DynamicThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
