/**
 * Dashboard Data Service
 * Fetches real data from Supabase using existing schema
 * Schema: database/schema.sql
 */

import { supabase } from '../config/supabase';

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
}

export interface Student {
  id: string;
  roll_no: string;
  full_name: string;
  bluetooth_uuid: string | null;
}

export interface AttendanceSession {
  id: string;
  date: string;
  slot_id: string;
  subject: { name: string; code: string };
  target_dept: string;
  target_section: string;
  target_year: number;
  present_count: number;
  absent_count: number;
  total_students: number;
}

// =====================================================
// TIMETABLE / SCHEDULE FUNCTIONS
// =====================================================

/**
 * Get today's timetable for the logged-in faculty
 */
export async function getTodaySchedule(facultyId: string): Promise<TimetableSlot[]> {
  try {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];

    const { data, error } = await supabase
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
      .eq('day', today)
      .eq('is_active', true)
      .order('start_time');

    if (error) {
      console.error('Error fetching timetable:', error);
      return [];
    }

    return (data || []).map((item: any) => ({
      ...item,
      subject: item.subjects,
    }));
  } catch (error) {
    console.error('Schedule fetch error:', error);
    return [];
  }
}

/**
 * Get schedule for a specific day
 */
export async function getScheduleForDay(facultyId: string, day: string): Promise<TimetableSlot[]> {
  try {
    const { data, error } = await supabase
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
      .order('start_time');

    if (error) {
      console.error('Error fetching schedule for day:', error);
      return [];
    }

    return (data || []).map((item: any) => ({
      ...item,
      subject: item.subjects,
    }));
  } catch (error) {
    console.error('Schedule fetch error:', error);
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
    const { data: sessions } = await supabase
      .from('attendance_sessions')
      .select('slot_id')
      .eq('faculty_id', facultyId)
      .eq('date', todayStr);

    const markedSlots = new Set((sessions || []).map(s => s.slot_id));

    return schedule.map(slot => ({
      ...slot,
      status: markedSlots.has(slot.slot_id) ? 'completed' : 'pending',
    }));
  } catch (error) {
    console.error('Schedule status error:', error);
    return [];
  }
}

// =====================================================
// SWAP & SUBSTITUTION FUNCTIONS
// =====================================================

export interface SwapInfo {
  id: string;
  date: string;
  slot_id: string;
  faculty_a_id: string;
  faculty_b_id: string;
  slot_a_id: string;
  slot_b_id: string;
  status: string;
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
    const { data: swaps } = await supabase
      .from('class_swaps')
      .select('*')
      .eq('date', date)
      .eq('status', 'accepted')
      .or(`faculty_a_id.eq.${facultyId},faculty_b_id.eq.${facultyId}`);

    // Fetch substitutions where faculty is the substitute
    const { data: subs } = await supabase
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
      .eq('substitute_faculty_id', facultyId);

    return {
      swaps: swaps || [],
      substitutions: (subs || []).map((s: any) => ({
        ...s,
        subject: s.subject,
      })),
    };
  } catch (error) {
    console.error('Error fetching swaps/subs:', error);
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
    const { data, error } = await supabase
      .from('academic_calendar')
      .select('*')
      .eq('date', date)
      .eq('type', 'holiday')
      .single();

    if (error || !data) return null;
    return data;
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
      .select('id, roll_no, full_name, bluetooth_uuid')
      .eq('dept', dept)
      .eq('year', year)
      .eq('section', section)
      .eq('is_active', true)
      .order('roll_no');

    if (batch) {
      query = query.eq('batch', batch);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching students:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Students fetch error:', error);
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
      console.log('[createAttendanceSession] Deleting existing session:', existingSession.id);
      
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
      console.error('Error creating session:', error);
      return { sessionId: null, error: error.message };
    }

    return { sessionId: data?.id || null, error: null };
  } catch (error) {
    console.error('Create session error:', error);
    return { sessionId: null, error: 'Failed to create session' };
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
      console.error('Error inserting logs:', logError);
      return { success: false, error: logError.message };
    }

    // Update session counts
    const presentCount = records.filter(r => r.status === 'present' || r.status === 'od').length;
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
      console.error('Error updating session:', updateError);
      return { success: false, error: updateError.message };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Submit attendance error:', error);
    return { success: false, error: 'Failed to submit attendance' };
  }
}

