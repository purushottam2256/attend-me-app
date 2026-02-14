/**
 * Auth Service
 * Handles all authentication operations with Supabase
 */

import { supabase } from '../config/supabase';
import * as SecureStore from 'expo-secure-store';
import createLogger from '../utils/logger';

const log = createLogger('AuthService');

// Types
export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'faculty' | 'class_incharge' | 'lab_incharge' | 'management' | 'hod' | 'principal' | 'developer';
  dept: string | null;
  faculty_id: string | null;
  mobile: string | null;
  is_biometric_enabled: boolean;
  is_on_leave: boolean;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserProfile | null;
  error: string | null;
}

// Storage keys
const STORAGE_KEYS = {
  USER_PROFILE: 'user_profile',
  BIOMETRIC_ENABLED: 'biometric_enabled',
  REMEMBER_ME: 'remember_me',
};

/**
 * Sign in with email and password
 * Note: Faculty profile must be created by HOD first via web app
 */
export async function signIn(email: string, password: string): Promise<{ user: UserProfile | null; error: string | null }> {
  try {
    // Authenticate with Supabase
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      return { user: null, error: authError.message };
    }

    if (!authData.user) {
      return { user: null, error: 'Authentication failed' };
    }

    // Fetch user profile (must exist - created by HOD)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      log.error('Profile fetch error:', profileError);
      
      // Profile not found - HOD hasn't added this faculty yet
      if (profileError.code === 'PGRST116') {
        await supabase.auth.signOut();
        return { 
          user: null, 
          error: 'Your profile has not been set up yet. Please contact your HOD or administrator.' 
        };
      }
      
      // Permission denied - RLS policy issue
      if (profileError.code === '42501') {
        await supabase.auth.signOut();
        return { 
          user: null, 
          error: 'Access denied. Please contact your administrator.' 
        };
      }

      await supabase.auth.signOut();
      return { user: null, error: 'Failed to load your profile. Please try again.' };
    }

    // Store profile locally for offline access
    await SecureStore.setItemAsync(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));

    return { user: profile as UserProfile, error: null };
  } catch (error) {
    log.error('Sign in error:', error);
    return { user: null, error: 'An unexpected error occurred' };
  }
}

/**
 * Sign out - keeps profile stored for biometric re-login
 */
export async function signOut(): Promise<void> {
  try {
    await supabase.auth.signOut();
    // NOTE: We keep USER_PROFILE stored so biometric login works next time
    // Only clear BIOMETRIC_ENABLED if user explicitly disables it
  } catch (error) {
    log.error('Sign out error:', error);
  }
}

/**
 * Full sign out - clears all data (use when switching accounts)
 */
export async function signOutCompletely(): Promise<void> {
  try {
    await supabase.auth.signOut();
    await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_PROFILE);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.BIOMETRIC_ENABLED);
  } catch (error) {
    log.error('Sign out error:', error);
  }
}

/**
 * Get current session
 */
export async function getCurrentSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
      return null;
    }
    return session;
  } catch (error) {
    log.error('Get session error:', error);
    return null;
  }
}

/**
 * Get stored user profile
 */
export async function getStoredProfile(): Promise<UserProfile | null> {
  try {
    const profileStr = await SecureStore.getItemAsync(STORAGE_KEYS.USER_PROFILE);
    if (profileStr) {
      return JSON.parse(profileStr) as UserProfile;
    }
    return null;
  } catch (error) {
    log.error('Get stored profile error:', error);
    return null;
  }
}

/**
 * Request password reset OTP
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'attendme://reset-password',
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (error) {
    log.error('Password reset error:', error);
    return { success: false, error: 'Failed to send reset email' };
  }
}

/**
 * Update password
 */
export async function updatePassword(newPassword: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (error) {
    log.error('Update password error:', error);
    return { success: false, error: 'Failed to update password' };
  }
}

/**
 * Check if biometric is enabled
 */
export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const enabled = await SecureStore.getItemAsync(STORAGE_KEYS.BIOMETRIC_ENABLED);
    return enabled === 'true';
  } catch {
    return false;
  }
}

/**
 * Enable/disable biometric login
 */
export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEYS.BIOMETRIC_ENABLED, enabled ? 'true' : 'false');
}

export default {
  signIn,
  signOut,
  getCurrentSession,
  getStoredProfile,
  requestPasswordReset,
  updatePassword,
  isBiometricEnabled,
  setBiometricEnabled,
};
