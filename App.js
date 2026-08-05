import { useEffect, useRef, useState } from 'react';
import { AppState, StatusBar } from 'react-native';
import AuthScreen from './AuthScreen';
import { initDB } from './db';
import Home from './Home';
import ShareHandler from './ShareHandler';
import { ThemeProvider, useTheme } from './ThemeContext';

import CustomAlertModal from './CustomAlertModal';
import { pickerActive } from './pickerState';

const AUTO_LOCK_DELAY_MS = 2 * 60 * 1000;

function AppInner() {
  const [unlocked, setUnlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [initialAuthMode, setInitialAuthMode] = useState(null);
  const { mode } = useTheme();
  const appStateRef = useRef(AppState.currentState);
  const autoLockTimerRef = useRef(null);

  const lockApp = () => {
    setUnlocked(false);
    setInitialAuthMode(null);
  };

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      try {
        await initDB();
        if (!cancelled) setReady(true);
      } catch (e) {
        console.error('DB init failed:', e);
        if (!cancelled) setReady(true);
      }
    };

    initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;

      if (autoLockTimerRef.current) {
        clearTimeout(autoLockTimerRef.current);
        autoLockTimerRef.current = null;
      }

      if (nextState === 'active') {
        return;
      }

      if (nextState === 'background' || nextState === 'inactive') {
        if (!pickerActive.value && unlocked) {
          autoLockTimerRef.current = setTimeout(() => {
            if (appStateRef.current !== 'active' && !pickerActive.value) {
              lockApp();
            }
          }, AUTO_LOCK_DELAY_MS);
        }
      }
    });

    return () => {
      sub.remove();
      if (autoLockTimerRef.current) {
        clearTimeout(autoLockTimerRef.current);
      }
    };
  }, [unlocked]);

  if (!ready) return null;

  return (
    <>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />
      {unlocked ? (
        <>
          <Home
            onLock={() => {
              setUnlocked(false);
              setInitialAuthMode(null);
            }}
            onResetPassword={() => {
              setUnlocked(false);
              setInitialAuthMode('forgot');
            }}
          />
          <ShareHandler />
        </>
      ) : (
        <AuthScreen
          initialMode={initialAuthMode}
          onUnlocked={() => {
            setUnlocked(true);
            setInitialAuthMode(null);
          }}
          onCancel={
            initialAuthMode === 'forgot'
              ? () => {
                  setUnlocked(true);
                  setInitialAuthMode(null);
                }
              : null
          }
          onResetSuccess={() => {
            setUnlocked(false);
            setInitialAuthMode(null);
          }}
        />
      )}
      <CustomAlertModal />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}