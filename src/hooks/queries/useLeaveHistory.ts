import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabase';

export const leaveKeys = {
  all: ['leaves'] as const,
  user: (userId: string) => [...leaveKeys.all, userId] as const,
};

export interface LeaveRequest {
  id: string;
  reason: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  admin_comment?: string;
  created_at: string;
}

export function useLeaveHistory() {
  return useQuery({
    queryKey: leaveKeys.all, // Ideally we'd pass userId, but we fetch it inside for simplicity
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('leaves')
        .select('id, reason, start_date, end_date, leave_type, status, admin_comment, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as LeaveRequest[]) || [];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes fresh
  });
}
