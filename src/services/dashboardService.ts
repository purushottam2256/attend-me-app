/**
 * Dashboard Data Service
 * Fetches real data from Supabase using existing schema
 * Schema: database/schema.sql
 */

import { supabase } from '../config/supabase';
import createLogger from '../utils/logger';
import { withTimeout } from '../utils/withTimeout';

const log = createLogger('DashboardService');

// Types matching existing schema
export interface TimetableSlot {
  id: string;
  day: string;
  slot_id: string;
  start_time: string;
  end_time: string;
  room: string | null;
  subject: {
    id: string;
    name: string;
    code: string;
  };
  target_dept: string;
  target_year: number;
  target_section: string;
  batch: number | null;
  isSwap?: boolean; // Added to support swap class indicating
}

export interface Student {
  id: string;
  roll_no: string;
  full_name: string;
  bluetooth_uuid: string | null;
  batch?: number | null;
}

export interface AttendanceSession {
  id: string;
  date: string;
  slot_id: string;
  subject: { name: string; code: string };
  target_dept: string;
  target_section: string;
  target_year: number;
  batch?: number | null;
  present_count: number;
  absent_count: number;
  od_count?: number;
  total_students: number;
}

// =====================================================
// TIMETABLE / SCHEDULE FUNCTIONS
// =====================================================

/**
 * Get today's timetable for the logged-in faculty
 * Uses server-side RPC to resolve swaps in one call (no N+1 queries)
 */
export async function getTodaySchedule(facultyId: string): Promise<TimetableSlot[]> {
  try {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDate = new Date();
    const todayDay = days[todayDate.getDay()];
    const todayStr = todayDate.toISOString().split('T')[0];

    const { data, error } = await withTimeout(
      supabase.rpc('get_faculty_schedule', {
        p_faculty_id: facultyId,
        p_day: todayDay,
        p_date: todayStr,
      }),
      10000,
      'getTodaySchedule',
    );

    if (error) {
      log.error('RPC get_faculty_schedule error:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      day: row.day,
      slot_id: row.slot_id,
      start_time: row.start_time,
      end_time: row.end_time,
      room: row.room,
      target_dept: row.target_dept,
      target_year: row.target_year,
      target_section: row.target_section,
      batch: row.batch,
      subject: {
        id: row.subject_id,
        name: row.subject_name,
        code: row.subject_code,
      },
      isSwap: row.is_swap,
    }));
  } catch (error) {
    log.error('Schedule fetch error:', error);
    return [];
  }
}



/**
 * Get full schedule for the week
 */
export async function getWeeklySchedule(facultyId: string): Promise<TimetableSlot[]> {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('master_timetables')
        .select(`
          id,
          day,
          slot_id,
          start_time,
          end_time,
          room,
          target_dept,
          target_year,
          target_section,
          batch,
          subjects:subject_id (id, name, code)
        `)
        .eq('faculty_id', facultyId)
        .eq('is_active', true)
        .order('day')
        .order('start_time'),
      10000,
      'getWeeklySchedule',
    );

    if (error) {
      log.error('Error fetching schedule for day:', error);
      return [];
    }

    return (data || []).map((item: any) => ({
      ...item,
      subject: item.subjects,
    }));
  } catch (error) {
    log.error('Schedule fetch error:', error);
    return [];
  }
}

/**
 * Get schedule for a specific day
 */
export async function getScheduleForDay(facultyId: string, day: string): Promise<TimetableSlot[]> {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('master_timetables')
        .select(`
          id,
          day,
          slot_id,
          start_time,
          end_time,
          room,
          target_dept,
          target_year,
          target_section,
          batch,
          subjects:subject_id (id, name, code)
        `)
        .eq('faculty_id', facultyId)
        .eq('day', day)
        .eq('is_active', true)
        .order('start_time'),
      10000,
      'getScheduleForDay',
    );

    if (error) {
      log.error('Error fetching schedule for day:', error);
      return [];
    }

    return (data || []).map((item: any) => ({
      ...item,
      subject: item.subjects,
    }));
  } catch (error) {
    log.error('Schedule fetch error:', error);
    return [];
  }
}

/**
 * Get tomorrow's timetable for the logged-in faculty
 */
export async function getTomorrowSchedule(facultyId: string): Promise<TimetableSlot[]> {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDay = days[tomorrow.getDay()];
  
  return getScheduleForDay(facultyId, tomorrowDay);
}

