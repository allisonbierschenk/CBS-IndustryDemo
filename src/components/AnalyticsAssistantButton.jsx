// Opens Tableau's Analytics Assistant (Tableau Agent) side pane inside the embedded dashboard.
// Embedding API: viz.launchAnalyticsAssistantAsync(). Always clickable once the dashboard has loaded;
// if Tableau refuses, its error is shown. isAnalyticsAssistantAvailableAsync() is logged for diagnosis only.
import { useEffect } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import Icon from './Icon.jsx';

export default function AnalyticsAssistantButton({ viz }) {
  const toast = useToast();

  useEffect(() => {
    if (!viz?.isAnalyticsAssistantAvailableAsync) return;
    viz
      .isAnalyticsAssistantAvailableAsync()
      .then((ok) => console.info(`[analytics assistant] Tableau reports available: ${ok}`))
      .catch((e) => console.warn('[analytics assistant] availability check failed:', e));
  }, [viz]);

  const launch = async () => {
    try {
      await viz.launchAnalyticsAssistantAsync();
      console.info('[analytics assistant] launched');
    } catch (e) {
      console.error('[analytics assistant] launch failed:', e);
      toast(`Tableau Agent couldn't open: ${e?.message || e}`);
    }
  };

  return (
    <button className="btn btn-lime btn-sm" onClick={launch} disabled={!viz} title={viz ? 'Open Tableau Agent in the dashboard' : 'Available once the dashboard has loaded'}>
      <Icon name="agent" />
      Ask Tableau Agent
    </button>
  );
}
