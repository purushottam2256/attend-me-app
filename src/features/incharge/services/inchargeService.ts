/**
 * Incharge Service - API calls for Class Incharge Hub
 */

import { supabase } from '../../../config/supabase';

// Helper for local date (YYYY-MM-DD)
const getLocalDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Constants
const CRITICAL_ATTENDANCE_THRESHOLD = 75;

// Types
export interface StudentAggregate {
  student_id: string;
  roll_no: string;
  full_name: string;
  dept: string;
  section: string;
  year: number;
  present_sessions: number;
  absent_sessions: number;
  od_sessions: number;
  leave_sessions: number;
  total_sessions: number;
  attendance_percentage: number;
  last_attendance_date: string | null;
  student_mobile?: string;
  parent_mobile?: string;
}

export interface PeriodAttendance {
  slot_id: string;
  present_count: number;
  total_count: number;
  percentage: number;
}

export interface WatchlistStudent extends StudentAggregate {
  student_mobile?: string;
  parent_mobile?: string;
}

export interface Permission {
  id: string;
  student_id: string;
  type: 'od' | 'leave';
  category?: 'dept_work' | 'club_work' | 'event' | 'drive' | 'other';
  reason?: string;
  start_date: string;
  end_date: string;
  start_time?: string;
  end_time?: string;
  granted_by: string;
  is_active: boolean;
  created_at: string;
}

// Helper to compute aggregates dynamically
const getAggregatedClassData = async (
  dept: string,
  year: number,
  section: string
): Promise<StudentAggregate[]> => {
  // 1. Fetch all students for the class
  const { data: students, error: studentError } = await supabase
    .from('students')
    .select('id, roll_no, full_name, mobile, parent_mobile, dept, section, year')
    .eq('dept', dept)
    .eq('year', year)
    .eq('section', section)
    .eq('is_active', true)
    .order('roll_no');

  if (studentError || !students) throw studentError;

  // 2. Fetch Total Sessions for this class
  const { count, error: sessionError } = await supabase
    .from('attendance_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('target_dept', dept)
    .eq('target_year', year)
    .eq('target_section', section);

  if (sessionError) throw sessionError;
  const totalSessions = count || 0;

  // 3. Fetch Logs for this class (using inner join to filter by class)
  const { data: logs, error: logsError } = await supabase
    .from('attendance_logs')
    .select(`
      student_id, 
      status,
      attendance_sessions!inner(target_dept, target_year, target_section)
    `)
    .eq('attendance_sessions.target_dept', dept)
    .eq('attendance_sessions.target_year', year)
    .eq('attendance_sessions.target_section', section);

  if (logsError) throw logsError;

  // 4. Aggregate Logs
  const statsMap = new Map<string, { present: number, absent: number, od: number, leave: number }>();
  
  logs?.forEach((log: any) => {
    const sid = log.student_id;
    if (!statsMap.has(sid)) {
      statsMap.set(sid, { present: 0, absent: 0, od: 0, leave: 0 });
    }
    const stats = statsMap.get(sid)!;
    
    if (log.status === 'present') stats.present++;
    else if (log.status === 'absent') stats.absent++;
    else if (log.status === 'od') stats.od++;
    else if (log.status === 'leave') stats.leave++;
  });

  // 5. Build Aggregates
  return students.map(s => {
    const stats = statsMap.get(s.id) || { present: 0, absent: 0, od: 0, leave: 0 };
    // OD counts as present for percentage
    const effectivePresent = stats.present + stats.od;
    // Total conducted for this student = Present + Absent + OD (Leave might be excluded or included depending on policy, user said "Present(present+absent)*100")
    // Assuming "Present+Absent" implies Total Attended/Missed.
    const studentTotal = stats.present + stats.absent + stats.od; 
    
    const percentage = studentTotal > 0 
      ? Math.round((effectivePresent / studentTotal) * 100)
      : 0;

    return {
      student_id: s.id,
      roll_no: s.roll_no,
      full_name: s.full_name,
      dept: s.dept,
      section: s.section,
      year: s.year,
      present_sessions: stats.present,
      absent_sessions: stats.absent,
      od_sessions: stats.od,
      leave_sessions: stats.leave,
      total_sessions: totalSessions,
      attendance_percentage: percentage,
      last_attendance_date: null, // Optimization: skip for now or fetch if needed
      student_mobile: s.mobile,
      parent_mobile: s.parent_mobile
    };
  });
};

// Fetch class students with aggregates
export const getClassStudents = async (
  dept: string,
  year: number,
  section: string
): Promise<StudentAggregate[]> => {
  try {
    return await getAggregatedClassData(dept, year, section);
  } catch (error) {
    console.error('[InchargeService] Error fetching students:', error);
    throw error;
  }
};

// Get watchlist (critical students <75%)
export const getWatchlist = async (
  dept: string,
  year: number,
  section: string,
  threshold: number = CRITICAL_ATTENDANCE_THRESHOLD
): Promise<StudentAggregate[]> => {
  try {
    const allStudents = await getAggregatedClassData(dept, year, section);
    return allStudents
      .filter(s => s.attendance_percentage < threshold)
      .sort((a, b) => a.attendance_percentage - b.attendance_percentage);
  } catch (error) {
    console.error('[InchargeService] Error fetching watchlist:', error);
    throw error;
  }
};

// Get assigned class for a faculty
export const getAssignedClass = async (facultyId: string): Promise<{ dept: string; year: number; section: string } | null> => {
  const { data, error } = await supabase
    .from('class_incharges')
    .select('dept, year, section')
    .eq('faculty_id', facultyId)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('[InchargeService] Error fetching assigned class:', error);
    throw error;
  }

  return data;
};