/**
 * Get schedule status (check if attendance already marked)
 */
export async function getScheduleWithStatus(facultyId: string): Promise<(TimetableSlot & { status: string })[]> {
  try {
    const schedule = await getTodaySchedule(facultyId);
    const todayStr = new Date().toISOString().split('T')[0];

    // Get today's sessions
    const { data: sessions } = await withTimeout(
      supabase
        .from('attendance_sessions')
        .select('slot_id')
        .eq('faculty_id', facultyId)
        .eq('date', todayStr),
      10000,
      'getScheduleWithStatus',
    );

    const markedSlots = new Set((sessions || []).map(s => s.slot_id));

    return schedule.map(slot => ({
      ...slot,
      status: markedSlots.has(slot.slot_id) ? 'completed' : 'pending',
    }));
  } catch (error) {
    log.error('Schedule status error:', error);
    return [];
  }
}

// =====================================================
// SWAP & SUBSTITUTION FUNCTIONS
// =====================================================

export interface SwapInfo {
  id: string;
  date: string;
  slot_id: string; // usually null or derived
  faculty_a_id: string;
  faculty_b_id: string;
  slot_a_id: string;
  slot_b_id: string;
  status: string;
  acquiredClass?: {
    start_time: string;
    end_time: string;
    room: string | null;
    target_dept: string;
    target_year: number;
    target_section: string;
    subject: { id: string; name: string; code: string };
  } | null;
}

export interface SubstitutionInfo {
  id: string;
  date: string;
  slot_id: string;
  original_faculty_id: string;
  substitute_faculty_id: string | null;
  subject: { id: string; name: string; code: string };
  target_dept: string;
  target_year: number;
  target_section: string;
  status: string;
}

export interface HolidayInfo {
  id: string;
  date: string;
  type: string;
  title: string;
  description: string | null;
}

/**
 * Get swaps and substitutions for a faculty on a given date
 */
export async function getSwapsAndSubstitutions(
  facultyId: string,
  date: string = new Date().toISOString().split('T')[0]
): Promise<{ swaps: SwapInfo[]; substitutions: SubstitutionInfo[] }> {
  try {
    // Fetch swaps where faculty is involved
    const { data: swaps } = await withTimeout(
      supabase
        .from('class_swaps')
        .select('*')
        .eq('date', date)
        .eq('status', 'accepted')
        .or(`faculty_a_id.eq.${facultyId},faculty_b_id.eq.${facultyId}`),
      10000,
      'getSwaps:fetchSwaps',
    );

    // Enrich swaps with acquired class details
    const enrichedSwaps = await Promise.all((swaps || []).map(async (swap: any) => {
      // Determine which slot I am acquiring
      // If I am A, I acquire B's slot. If I am B, I acquire A's slot.
      const isFacultyA = swap.faculty_a_id === facultyId;
      const targetFacultyId = isFacultyA ? swap.faculty_b_id : swap.faculty_a_id;
      const targetSlotId = isFacultyA ? swap.slot_b_id : swap.slot_a_id;
      
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = days[new Date(date).getDay()];

      const { data: details } = await withTimeout(
        supabase
          .from('master_timetables')
          .select(`
            id, slot_id,
            start_time, end_time, room, 
            target_dept, target_year, target_section,
            subjects:subject_id(id, name, code)
          `)
          .eq('faculty_id', targetFacultyId)
          .eq('slot_id', targetSlotId)
          .eq('day', dayName)
          .maybeSingle(),
        10000,
        'getSwaps:fetchSlotDetails',
      );
      
      return {
        ...swap,
        acquiredClass: details ? { ...details, subject: details.subjects } : null
      };
    }));

    // Fetch substitutions where faculty is the substitute
    const { data: subs } = await withTimeout(
      supabase
        .from('substitutions')
        .select(`
          id,
          date,
          slot_id,
          original_faculty_id,
          substitute_faculty_id,
          subject:subject_id (id, name, code),
          target_dept,
          target_year,
          target_section,
          status
        `)
        .eq('date', date)
        .eq('status', 'accepted')
        .eq('substitute_faculty_id', facultyId),
      10000,
      'getSwaps:fetchSubs',
    );

    return {
      swaps: enrichedSwaps as SwapInfo[],
      substitutions: (subs || []).map((s: any) => ({
        ...s,
        subject: s.subject,
      })),
    };
  } catch (error) {
    log.error('Error fetching swaps/subs:', error);
    return { swaps: [], substitutions: [] };
  }
}

