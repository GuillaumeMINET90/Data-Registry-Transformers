import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Layers3,
  LibraryBig,
  Settings2,
  LogOut,
  ShieldCheck,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '../features/auth/AuthProvider';
import { useConfiguration } from '../features/configuration/queries';
import { LanguageContext, useT } from '../i18n/index';
import { ErrorMessage } from '../components/Feedback';
import { useSidebarState } from './useSidebarState';
export function Layout() {
  const config = useConfiguration();
  useEffect(() => {
    const preferences = config.data?.config;
    if (!preferences) return;
    document.documentElement.lang = preferences.language;
    document.title = preferences.application_name;
    document.documentElement.dataset.theme = preferences.interface.theme;
  }, [config.data]);
  return (
    <LanguageContext.Provider value={config.data?.config.language ?? 'fr'}>
      <Shell />
    </LanguageContext.Provider>
  );
}
function Shell() {
  const t = useT();
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<unknown>();
  const { collapsed, toggle } = useSidebarState();
  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <button
        className="mobile-menu icon-button"
        aria-label="Menu"
        aria-expanded={menu}
        aria-controls="main-sidebar"
        onClick={() => setMenu(!menu)}
      >
        <Menu />
      </button>
      {menu && (
        <button
          className="sidebar-backdrop"
          aria-label={t('Fermer le menu')}
          onClick={() => setMenu(false)}
        />
      )}
      <aside id="main-sidebar" className={`sidebar ${menu ? 'open' : ''}`}>
        <NavLink
          to="/registries"
          className="brand"
          aria-label="Data Transformers Registry"
          onClick={() => setMenu(false)}
        >
          <Layers3 />{' '}
          <div>
            DATA TRANSFORMERS<span>REGISTRY</span>
          </div>
        </NavLink>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={toggle}
          aria-label={t(collapsed ? 'Agrandir la sidebar' : 'Réduire la sidebar')}
          title={t(collapsed ? 'Agrandir la sidebar' : 'Réduire la sidebar')}
          aria-expanded={!collapsed}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          <span>{t('Réduire le menu')}</span>
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <NavLink
            to="/registries"
            aria-label={t('Registries')}
            title={t('Registries')}
            onClick={() => setMenu(false)}
          >
            <LibraryBig size={18} />
            <span>{t('Registries')}</span>
          </NavLink>
          <NavLink
            to="/configuration"
            aria-label={t('Configuration')}
            title={t('Configuration')}
            onClick={() => setMenu(false)}
          >
            <Settings2 size={18} />
            <span>{t('Configuration')}</span>
          </NavLink>
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={18} />
          <strong>YAML · Source de vérité</strong>
          <p>Vos règles métier, indépendantes de tout moteur.</p>
        </div>
        <div className="account">
          <div className="avatar">{user?.username.slice(0, 1).toUpperCase()}</div>
          <div className="account-details">
            <strong>{user?.username}</strong>
            <small>Administrateur</small>
          </div>
          <button
            className="icon-button"
            aria-label={t('Déconnexion')}
            onClick={() => {
              logout().catch(setError);
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main>
        <ErrorMessage error={error} />
        <Outlet />
      </main>
    </div>
  );
}
