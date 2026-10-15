import { useEffect, useRef } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ContactProvider, useContact } from "../context/ContactContext.jsx";
import {
  EmbedProvider,
  PersistentEmbeds,
  usePreloadViews,
} from "../context/EmbedContext.jsx";
import { useSession } from "../context/SessionContext.jsx";
import PresenterDock from "./PresenterDock.jsx";
import TopBar from "./TopBar.jsx";
import { UpgradeProvider } from "./UpgradeButton.jsx";

export default function Layout() {
  const { me } = useSession();
  const { pathname } = useLocation();
  const pageRef = useRef(null);
  // Preloaded right after sign-in so the dashboard is ready when the user opens it.
  const preload = usePreloadViews(["valueIntelligence"]);

  useEffect(() => {
    document.documentElement.style.setProperty("--client", me.tenant.color);
  }, [me.tenant.color]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <ContactProvider>
      <UpgradeProvider>
        <EmbedProvider views={preload}>
          <div className="frame">
            <div
              className="page"
              ref={pageRef}
              style={{ position: "relative" }}
            >
              <TopBar />
              <main>
                <Outlet />
              </main>
              <Footer clientName={me.tenant.clientName} />
              <PersistentEmbeds containerRef={pageRef} />
            </div>
            <PresenterDock />
          </div>
        </EmbedProvider>
      </UpgradeProvider>
    </ContactProvider>
  );
}

function Footer({ clientName }) {
  const contact = useContact();
  return (
    <div className="container">
      <footer className="footer">
        <span>
          © {new Date().getFullYear()} Apex Consulting · Client portal for{" "}
          {clientName}
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
