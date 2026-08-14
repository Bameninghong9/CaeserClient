import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './Home';
import Profiles from './Profiles';
import Skins from './Skins';
import Settings from './Settings';

const router = createMemoryRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Home />
      },
      {
        path: 'profiles',
        element: <Profiles />
      },
      {
        path: 'skins',
        element: <Skins />
      },
      {
        path: 'settings',
        element: <Settings />
      }
    ]
  }
]);

export default function App() {
  return <RouterProvider router={router} />;
}
