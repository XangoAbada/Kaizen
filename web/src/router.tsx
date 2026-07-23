import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectPage } from './pages/ProjectPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <ProjectsPage /> },
      { path: 'projects/:projectId', element: <ProjectPage /> },
    ],
  },
]);
