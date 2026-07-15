import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { startSession, endSession } from '../services/api';
import { AuthUser } from '../services/auth';

// Flush an in-progress segment on this cadence so a hard-kill (OS memory pressure,
// force-quit) never loses more than one interval's worth of study time.
const HEARTBEAT_MS = 5 * 60 * 1000;
// Below this, floating point / fast background-foreground flicker isn't real study time.
const MIN_BILLABLE_MINUTES = 0.05;

/**
 * Tracks real foreground usage time and reports it to the backend in minute-accurate
 * segments. A plain effect-cleanup-based approach doesn't work here: backgrounding or
 * killing the app does not unmount React, so a cleanup function alone almost never runs
 * with real elapsed time. Instead this listens to AppState directly: each active segment
 * ends (and a fresh one begins) whenever the app leaves/re-enters the foreground, plus a
 * periodic heartbeat while it stays foregrounded continuously.
 */
export function useSessionTracking(user: AuthUser | null) {
  const sessionId = useRef<string | null>(null);
  const segmentStart = useRef<number>(0);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!user) return;

    const beginSegment = () => {
      segmentStart.current = Date.now();
      startSession(user.username, 'mobile_app')
        .then((data) => { sessionId.current = data.session_id; })
        .catch(() => {});
    };

    const endSegment = () => {
      const id = sessionId.current;
      if (!id) return;
      sessionId.current = null;
      const minutes = (Date.now() - segmentStart.current) / 60000;
      if (minutes >= MIN_BILLABLE_MINUTES) {
        endSession(user.username, id, parseFloat(minutes.toFixed(2)), 'mobile_app').catch(() => {});
      }
    };

    beginSegment();

    const heartbeat = setInterval(() => {
      endSegment();
      beginSegment();
    }, HEARTBEAT_MS);

    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasActive = appState.current === 'active';
      const nowActive = nextState === 'active';
      if (wasActive && !nowActive) {
        endSegment();
      } else if (!wasActive && nowActive) {
        beginSegment();
      }
      appState.current = nextState;
    });

    return () => {
      subscription.remove();
      clearInterval(heartbeat);
      endSegment();
    };
  }, [user]);
}
