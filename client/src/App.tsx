import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { AuthPage } from '@/pages/AuthPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { EditorPage } from '@/pages/EditorPage';

interface Route {
  projectId: string | null;
}

function parseHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const match = hash.match(/^project\/([^/]+)/);
  return { projectId: match ? decodeURIComponent(match[1]) : null };
}

export default function App() {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);
  const init = useAuthStore((state) => state.init);
  const logout = useAuthStore((state) => state.logout);
  const desktop = useAuthStore((state) => state.desktop);
  const [route, setRoute] = useState<Route>(() => parseHash());

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const onHashChange = (): void => setRoute(parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <span className="spinner" />
        <span>RoomCraft NL wordt geladen…</span>
      </div>
    );
  }

  if (!user) {
    // The desktop app has no accounts, so it never shows the login/register screen.
    if (desktop) {
      return (
        <div className="loading-screen">
          <span className="spinner" />
          <span>RoomCraft NL wordt geladen…</span>
        </div>
      );
    }
    return <AuthPage />;
  }

  if (route.projectId) {
    return (
      <EditorPage
        projectId={route.projectId}
        userName={user.name}
        onExit={() => {
          window.location.hash = '#/';
        }}
        onLogout={
          desktop
            ? undefined
            : () => {
                window.location.hash = '#/';
                void logout();
              }
        }
      />
    );
  }

  return (
    <DashboardPage
      userName={user.name}
      onOpenProject={(id) => {
        window.location.hash = `#/project/${encodeURIComponent(id)}`;
      }}
      onLogout={desktop ? undefined : () => void logout()}
    />
  );
}