/**
 * Check if today is a holiday or has suspended classes
 */
export async function getHolidayInfo(
  date: string = new Date().toISOString().split('T')[0]
): Promise<HolidayInfo | null> {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('academic_calendar')
        .select('*')
        .eq('date', date)
        .eq('type', 'holiday')
        .single(),
      10000,
      'getHolidayInfo',
    );

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export interface LeaveInfo {
  id: string;
  leave_type: string;
  status: string;
}

/**
 * Check if the user is currently on an approved leave
 */
export async function getLeaveInfo(
  facultyId: string,
  date: string = new Date().toISOString().split('T')[0]
): Promise<LeaveInfo | null> {
  try {
    // Check if there is an approved leave overlapping today
    const { data, error } = await withTimeout(
      supabase
        .from('faculty_leaves')
        .select('id, leave_type, status')
        .eq('faculty_id', facultyId)
        .eq('status', 'approved')
        .lte('start_date', date)
        .gte('end_date', date)
        .maybeSingle(),
      10000,
      'getLeaveInfo',
    );

    if (error || !data) return null;
    return data as LeaveInfo;
  } catch {
    return null;
  }
}
// =====================================================
// STUDENT FUNCTIONS
// =====================================================

/**
 * Get students for a class (using stored function if available)
 */
export async function getStudentsForClass(
  dept: string,
  year: number,
  section: string,
  batch?: number | null
): Promise<Student[]> {
  try {
    let query = supabase
      .from('students')
      .select('id, roll_no, full_name, bluetooth_uuid, batch')
      .eq('dept', dept)
      .eq('year', year)
      .eq('section', section)
      .eq('is_active', true)
      .order('roll_no');

    if (batch) {
      query = query.eq('batch', batch);
    }

    const { data, error } = await withTimeout(query, 10000, 'getStudentsForClass');

    if (error) {
      log.error('Error fetching students:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    log.error('Students fetch error:', error);
    return [];
  }
}

// =====================================================
// ATTENDANCE SESSION FUNCTIONS
// =====================================================

/**
 * Create a new attendance session
 * @param isSubstitute - Set true when a substitute faculty is taking this class
 * @param originalFacultyId - The original faculty's ID when this is a substitution
 */
export async function createAttendanceSession(
  facultyId: string,
  subjectId: string,
  slotId: string,
  targetDept: string,
  targetYear: number,
  targetSection: string,
  totalStudents: number,
  batch?: number | null,
  isSubstitute: boolean = false,
  originalFacultyId?: string | null
): Promise<{ sessionId: string | null; error: string | null }> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // STEP 1: Delete any existing session for the same faculty, date, and slot
    // This handles re-scans (override) by removing old data first
    const { data: existingSession } = await supabase
      .from('attendance_sessions')
      .select('id')
      .eq('faculty_id', facultyId)
      .eq('date', today)
      .eq('slot_id', slotId)
      .single();
    
    if (existingSession) {
      log.info('Deleting existing session:', existingSession.id);
      
      // First delete attendance logs for this session
      await supabase
        .from('attendance_logs')
        .delete()
        .eq('session_id', existingSession.id);
      
      // Then delete the session itself
      await supabase
        .from('attendance_sessions')
        .delete()
        .eq('id', existingSession.id);
    }
    
    // STEP 2: Create new attendance session
    // For substitutions: faculty_id = original faculty, substitute_faculty_id = substitute
    const sessionData: any = {
      faculty_id: isSubstitute && originalFacultyId ? originalFacultyId : facultyId,
      subject_id: subjectId,
      slot_id: slotId,
      date: today,
      start_time: new Date().toISOString(),
      target_dept: targetDept,
      target_year: targetYear,
      target_section: targetSection,
      batch: batch || null,
      total_students: totalStudents,
      is_substitute: isSubstitute,
      substitute_faculty_id: isSubstitute ? facultyId : null,
    };
    
    const { data, error } = await supabase
      .from('attendance_sessions')
      .insert(sessionData)
      .select('id')
      .single();

    if (error) {
      log.error('Error creating session:', error);
      return { sessionId: null, error: error.message };
    }

    return { sessionId: data?.id || null, error: null };
  } catch (error) {
    log.error('Create session error:', error);
    return { sessionId: null, error: 'Failed to create session' };
  }
}

/**
 * Check if a session already exists for this slot
 */