// Get today's period attendance for P1 and P4
export const getKeyPeriodAttendance = async (
  dept: string,
  year: number,
  section: string
): Promise<{ p1: PeriodAttendance | null; p4: PeriodAttendance | null }> => {
  const today = getLocalDate();
  
  // Fetch all sessions for today to handle variable slot_ids (e.g., '1', 'p1', 'P1')
  const { data, error } = await supabase
    .from('attendance_sessions')
    .select(`
      slot_id,
      present_count,
      total_students
    `)
    .eq('target_dept', dept)
    .eq('target_year', year)
    .eq('target_section', section)
    .eq('date', today);

  if (error) {
    console.error('[InchargeService] Error fetching period attendance:', error);
    throw error;
  }

  // Helper to normalize slot_id for comparison
  const normalize = (id: string) => id.toString().toLowerCase().replace(/[^a-z0-9]/g, '');

  const p1Variants = ['p1', '1', 'period1', '09:00', '9:00'];
  const p4Variants = ['p4', '4', 'period4', '13:00', '13:20', '01:00']; // Common afternoon times

  const p1Session = data?.find(s => p1Variants.includes(normalize(s.slot_id)));
  const p4Session = data?.find(s => p4Variants.includes(normalize(s.slot_id)));

  return {
    p1: p1Session ? {
      slot_id: 'p1',
      present_count: p1Session.present_count || 0,
      total_count: p1Session.total_students || 0,
      percentage: p1Session.total_students > 0 
        ? Math.round((p1Session.present_count / p1Session.total_students) * 100) 
        : 0,
    } : null,
    p4: p4Session ? {
      slot_id: 'p4',
      present_count: p4Session.present_count || 0,
      total_count: p4Session.total_students || 0,
      percentage: p4Session.total_students > 0 
        ? Math.round((p4Session.present_count / p4Session.total_students) * 100) 
        : 0,
    } : null,
  };
};

// Get all period attendance for today
export const getAllPeriodAttendance = async (
  dept: string,
  year: number,
  section: string
): Promise<PeriodAttendance[]> => {
  const today = getLocalDate();
  
  const { data, error } = await supabase
    .from('attendance_sessions')
    .select(`
      slot_id,
      present_count,
      total_students
    `)
    .eq('target_dept', dept)
    .eq('target_year', year)
    .eq('target_section', section)
    .eq('date', today)
    .order('slot_id');

  if (error) {
    console.error('[InchargeService] Error fetching all period attendance:', error);
    return [];
  }

  return (data || []).map(s => ({
    slot_id: s.slot_id, // Normalize later if needed
    present_count: s.present_count || 0,
    total_count: s.total_students || 0,
    percentage: s.total_students > 0 
      ? Math.round((s.present_count / s.total_students) * 100) 
      : 0,
  }));
};

