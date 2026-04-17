import { createBrowserRouter, Outlet } from 'react-router';
import { AnalysisProvider } from './contexts/AnalysisContext';
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
        element: <UploadPage />,
      },
      {
        element: <AppLayout />,
        children: [
          { path: '/analysis/:id', element: <AnalysisPage /> },
          { path: '/analysis/:id/search', element: <SearchPage /> },
          { path: '/compare/:id1/:id2', element: <ComparePage /> },
        ],
      },
      {
        path: '/history',
        element: <HistoryPage />,
      },
      {
        path: '/settings',
        element: <SettingsPage />,
      },
    ],
  },
]);
