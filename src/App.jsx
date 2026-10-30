import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './context/SessionContext.jsx';
import Layout from './components/Layout.jsx';
import { RequireAuth, RequireView } from './components/RouteGuards.jsx';
import Activity from './pages/Activity.jsx';
import Agent from './pages/Agent.jsx';
import CompetitionGuide from './pages/CompetitionGuide.jsx';
import ClosingSlide from './pages/ClosingSlide.jsx';
import ApexGrowth from './pages/ApexGrowth.jsx';
import Benchmarks from './pages/Benchmarks.jsx';
import DemoGuide from './pages/DemoGuide.jsx';
import Alerts from './pages/Alerts.jsx';
import Feeds from './pages/Feeds.jsx';
import Help from './pages/Help.jsx';
import Home from './pages/Home.jsx';
import InvoiceDetails from './pages/InvoiceDetails.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Privacy from './pages/Privacy.jsx';
import ReportBuilder from './pages/ReportBuilder.jsx';
import Reports from './pages/Reports.jsx';
import ReportView from './pages/ReportView.jsx';
import Transportation from './pages/Transportation.jsx';
import ValueIntelligence from './pages/ValueIntelligence.jsx';

export default function App() {
  const { status, error, me } = useSession();

  if (status === 'loading') {
    return (
      <div className="boot">
        <img src="/img/apex-mark.svg" alt="Loading" width="44" height="44" />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="boot">
        <div className="placeholder error" style={{ maxWidth: 520 }}>
          <b>Portal failed to start</b>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Presenter guide — public so it can be opened before signing in */}
      <Route path="/guide" element={<DemoGuide />} />
      <Route path="/guide/competition" element={<CompetitionGuide />} />
      <Route path="/guide/close" element={<ClosingSlide />} />
      <Route
        element={
          <RequireAuth>
            {/* keyed by user: a persona switch remounts every embed with fresh tokens */}
            <Layout key={me?.user.id} />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="dashboards" element={<ValueIntelligence />} />
        <Route path="agent" element={<Agent />} />
        <Route
          path="transportation"
          element={
            <RequireView view="transportation">
              <Transportation />
            </RequireView>
          }
        />
        <Route
          path="transportation/invoices"
          element={
            <RequireView view="invoiceDetails">
              {/* drill-down normally happens inside the workbook; only use this page if a details view is configured */}
              {me?.views.invoiceDetails?.configured ? <InvoiceDetails /> : <Navigate to="/transportation" replace />}
            </RequireView>
          }
        />
        {/* Benchmarks live inside the Value Intelligence dashboard */}
        <Route path="benchmarks" element={<Benchmarks />} />
        <Route path="reports" element={<Reports />} />
        <Route path="reports/new" element={me?.features?.authoring ? <ReportBuilder /> : <Navigate to="/reports" replace />} />
        <Route path="reports/:viewId" element={<ReportView />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="feeds" element={<Feeds />} />
        <Route path="activity" element={me?.features?.activityLog ? <Activity /> : <Navigate to="/" replace />} />
        <Route path="growth" element={me?.features?.apexGrowth ? <ApexGrowth /> : <Navigate to="/" replace />} />
        <Route path="help" element={<Help />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
