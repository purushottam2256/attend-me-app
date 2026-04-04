import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';
import * as SecureStore from 'expo-secure-store';
import createLogger from '../utils/logger';
import { safeJsonParse } from '../utils/safeUtils';

const log = createLogger('Auth');

// Supabase stores sessions using a key derived from project URL
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const PROJECT_REF = SUPABASE_URL.match(/https?:\/\/([^.]+)\./)?.[1] || 'default';
const SESSION_STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

// Maximum offline session age (7 days)
const MAX_OFFLINE_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Debounce delay for auth state changes — prevents rapid-fire during network flaps
const AUTH_DEBOUNCE_MS = 1500;

interface AuthContextData {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isOfflineSession: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOfflineSession, setIsOfflineSession] = useState(false);

  // Debounce timer ref to prevent rapid auth state transitions
  const authDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track if user intentionally signed out
  const intentionalSignOutRef = useRef(false);

  useEffect(() => {
    // 1. Get initial session (with offline fallback)
    const fetchSession = async () => {
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (session) {
              setSession(session);
              setUser(session.user ?? null);
              setIsOfflineSession(false);
            } else if (error) {
              // Network error — try cached session
              log.info('getSession failed, trying offline fallback:', error.message);
              await tryOfflineFallback();
            } else {
              // No session, no error — genuinely not logged in
              setSession(null);
              setUser(null);
            }
        } catch (err: any) {
            // Network failure / timeout — try cached session
            log.info('getSession threw, trying offline fallback:', err.message);
            await tryOfflineFallback();
        } finally {
            setLoading(false);
        }
    };

    const tryOfflineFallback = async () => {
      try {
        const cached = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
        if (!cached) {
          log.info('No cached session found');
          return;
        }

        const parsed: any = safeJsonParse(cached, null);
        if (!parsed) {
          log.info('Cached session is corrupted/unparseable');
          return;
        }
        // Supabase stores { currentSession, expiresAt } or just the session object
        const cachedSession = parsed.currentSession || parsed;

        if (!cachedSession?.user || !cachedSession?.access_token) {
          log.info('Cached session is malformed');
          return;
        }

        // Check session age — reject if older than 7 days
        const expiresAt = cachedSession.expires_at
          ? cachedSession.expires_at * 1000 // Supabase uses seconds
          : 0;
        const sessionAge = Date.now() - (expiresAt - 3600 * 1000); // Approx when it was created
        
        if (sessionAge > MAX_OFFLINE_SESSION_AGE_MS) {
          log.info('Cached session too old, requiring re-login');
          return;
        }

        log.info('Using cached offline session for user:', cachedSession.user.email);
        setSession(cachedSession as Session);
        setUser(cachedSession.user);
        setIsOfflineSession(true);
      } catch (e: any) {
        log.error('Offline fallback failed:', e.message);
      }
    };

    fetchSession();

    // 2. Listen for changes (works when online)
    // DEBOUNCED: Prevents rapid-fire auth state changes during network flapping
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // Clear any pending debounced update
      if (authDebounceRef.current) {
        clearTimeout(authDebounceRef.current);
      }

      // If this is a SIGNED_OUT event but wasn't intentional, debounce it
      // to prevent network-triggered logouts from kicking the user
      if (!newSession && !intentionalSignOutRef.current) {
        log.info('Received SIGNED_OUT but not intentional — debouncing...');
        authDebounceRef.current = setTimeout(() => {
          authDebounceRef.current = null;
          // Re-check: if we still have no session after the debounce,
          // it's a genuine sign-out
          supabase.auth.getSession().then(({ data }) => {
            if (!data.session) {
              log.info('Confirmed sign-out after debounce');
              setSession(null);
              setUser(null);
              setIsOfflineSession(false);
            } else {
              log.info('Session recovered after debounce — ignoring SIGNED_OUT');
              setSession(data.session);
              setUser(data.session.user ?? null);
              setIsOfflineSession(false);
            }
            setLoading(false);
          }).catch(() => {
            // If getSession fails (network still down), keep current session
            log.info('getSession failed during debounce — keeping current session');
          });
        }, AUTH_DEBOUNCE_MS);
        return;
      }

      // Normal auth state change (immediate)
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession) setIsOfflineSession(false);
      setLoading(false);
    });

    return () => {
      if (authDebounceRef.current) {
        clearTimeout(authDebounceRef.current);
      }
      subscription?.unsubscribe();
    };
  }, []);

  const signOut = async () => {
      intentionalSignOutRef.current = true;
      setIsOfflineSession(false);
      try {
        await supabase.auth.signOut();
      } finally {
        // Reset after a short delay to allow the event to process
        setTimeout(() => {
          intentionalSignOutRef.current = false;
        }, 2000);
      }
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, isOfflineSession, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
