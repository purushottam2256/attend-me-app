import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabase';
import { 
  getTodaySchedule, 
  getSwapsAndSubstitutions, 
  getHolidayInfo, 
  getLeaveInfo 
} from '../../services/dashboardService';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  date: (dateStr: string) => [...dashboardKeys.all, dateStr] as const,
};

export function useDashboardData(dateStr: string) {
  return useQuery({
    queryKey: dashboardKeys.date(dateStr),
    staleTime: 1000 * 60 * 5, // 5 minutes
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const userId = user.id;

      const [slots, { swaps, substitutions }, holidayInfo, leaveInfo, { data: completedSessions }] = await Promise.all([
        getTodaySchedule(userId),
        getSwapsAndSubstitutions(userId),
        getHolidayInfo(),
        getLeaveInfo(userId),
        supabase
          .from('attendance_sessions')
          .select('slot_id')
          .eq('faculty_id', userId)
          .eq('date', dateStr)
      ]);

      return {
        slots: slots || [],
        swaps: swaps || [],
        substitutions: substitutions || [],
        holidayInfo: holidayInfo || null,
        leaveInfo: leaveInfo || null,
        completedSessions: completedSessions || [],
      };
    },
  });
}
