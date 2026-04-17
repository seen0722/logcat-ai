import { createBrowserRouter, Outlet } from 'react-router';
import { AnalysisProvider } from './contexts/AnalysisContext';
import ErrorBoundary from './components/ErrorBoundary';
import AppLayout from './layouts/AppLayout';
import UploadPage from './pages/UploadPage';
import AnalysisPage from './pages/AnalysisPage';
import SearchPage from './pages/SearchPage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';
import ComparePage from './pages/ComparePage';

/** Root layout that provides AnalysisContext to all routes */
function RootLayout() {
  return (
    <AnalysisProvider>
      <Outlet />
    </AnalysisProvider>
  );
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: '/',
        element: <ErrorBoundary><UploadPage /></ErrorBoundary>,
      },
      {
        element: <AppLayout />,
        children: [
          { path: '/analysis/:id', element: <ErrorBoundary><AnalysisPage /></ErrorBoundary> },
          { path: '/analysis/:id/search', element: <ErrorBoundary><SearchPage /></ErrorBoundary> },
          { path: '/compare/:id1/:id2', element: <ErrorBoundary><ComparePage /></ErrorBoundary> },
        ],
      },
      {
        path: '/history',
        element: <ErrorBoundary><HistoryPage /></ErrorBoundary>,
      },
      {
        path: '/settings',
        element: <ErrorBoundary><SettingsPage /></ErrorBoundary>,
      },
    ],
  },
]);
