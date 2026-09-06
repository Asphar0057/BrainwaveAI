import ToolNavigation from '../components/ToolNavigation';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import conversionAgentService from '../services/conversionAgentService';
import './NotesPodcastMode.css';
import '../components/SocialHubChrome.css';
import '../components/NotesSidebarSystem.css';
import PodcastStudio from '../components/media/PodcastStudio';

const parseNoteIds = (raw) =>
  (raw || '')
    .split(',')
    .map((item) => parseInt(item, 10))
    .filter((id) => Number.isInteger(id) && id > 0);

const buildPodcastResults = (payload) => ({
  filename: payload?.title || 'Notes Podcast',
  source_type: payload?.source_type || 'notes',
  transcript: payload?.transcript || '',
  analysis: payload?.analysis || {},
  podcast_settings: payload?.podcast_settings || {},
});

const NotesPodcastMode = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const userName = localStorage.getItem('username');

  const statePayload = location.state?.podcastPayload || null;
  const noteIdsFromQuery = useMemo(
    () => parseNoteIds(searchParams.get('note_ids')),
    [searchParams]
  );

  const [payload, setPayload] = useState(statePayload);
  const [loading, setLoading] = useState(!statePayload);
  const [error, setError] = useState('');
  const podcastResults = useMemo(() => (payload ? buildPodcastResults(payload) : null), [payload]);

  useEffect(() => {
    if (statePayload) {
      setPayload(statePayload);
      setLoading(false);
      setError('');
      return;
    }

    if (!noteIdsFromQuery.length) {
      setError('No notes were selected for podcast mode.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadPodcastPayload = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await conversionAgentService.convertNotesToPodcast({
          noteIds: noteIdsFromQuery,
          voiceMode: 'coach',
          voicePersona: 'mentor',
          difficulty: 'intermediate',
          answerLanguage: 'en',
        });

        if (!cancelled) {
          const details = response?.result || response;
          if (!details?.success) {
            throw new Error(details?.error || 'Unable to prepare podcast content');
          }
          setPayload(details);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Failed to load podcast mode');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPodcastPayload();

    return () => {
      cancelled = true;
    };
  }, [statePayload, noteIdsFromQuery]);

  useEffect(() => {
    document.body.classList.add('notes-podcast-page-open');
    return () => {
      document.body.classList.remove('notes-podcast-page-open');
    };
  }, []);

  if (loading) {
    return (
      <div className="npm-shell">
        <div className="npm-card">
          <Loader2 size={28} className="npm-spin" />
          <h2>Preparing Podcast Mode</h2>
          <p>Building a listenable transcript from your selected notes.</p>
        </div>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="npm-shell">
        <div className="npm-card npm-card-error">
          <AlertCircle size={30} />
          <h2>Podcast Mode Unavailable</h2>
          <p>{error || 'Unable to prepare podcast mode right now.'}</p>
          <button type="button" className="npm-back-btn" onClick={() => navigate('/notes/my-notes')}>
            Back to Notes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="npm-page">
      <div className="shc-topbar">
        <ToolNavigation />
      </div>
      <PodcastStudio
        results={podcastResults}
        userName={userName}
        onExit={() => navigate('/notes/my-notes')}
      />
    </div>
  );
};

export default NotesPodcastMode;
