import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './features/auth/AuthProvider';
import { Layout } from './app/Layout';
import { LoginPage } from './pages/LoginPage';
import { RegistriesPage } from './pages/RegistriesPage';
import { RegistryEditorPage } from './pages/RegistryEditorPage';
import { ConfigurationPage } from './pages/ConfigurationPage';
import { ApiRegistriesPage } from './pages/ApiRegistriesPage';
import { ApiRegistryEditorPage } from './pages/ApiRegistryEditorPage';
import { Loading } from './components/Feedback';
import './styles.css';
import './app/workspace.css';
const client = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
function Protected() {
  const { user, pending } = useAuth();
  return pending ? <Loading /> : user ? <Layout /> : <Navigate to="/login" replace />;
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<Protected />}>
              <Route path="/registries" element={<RegistriesPage />} />
              <Route path="/registries/new" element={<RegistryEditorPage />} />
              <Route path="/registries/:id" element={<RegistryEditorPage readOnly />} />
              <Route path="/registries/:id/edit" element={<RegistryEditorPage />} />
              <Route path="/apis" element={<ApiRegistriesPage />} />
              <Route path="/apis/new" element={<ApiRegistryEditorPage />} />
              <Route path="/apis/:id" element={<ApiRegistryEditorPage readOnly />} />
              <Route path="/apis/:id/edit" element={<ApiRegistryEditorPage />} />
              <Route path="/configuration" element={<ConfigurationPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/registries" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
