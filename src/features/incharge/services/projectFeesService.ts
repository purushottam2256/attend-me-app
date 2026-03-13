import { supabase } from '../../../config/supabase';

export interface ProjectFee {
  id: string;
  title: string;
  description: string;
  amount: number;
  due_date: string;
  is_complete: boolean;
}

export interface ProjectFeeStudent {
  student_id: string;
  full_name: string;
  roll_no: string;
  status: 'paid' | 'due';
  reason?: string;
}

export const projectFeesService = {
  /**
   * Fetch all fee projects applicable to a specific class
   */
  getAvailableProjectsForClass: async (dept: string, year: number, section: string): Promise<ProjectFee[]> => {
    try {
      const { data, error } = await supabase
        .from('project_fee_classes')
        .select(`
          fee_id,
          project_fees (
            id, title, description, amount, due_date, is_complete
          )
        `)
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section);

      if (error) throw error;
      
      // Filter out completed ones if you only want active ones, but for now we'll return all
      // and let the UI decide. The schema maps 'project_fees' as an object or array depending on the fk.
      // Since project_fees is the parent, it should be an object.
      return (data || []).map((row: any) => row.project_fees as ProjectFee);
    } catch (error) {
      console.error('Error fetching project fees for class:', error);
      throw error;
    }
  },

  /**
   * Fetch all students for a class and their fee status for a specific project
   */
  getProjectFeeStudents: async (
    feeId: string, 
    dept: string, 
    year: number, 
    section: string
  ): Promise<ProjectFeeStudent[]> => {
    try {
      // 1. Get all students for this class
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('id, full_name, roll_no')
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        .eq('is_active', true)
        .order('roll_no', { ascending: true });

      if (studentsError) throw studentsError;
      if (!students || students.length === 0) return [];

      // 2. Get fee student records for this project
      const { data: records, error: recordsError } = await supabase
        .from('project_fee_students')
        .select('student_id, status, reason')
        .eq('fee_id', feeId);

      if (recordsError) throw recordsError;

      // 3. Merge them
      const recordsMap = new Map((records || []).map(r => [r.student_id, r]));

      return students.map(s => {
        const record = recordsMap.get(s.id);
        return {
          student_id: s.id,
          full_name: s.full_name,
          roll_no: s.roll_no,
          status: record ? (record.status as 'paid' | 'due') : 'due',
          reason: record?.reason || '',
        };
      });
    } catch (error) {
      console.error('Error fetching project fee students:', error);
      throw error;
    }
  },

  /**
   * Upsert a single student's fee record
   */
  updateStudentFeeStatus: async (
    feeId: string, 
    studentId: string, 
    status: 'paid' | 'due', 
    reason: string
  ): Promise<void> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // We will perform an upsert on project_fee_students
      const { error } = await supabase
        .from('project_fee_students')
        .upsert({
          fee_id: feeId,
          student_id: studentId,
          status: status,
          reason: reason || null,
          updated_by: user?.id,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'fee_id, student_id'
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error updating student fee status:', error);
      throw error;
    }
  },

  /**
   * Bulk update students fee status
   */
  bulkUpdateStudentFeeStatus: async (
    feeId: string,
    updates: { student_id: string; status: 'paid' | 'due'; reason: string }[]
  ): Promise<void> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const payload = updates.map(u => ({
        fee_id: feeId,
        student_id: u.student_id,
        status: u.status,
        reason: u.reason || null,
        updated_by: user?.id,
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('project_fee_students')
        .upsert(payload, {
          onConflict: 'fee_id, student_id'
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error in bulk updating student fee statuses:', error);
      throw error;
    }
  }
};