export async function checkExistingSession(
  facultyId: string, 
  slotId: string,
  isSubstitute: boolean = false,
  originalFacultyId?: string | null
): Promise<boolean> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const targetFacultyId = isSubstitute && originalFacultyId ? originalFacultyId : facultyId;
    
    const { data } = await supabase
      .from('attendance_sessions')
      .select('id')
      .eq('faculty_id', targetFacultyId)
      .eq('date', today)
      .eq('slot_id', slotId)
      .maybeSingle();
      
    return !!data;
  } catch (error) {
    log.error('Error checking session:', error);
    return false;
  }
}

/**
 * Submit attendance logs for a session
 */
export async function submitAttendance(
  sessionId: string,
  facultyId: string,
  records: { studentId: string; status: 'present' | 'absent' | 'od' | 'leave' }[]
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Insert attendance logs
    const insertData = records.map(r => ({
      session_id: sessionId,
      student_id: r.studentId,
      status: r.status,
      marked_at: new Date().toISOString(),
      is_manual: true,
    }));

    const { error: logError } = await supabase
      .from('attendance_logs')
      .insert(insertData);

    if (logError) {
      log.error('Error inserting logs:', logError);
      return { success: false, error: logError.message };
    }

    // Update session counts
    // IMPORTANT: Count each status EXACTLY once to satisfy valid_counts constraint
    const presentCount = records.filter(r => r.status === 'present').length;
    const absentCount = records.filter(r => r.status === 'absent').length;
    const odCount = records.filter(r => r.status === 'od').length;
    const leaveCount = records.filter(r => r.status === 'leave').length;

    const { error: updateError } = await supabase
      .from('attendance_sessions')
      .update({
        present_count: presentCount,
        absent_count: absentCount,
        od_count: odCount,
        leave_count: leaveCount,
        end_time: new Date().toISOString(),
        is_synced: true,
        synced_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (updateError) {
      log.error('Error updating session:', updateError);
      return { success: false, error: updateError.message };
    }

    return { success: true, error: null };
  } catch (error) {
    log.error('Submit attendance error:', error);
    return { success: false, error: 'Failed to submit attendance' };
  }
}

// =====================================================
// HISTORY / REPORTS FUNCTIONS
// =====================================================

/**
 * Get attendance history for faculty
 * Includes substitution info - both when user substituted for someone and when someone substituted for user
 * @param dateStr - Optional ISO date string to filter by specific date (YYYY-MM-DD)
 * @param page - Page number for pagination (0-indexed)
 */
export async function getAttendanceHistory(
  facultyId: string,
  classFilter?: string,
  limit: number = 30,
  dateStr?: string,
  page: number = 0
): Promise<AttendanceSession[]> {
  try {
    // Query sessions where this faculty is the owner OR they substituted
    let query = supabase
      .from('attendance_sessions')
      .select(`
        id,
        faculty_id,
        date,
        slot_id,
        target_dept,
        target_section,
        target_year,
        batch,
        present_count,
        absent_count,
        od_count,
        total_students,
        is_substitute,
        substitute_faculty_id,
        subjects:subject_id (name, code),
        substitute:substitute_faculty_id (full_name)
      `)
      .or(`faculty_id.eq.${facultyId},substitute_faculty_id.eq.${facultyId}`)
      .order('date', { ascending: false })
      .order('start_time', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    // Server-side date filter — avoids loading ALL records
    if (dateStr) {
      query = query.eq('date', dateStr);
    }

    if (classFilter && classFilter !== 'All') {
      query = query.ilike('target_section', classFilter);
    }

    const { data, error } = await query;

    if (error) {
      log.error('Error fetching history:', error);
      return [];
    }

    // Batch-fetch original faculty names instead of N+1 queries
    const substituteItems = (data || []).filter(
      (item: any) => item.substitute_faculty_id === facultyId && item.faculty_id !== facultyId
    );
    const uniqueFacultyIds = [...new Set(substituteItems.map((item: any) => item.faculty_id))];

    let facultyNameMap: Record<string, string> = {};
    if (uniqueFacultyIds.length > 0) {
      const { data: faculties } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', uniqueFacultyIds);
      if (faculties) {
        facultyNameMap = Object.fromEntries(faculties.map((f: any) => [f.id, f.full_name]));
      }
    }

    const sessionsWithSubInfo = (data || []).map((item: any) => ({
      ...item,
      subject: item.subjects,
      substituteFacultyName: item.substitute?.full_name || null,
      originalFacultyName: facultyNameMap[item.faculty_id] || null,
      isUserSubstitute: item.substitute_faculty_id === facultyId && item.faculty_id !== facultyId,
      isUserOriginal: item.faculty_id === facultyId && item.is_substitute,
    }));

    return sessionsWithSubInfo;
  } catch (error) {
    log.error('History fetch error:', error);
    return [];
  }
}

/**
 * Get quick stats for dashboard — uses server-side RPC (single call)
 */
export async function getDashboardStats(facultyId: string): Promise<{
  classesToday: number;
  pendingCount: number;
  totalStudents: number;
}> {
  try {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];
    const todayStr = new Date().toISOString().split('T')[0];

    const { data, error } = await withTimeout(
      supabase.rpc('get_dashboard_stats', {
        p_faculty_id: facultyId,
        p_day: today,
        p_date: todayStr,
      }),
      10000,
      'getDashboardStats',
    );

    if (error) {
      log.error('RPC get_dashboard_stats error:', error);
      return { classesToday: 0, pendingCount: 0, totalStudents: 0 };
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      classesToday: row?.classes_today || 0,
      pendingCount: row?.pending_count || 0,
      totalStudents: Number(row?.total_students || 0),
    };
  } catch (error) {
    console.error('Stats fetch error:', error);
    return { classesToday: 0, pendingCount: 0, totalStudents: 0 };
  }
}

// =====================================================
// SUBJECTS FUNCTIONS
// =====================================================

/**
 * Get all subjects for a faculty
 */
export async function getFacultySubjects(facultyId: string): Promise<{ id: string; name: string; code: string }[]> {
  try {
    const { data, error } = await supabase
      .from('master_timetables')
      .select('subjects:subject_id (id, name, code)')
      .eq('faculty_id', facultyId)
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching subjects:', error);
      return [];
    }

    // Extract unique subjects
    const subjectMap = new Map<string, { id: string; name: string; code: string }>();
    (data || []).forEach((item: any) => {
      if (item.subjects) {
        subjectMap.set(item.subjects.id, item.subjects);
      }
    });

    return Array.from(subjectMap.values());
  } catch (error) {
    console.error('Subjects fetch error:', error);
    return [];
  }
}

