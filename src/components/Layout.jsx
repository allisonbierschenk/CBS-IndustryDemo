import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ContactProvider, useContact } from '../context/ContactContext.jsx';
import { useSession } from '../context/SessionContext.jsx';
import PresenterDock from './PresenterDock.jsx';
import TopBar from './TopBar.jsx';

export default function Layout() {
  const { me } = useSession();
  const { pathname } = useLocation();

  useEffect(() => {
    document.documentElement.style.setProperty('--client', me.tenant.color);
  }, [me.tenant.color]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <ContactProvider>
      <div className="frame">
        <div className="page">
          <TopBar />
          <main>
            <Outlet />
          </main>
          <Footer clientName={me.tenant.clientName} />
        </div>
        <PresenterDock />
      </div>
    </ContactProvider>
  );
}

function Footer({ clientName }) {
  const contact = useContact();
  return (
    <div className="container">
      <footer className="footer">
        <span>
          © {new Date().getFullYear()} Apex Consulting · Client portal for {clientName}
        </span>
        <nav className="footer-links" aria-label="Footer">
          <Link to="/help">Help &amp; KPI definitions</Link>
          <Link to="/privacy">Data &amp; privacy</Link>
          <button className="link-btn" onClick={() => contact()}>
            Contact your Apex team
          </button>
        </nav>
      </footer>
    </div>
  );
}
