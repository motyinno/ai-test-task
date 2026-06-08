import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryProvider } from '@/providers/query-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { BrandProvider } from '@/providers/brand-provider';
import { ActiveContextProvider } from '@/providers/active-context-provider';
import { AppRoutes } from '@/routes';

function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <ActiveContextProvider>
          <BrandProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </BrandProvider>
        </ActiveContextProvider>
      </AuthProvider>
    </QueryProvider>
  );
}

export default App;