// =====================================================
// PERMISSION FUNCTIONS
// =====================================================

/**
 * Get active permissions for a list of students on a specific date
 */
export async function getClassPermissions(
  studentIds: string[],
  date: string = new Date().toISOString().split('T')[0]
): Promise<{ student_id: string; type: 'od' | 'leave' }[]> {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('attendance_permissions')
        .select('student_id, type')
        .in('student_id', studentIds)
        .eq('is_active', true)
        .lte('start_date', date)
        .gte('end_date', date),
      10000,
      'getClassPermissions',
    );

    if (error) {
      console.error('Error fetching class permissions:', error);
      return [];
    }

    return (data || []).map((p: any) => ({
      student_id: p.student_id,
      type: p.type as 'od' | 'leave',
    }));
  } catch (error) {
    console.error('Permissions fetch error:', error);
    return [];
  }
}

// =====================================================
// UTILITIES
// =====================================================

/**
 * Get ALL unique classes (Dept-Year-Section) a faculty teaches.
 * Used for Smart Roster Sync to cache students for these classes.
 */
export async function getAllFacultyClasses(facultyId: string): Promise<{ target_dept: string; target_year: number; target_section: string; subject_name: string }[]> {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('master_timetables')
        .select(`
          target_dept,
          target_year,
          target_section,
          subjects:subject_id (name)
        `)
        .eq('faculty_id', facultyId)
        .eq('is_active', true),
      10000,
      'getAllFacultyClasses',
    );

    if (error) {
      console.error('Error fetching all faculty classes:', error);
      return [];
    }

    // Deduplicate based on Dept-Year-Section key
    const uniqueClasses = new Map<string, any>();
    
    (data || []).forEach((item: any) => {
      const key = `${item.target_dept}-${item.target_year}-${item.target_section}`;
      if (!uniqueClasses.has(key)) {
        uniqueClasses.set(key, {
            target_dept: item.target_dept,
            target_year: item.target_year,
            target_section: item.target_section,
            subject_name: item.subjects?.name || 'Class'
        });
      }
    });

    return Array.from(uniqueClasses.values());
  } catch (error) {
    console.error('getFacultyClasses error:', error);
    return [];
  }
}