// Get weekly attendance trend
// Get class attendance trends (Day/Week/Month)
export const getClassTrends = async (
  dept: string,
  year: number,
  section: string,
  range: 'day' | 'week' | 'month'
): Promise<{ label: string; value: number }[]> => {
  const endDate = new Date();
  const startDate = new Date();
  
  if (range === 'day') {
    // Today's periods
    const todayStr = getLocalDate();
    const { data, error } = await supabase
      .from('attendance_sessions')
      .select('slot_id, present_count, total_students')
      .eq('target_dept', dept)
      .eq('target_year', year)
      .eq('target_section', section)
      .eq('date', todayStr)
      .order('slot_id');

    if (error) {
       console.error('[InchargeService] Error fetching day trends:', error);
       return [];
    }
    
    // Normalization Map
    const slotMap: Record<string, string> = {
        '1': 'P1', 'p1': 'P1', '09:00': 'P1', '9:00': 'P1',
        '2': 'P2', 'p2': 'P2', '09:50': 'P2', '9:50': 'P2',
        '3': 'P3', 'p3': 'P3', '10:50': 'P3',
        '4': 'P4', 'p4': 'P4', '11:40': 'P4', '13:00': 'P4', '13:20': 'P4',
        '5': 'P5', 'p5': 'P5', '14:10': 'P5',
        '6': 'P6', 'p6': 'P6', '15:10': 'P6',
    };
    
    // Sort and Normalize
    const sorted = (data || []).sort((a, b) => a.slot_id.localeCompare(b.slot_id));
    
    return sorted.map(s => {
        const normId = s.slot_id.toLowerCase().replace(/[^a-z0-9]/g, '');
        const label = slotMap[normId] || slotMap[s.slot_id] || s.slot_id.toUpperCase();
        return {
            label: label,
            value: s.total_students > 0 ? Math.round((s.present_count / s.total_students) * 100) : 0
        };
    });

  } else if (range === 'month') {
    // Last 4 weeks (grouped by week)
    startDate.setDate(endDate.getDate() - 28);
    const { data, error } = await supabase
      .from('attendance_sessions')
      .select('date, present_count, total_students')
      .eq('target_dept', dept)
      .eq('target_year', year)
      .eq('target_section', section)
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0]);

     if (error) {
       console.error('[InchargeService] Error fetching month trends:', error);
       return [];
     }

     // Group by Week (Simple 4 buckets of 7 days)
     // Or just group by week number
     // Let's do simple 4 weeks relative to now
     const weeks = [
         { label: 'Week 1', start: new Date(startDate), end: new Date(startDate.getTime() + 7*24*60*60*1000), present: 0, total: 0 },
         { label: 'Week 2', start: new Date(startDate.getTime() + 7*24*60*60*1000), end: new Date(startDate.getTime() + 14*24*60*60*1000), present: 0, total: 0 },
         { label: 'Week 3', start: new Date(startDate.getTime() + 14*24*60*60*1000), end: new Date(startDate.getTime() + 21*24*60*60*1000), present: 0, total: 0 },
         { label: 'Week 4', start: new Date(startDate.getTime() + 21*24*60*60*1000), end: endDate, present: 0, total: 0 },
     ];

     data?.forEach(session => {
         const d = new Date(session.date);
         const week = weeks.find(w => d >= w.start && d < w.end);
         if (week) {
             week.present += (session.present_count || 0);
             week.total += (session.total_students || 0);
         }
     });

     return weeks.map(w => ({
         label: w.label,
         value: w.total > 0 ? Math.round((w.present / w.total) * 100) : 0
     }));

  } else {
    // Default: Week (Daily for last 7 days)
    startDate.setDate(endDate.getDate() - 6);
    const { data, error } = await supabase
        .from('attendance_sessions')
        .select('date, present_count, total_students')
        .eq('target_dept', dept)
        .eq('target_year', year)
        .eq('target_section', section)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])
        .order('date');

    if (error) return [];

    const dailyStats: Record<string, { present: number; total: number }> = {};
    data?.forEach(s => {
        if (!dailyStats[s.date]) dailyStats[s.date] = { present: 0, total: 0 };
        dailyStats[s.date].present += s.present_count;
        dailyStats[s.date].total += s.total_students;
    });

    return Object.keys(dailyStats).sort().map(date => ({
        label: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
        value: dailyStats[date].total > 0 ? Math.round((dailyStats[date].present / dailyStats[date].total) * 100) : 0
    }));
  }
};

