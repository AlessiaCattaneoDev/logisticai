import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { ChatPage } from './pages/ChatPage';
import { LoginPage } from './pages/LoginPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AuditPage } from './pages/admin/AuditPage';
import { ConversationDetailPage } from './pages/admin/ConversationDetailPage';
import { ConversationsPage } from './pages/admin/ConversationsPage';
import { CostsPage } from './pages/admin/CostsPage';
import { FeedbackPage } from './pages/admin/FeedbackPage';
import { OverviewPage } from './pages/admin/OverviewPage';
import { SystemPage } from './pages/admin/SystemPage';
import { UsersPage } from './pages/admin/UsersPage';

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/chat', element: <ProtectedRoute><ChatPage /></ProtectedRoute> },
  { path: '/chat/:conversationId', element: <ProtectedRoute><ChatPage /></ProtectedRoute> },
  {
    path: '/admin',
    element: <ProtectedRoute role="ADMIN"><AdminLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'conversazioni', element: <ConversationsPage /> },
      { path: 'conversazioni/:id', element: <ConversationDetailPage /> },
      { path: 'feedback', element: <FeedbackPage /> },
      { path: 'costi', element: <CostsPage /> },
      { path: 'utenti', element: <UsersPage /> },
      { path: 'sistema', element: <SystemPage /> },
      { path: 'registro', element: <AuditPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/chat" replace /> },
];

export function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
}

export default function App() {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
