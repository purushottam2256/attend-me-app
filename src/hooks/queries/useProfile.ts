import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabase';
import { getStoredProfile } from '../../services/authService';
import { cacheProfile } from '../../services/offlineService';
import { useConnectionStatus } from '../../hooks';

export const profileKeys = {
  all: ['profile'] as const,
  details: (userId: string) => [...profileKeys.all, userId] as const,
};

export function useProfile() {
  const { status: connectionStatus } = useConnectionStatus();
  
  return useQuery({
    queryKey: profileKeys.all,
    queryFn: async () => {
      if (connectionStatus === 'offline') {
        const offlineProfile = await getStoredProfile();
        if (offlineProfile) {
          return { user: null, profile: offlineProfile, isOffline: true };
        }
        throw new Error('Offline and no cached profile found');
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Not authenticated');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, dept, role, avatar_url, notifications_enabled, created_at')
        .eq('id', user.id)
        .single();
        
      if (profileError) throw profileError;

      if (profile) {
        (profile as any).department = (profile as any).dept;
        await cacheProfile({
          ...profile,
          cachedAt: new Date().toISOString()
        });
      }

      return { user, profile, isOffline: false };
    },
    staleTime: 1000 * 60 * 15, // 15 minutes
  });
}