// Check permission overlap
export const checkPermissionOverlap = async (
  studentId: string,
  type: 'od' | 'leave',
  startDate: string,
  endDate: string,
  excludeId?: string
): Promise<boolean> => {
  let query = supabase
    .from('attendance_permissions')
    .select('id')
    .eq('student_id', studentId)
    .eq('type', type)
    .eq('is_active', true)
    .or(`start_date.lte.${endDate},end_date.gte.${startDate}`);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[InchargeService] Error checking overlap:', error);
    throw error;
  }

  return (data?.length || 0) > 0;
};

// Add permission (OD or Leave)
export const addPermission = async (
  permission: Omit<Permission, 'id' | 'created_at' | 'is_active'>
): Promise<Permission> => {
  // First check for overlap
  const hasOverlap = await checkPermissionOverlap(
    permission.student_id,
    permission.type,
    permission.start_date,
    permission.end_date
  );

  if (hasOverlap) {
    throw new Error(`Conflict: Student already has ${permission.type} on overlapping date range`);
  }

  const { data, error } = await supabase
    .from('attendance_permissions')
    .insert({
      ...permission,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error('[InchargeService] Error adding permission:', error);
    throw error;
  }

  return data;
};

// Update permission
export const updatePermission = async (
  id: string,
  updates: Partial<Omit<Permission, 'id' | 'student_id' | 'created_at' | 'granted_by'>>
): Promise<Permission> => {
  // If dates or type are changing, check for overlap
  if (updates.start_date && updates.end_date) {
    // We need to fetch the existing permission to get the student_id and type if not provided (though they shouldn't change typically)
    // For simplicity, we assume the caller passes necessary info or we fetch it.
    // However, to be safe, let's fetch the current permission first.
    const { data: current } = await supabase.from('attendance_permissions').select('*').eq('id', id).single();
    if (!current) throw new Error("Permission not found");

    const type = updates.type || current.type;
    const hasOverlap = await checkPermissionOverlap(
      current.student_id,
      type,
      updates.start_date,
      updates.end_date,
      id
    );

    if (hasOverlap) {
      throw new Error(`Conflict: Student already has ${type} on overlapping date range`);
    }
  }

  const { data, error } = await supabase
    .from('attendance_permissions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[InchargeService] Error updating permission:', error);
    throw error;
  }

  return data;
};



// Get permissions granted by faculty
export const getPermissions = async (
  facultyId: string,
  limit: number = 50
): Promise<(Permission & { student?: { full_name: string; roll_no: string } })[]> => {
  const { data, error } = await supabase
    .from('attendance_permissions')
    .select('*, student:students(full_name, roll_no)')
    .eq('granted_by', facultyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[InchargeService] Error fetching permissions:', error);
    throw error;
  }
  return data || [];
};

// Delete permission permanently
export const deletePermission = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('attendance_permissions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[InchargeService] Error deleting permission:', error);
    throw error;
  }
};

export const getStudentByRollNo = async (
  rollNo: string,
  dept: string,
  section: string
): Promise<{ id: string; full_name: string; roll_no: string } | null> => {
  const { data, error } = await supabase
    .from('students')
    .select('id, full_name, roll_no')
    .eq('roll_no', rollNo)
    .eq('dept', dept)
    .eq('section', section)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('[InchargeService] Error fetching student:', error);
    throw error;
  }

  return data;
};

// Get current semester from app_config
export const getCurrentSemester = async (): Promise<string | null> => {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'semester')
    .single();

  if (error) {
    console.error('[InchargeService] Error fetching semester:', error);
    return null; // Fail gracefully
  }

  // Value is JSONB, so it might be a string "1" or number 1.
  return data?.value ? String(data.value).replace(/"/g, '') : null; 
};

export default {
  getClassStudents,
  getWatchlist,
  getKeyPeriodAttendance,
  getAllPeriodAttendance,
  checkPermissionOverlap,
  addPermission,
  getStudentByRollNo,
  getAssignedClass,
  getPermissions,
  deletePermission,
  updatePermission,
  getCurrentSemester,
};
