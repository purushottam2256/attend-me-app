import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';
import * as SecureStore from 'expo-secure-store';
import createLogger from '../utils/logger';

const log = createLogger('Auth');

// Supabase stores sessions using a key derived from project URL
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const PROJECT_REF = SUPABASE_URL.match(/https?:\/\/([^.]+)\./)?.[1] || 'default';
const SESSION_STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

// Maximum offline session age (7 days)
const MAX_OFFLINE_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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

        const parsed = JSON.parse(cached);
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session) setIsOfflineSession(false);
      setLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const signOut = async () => {
      setIsOfflineSession(false);
      await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, isOfflineSession, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