// =====================================================
// HISTORY / REPORTS FUNCTIONS
// =====================================================

/**
 * Get attendance history for faculty
 * Includes substitution info - both when user substituted for someone and when someone substituted for user
 */
export async function getAttendanceHistory(
  facultyId: string,
  classFilter?: string,
  limit: number = 50
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
        present_count,
        absent_count,
        total_students,
        is_substitute,
        substitute_faculty_id,
        subjects:subject_id (name, code),
        substitute:substitute_faculty_id (full_name)
      `)
      .or(`faculty_id.eq.${facultyId},substitute_faculty_id.eq.${facultyId}`)
      .order('date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(limit);

    if (classFilter && classFilter !== 'All') {
      query = query.ilike('target_section', classFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching history:', error);
      return [];
    }

    // Also fetch original faculty names for sessions where current user was substitute
    const sessionsWithSubInfo = await Promise.all((data || []).map(async (item: any) => {
      let originalFacultyName = null;
      
      // If current user was the substitute, fetch original faculty name
      if (item.substitute_faculty_id === facultyId && item.faculty_id !== facultyId) {
        const { data: origFaculty } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', item.faculty_id)
          .single();
        originalFacultyName = origFaculty?.full_name;
      }
      
      return {
        ...item,
        subject: item.subjects,
        substituteFacultyName: item.substitute?.full_name || null,
        originalFacultyName,
        isUserSubstitute: item.substitute_faculty_id === facultyId && item.faculty_id !== facultyId,
        isUserOriginal: item.faculty_id === facultyId && item.is_substitute,
      };
    }));

    return sessionsWithSubInfo;
  } catch (error) {
    console.error('History fetch error:', error);
    return [];
  }
}

/**
 * Get quick stats for dashboard
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

    // Get today's scheduled classes
    const { data: timetableData } = await supabase
      .from('master_timetables')
      .select('id, slot_id')
      .eq('faculty_id', facultyId)
      .eq('day', today)
      .eq('is_active', true);

    const classesToday = timetableData?.length || 0;

    // Get completed sessions today
    const { data: sessionsData } = await supabase
      .from('attendance_sessions')
      .select('slot_id')
      .eq('faculty_id', facultyId)
      .eq('date', todayStr);

    const completedSlots = new Set((sessionsData || []).map(s => s.slot_id));
    const pendingCount = (timetableData || []).filter(t => !completedSlots.has(t.slot_id)).length;

    // Get unique classes and count students
    const { data: classData } = await supabase
      .from('master_timetables')
      .select('target_dept, target_year, target_section')
      .eq('faculty_id', facultyId)
      .eq('is_active', true);

    let totalStudents = 0;
    if (classData && classData.length > 0) {
      // Get unique class combinations
      const uniqueClasses = new Map<string, { dept: string; year: number; section: string }>();
      classData.forEach(c => {
        const key = `${c.target_dept}-${c.target_year}-${c.target_section}`;
        uniqueClasses.set(key, { dept: c.target_dept, year: c.target_year, section: c.target_section });
      });

      // Count students for each unique class
      for (const cls of uniqueClasses.values()) {
        const { count } = await supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('dept', cls.dept)
          .eq('year', cls.year)
          .eq('section', cls.section)
          .eq('is_active', true);
        totalStudents += count || 0;
      }
    }

    return { classesToday, pendingCount, totalStudents };
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
    const { data, error } = await supabase
      .from('attendance_permissions')
      .select('student_id, type')
      .in('student_id', studentIds)
      .eq('is_active', true)
      .lte('start_date', date)
      .gte('end_date', date);

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
