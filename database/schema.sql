-- ============================================================================
-- MRCE ATTEND-ME & INSIGHT - COMPLETE SUPABASE SCHEMA
-- Version: 1.0 (Free Tier Compatible)
-- ============================================================================
-- This schema includes all tables, RLS policies, triggers, functions, and
-- indexes required for both the mobile app (Attend-Me) and web app (Insight)
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

-- Enable required extensions (all free tier compatible)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search (free tier)

-- ============================================================================
-- ENUMS
-- ============================================================================

-- User roles
CREATE TYPE user_role AS ENUM (
    'faculty',
    'class_incharge',
    'lab_incharge',
    'management',
    'hod',
    'principal',
    'developer'
);

-- Attendance status
CREATE TYPE attendance_status AS ENUM (
    'present',
    'absent',
    'od',
    'leave',
    'pending'
);

-- OD categories
CREATE TYPE od_category AS ENUM (
    'dept_work',
    'club_work',
    'event',
    'drive',
    'other'
);

-- Notification types
CREATE TYPE notification_type AS ENUM (
    'substitute_request',
    'substitute_accepted',
    'substitute_declined',
    'class_reminder',
    'management_update',
    'exam_duty_reminder',
    'swap_request',
    'swap_accepted',
    'broadcast',
    'system',
    'holiday',
    'exam',
    'event'
);

-- Notification priority
CREATE TYPE notification_priority AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);

-- Request status
CREATE TYPE request_status AS ENUM (
    'pending',
    'accepted',
    'declined',
    'cancelled',
    'expired'
);

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES (Linked to auth.users)
-- ----------------------------------------------------------------------------
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'faculty',
    dept TEXT,
    faculty_id TEXT UNIQUE,
    mobile TEXT,
    is_biometric_enabled BOOLEAN DEFAULT FALSE,
    device_token TEXT, -- For FCM push notifications (Legacy)
    push_token TEXT, -- For Push Notifications
    push_token_type TEXT, -- Type: 'fcm' (Android), 'apns' (iOS), or 'expo'
    push_token_updated_at TIMESTAMPTZ, -- When push token was last updated
    avatar_url TEXT, -- Profile picture URL
    is_on_leave BOOLEAN DEFAULT FALSE,
    notifications_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_dept ON public.profiles(dept);
CREATE INDEX idx_profiles_faculty_id ON public.profiles(faculty_id);

-- ----------------------------------------------------------------------------
-- 2. ADMINS (Web App Administrators)
-- ----------------------------------------------------------------------------
CREATE TABLE public.admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT UNIQUE NOT NULL, -- cse-hod, management, etc.
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL, -- hod, management, developer, principal
    dept TEXT, -- NULL for super admins
    password_hash TEXT, -- Managed by Supabase Auth, but we track here
    is_active BOOLEAN DEFAULT TRUE,
    avatar_url TEXT,
    phone TEXT,
    designation TEXT,
    joining_date DATE,
    gender TEXT,
    qualification TEXT,
    experience_years INTEGER,
    address TEXT,
    date_of_birth DATE,
    blood_group TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_role CHECK (role IN ('hod', 'management', 'developer', 'principal'))
);

-- Indexes
CREATE INDEX idx_admins_username ON public.admins(username);
CREATE INDEX idx_admins_role ON public.admins(role);
CREATE INDEX idx_admins_dept ON public.admins(dept);

-- ----------------------------------------------------------------------------
-- 3. DEPARTMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE public.departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL, -- CSE, ECE, H&S, etc.
    name TEXT NOT NULL,
    hod_id UUID REFERENCES public.profiles(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_departments_code ON public.departments(code);

-- ----------------------------------------------------------------------------
-- 4. STUDENTS
-- ----------------------------------------------------------------------------
CREATE TABLE public.students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    roll_no TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    mobile TEXT,
    parent_mobile TEXT,
    gender TEXT,
    blood_group TEXT,
    dob DATE,
    year INTEGER NOT NULL CHECK (year BETWEEN 1 AND 4),
    dept TEXT NOT NULL,
    section TEXT NOT NULL,
    batch INTEGER CHECK (batch IN (1, 2)), -- For lab sessions
    bluetooth_uuid TEXT UNIQUE, -- Beacon UUID
    face_id_data TEXT, -- Encrypted face recognition data
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_roll_dept_section UNIQUE (roll_no, dept, section, year)
);

-- Indexes
CREATE INDEX idx_students_roll_no ON public.students(roll_no);
CREATE INDEX idx_students_dept_section_year ON public.students(dept, section, year);
CREATE INDEX idx_students_bluetooth_uuid ON public.students(bluetooth_uuid);
-- Note: pg_trgm extension must be enabled for this index
-- If error occurs, ensure extension is enabled: CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_students_name_trgm ON public.students USING gin(full_name gin_trgm_ops); -- Fuzzy search

-- ----------------------------------------------------------------------------
-- 5. SUBJECTS
-- ----------------------------------------------------------------------------
CREATE TABLE public.subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL, -- CS304, DM, etc.
    name TEXT NOT NULL,
    dept TEXT,
    year INTEGER,
    credits INTEGER,
    acronym TEXT,                              -- Short keyword: SNA, COT, CAI
    semester INTEGER,                          -- 1-8
    regulation TEXT DEFAULT 'R22',             -- R22, R20 etc
    is_lab BOOLEAN DEFAULT FALSE,
    batch TEXT,                                -- NULL=all, B1, B2
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_subjects_code ON public.subjects(code);
CREATE INDEX idx_subjects_dept_year ON public.subjects(dept, year);
CREATE INDEX idx_subjects_class_lookup ON public.subjects(dept, year, semester);

-- ----------------------------------------------------------------------------
-- 6. MASTER TIMETABLES
-- ----------------------------------------------------------------------------
CREATE TABLE public.master_timetables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    faculty_id UUID NOT NULL REFERENCES public.profiles(id),
    day TEXT NOT NULL CHECK (day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
    day_of_week INTEGER,                      -- 1=Mon, 2=Tue ... 6=Sat
    slot_id TEXT NOT NULL, -- p1, p2, p3, p4, p5, p6, p7
    period INTEGER,                           -- 1-7 (numeric period)
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    target_dept TEXT NOT NULL,
    dept TEXT,                                -- Alias for class-centric queries
    target_year INTEGER NOT NULL,
    year INTEGER,                             -- Alias for class-centric queries
    target_section TEXT NOT NULL,
    section TEXT,                             -- Alias for class-centric queries
    batch INTEGER, -- NULL for full class, 1 or 2 for lab batches
    room TEXT,
    semester INTEGER,
    regulation TEXT,
    academic_year TEXT,                       -- 2025-2026
    effect_date DATE,                         -- With effect from
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_faculty_slot_day UNIQUE (faculty_id, day, slot_id)
);

-- Indexes
CREATE INDEX idx_timetables_faculty ON public.master_timetables(faculty_id);
CREATE INDEX idx_timetables_day_slot ON public.master_timetables(day, slot_id);
CREATE INDEX idx_timetables_target ON public.master_timetables(target_dept, target_year, target_section);
CREATE INDEX idx_timetables_class ON public.master_timetables(dept, year, section);
CREATE INDEX idx_timetables_faculty_schedule ON public.master_timetables(faculty_id, day_of_week, period);


-- ----------------------------------------------------------------------------
-- 7. HOLIDAYS
-- ----------------------------------------------------------------------------
CREATE TABLE public.holidays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_national BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_holidays_date ON public.holidays(date);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holidays_read" ON public.holidays FOR SELECT USING (true);

CREATE POLICY "holidays_manage" ON public.holidays FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('hod', 'management', 'principal','developer'))
);

-- Note: Indian public holidays are auto-fetched from date.nager.at API.
-- This table is for institution-specific custom holidays (e.g. college foundation day).

-- ----------------------------------------------------------------------------
-- 8. SUBSTITUTIONS
-- ----------------------------------------------------------------------------
CREATE TABLE public.substitutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    slot_id TEXT NOT NULL,
    original_faculty_id UUID NOT NULL REFERENCES public.profiles(id),
    substitute_faculty_id UUID REFERENCES public.profiles(id),
    subject_id UUID NOT NULL REFERENCES public.subjects(id),
    target_dept TEXT NOT NULL,
    target_year INTEGER NOT NULL,
    target_section TEXT NOT NULL,
    status request_status DEFAULT 'pending',
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id), -- Who created the request
    notes TEXT,
    CONSTRAINT unique_substitution_request UNIQUE (date, slot_id, original_faculty_id, substitute_faculty_id)
);

-- Indexes
CREATE INDEX idx_substitutions_date ON public.substitutions(date);
CREATE INDEX idx_substitutions_original_faculty ON public.substitutions(original_faculty_id);
CREATE INDEX idx_substitutions_substitute_faculty ON public.substitutions(substitute_faculty_id);
CREATE INDEX idx_substitutions_status ON public.substitutions(status);

-- ----------------------------------------------------------------------------
-- 9. CLASS SWAPS
-- ----------------------------------------------------------------------------
CREATE TABLE public.class_swaps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    faculty_a_id UUID NOT NULL REFERENCES public.profiles(id),
    faculty_b_id UUID NOT NULL REFERENCES public.profiles(id),
    slot_a_id TEXT NOT NULL, -- Faculty A's original slot
    slot_b_id TEXT NOT NULL, -- Faculty B's original slot
    status request_status DEFAULT 'pending',
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    notes TEXT,
    CONSTRAINT different_faculties CHECK (faculty_a_id != faculty_b_id)
);

-- Indexes
CREATE INDEX idx_swaps_date ON public.class_swaps(date);
CREATE INDEX idx_swaps_faculty_a ON public.class_swaps(faculty_a_id);
CREATE INDEX idx_swaps_faculty_b ON public.class_swaps(faculty_b_id);
CREATE INDEX idx_swaps_status ON public.class_swaps(status);

-- ----------------------------------------------------------------------------
-- 10. ATTENDANCE SESSIONS
-- ----------------------------------------------------------------------------
CREATE TABLE public.attendance_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    faculty_id UUID NOT NULL REFERENCES public.profiles(id),
    subject_id UUID NOT NULL REFERENCES public.subjects(id),
    date DATE NOT NULL,
    slot_id TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    target_dept TEXT NOT NULL,
    target_year INTEGER NOT NULL,
    target_section TEXT NOT NULL,
    batch INTEGER, -- NULL for full class
    total_students INTEGER NOT NULL,
    present_count INTEGER DEFAULT 0,
    absent_count INTEGER DEFAULT 0,
    od_count INTEGER DEFAULT 0,
    leave_count INTEGER DEFAULT 0,
    is_substitute BOOLEAN DEFAULT FALSE,
    substitute_faculty_id UUID REFERENCES public.profiles(id),
    is_modified BOOLEAN DEFAULT FALSE,
    modified_at TIMESTAMPTZ,
    modified_by UUID REFERENCES public.profiles(id),
    is_synced BOOLEAN DEFAULT FALSE,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_counts CHECK (
        present_count + absent_count + od_count + leave_count <= total_students
    )
);

-- Indexes
CREATE INDEX idx_sessions_faculty ON public.attendance_sessions(faculty_id);
CREATE INDEX idx_sessions_date ON public.attendance_sessions(date);
CREATE INDEX idx_sessions_subject ON public.attendance_sessions(subject_id);
CREATE INDEX idx_sessions_target ON public.attendance_sessions(target_dept, target_year, target_section);
CREATE INDEX idx_sessions_synced ON public.attendance_sessions(is_synced);

-- ----------------------------------------------------------------------------
-- 11. ATTENDANCE LOGS
-- ----------------------------------------------------------------------------
CREATE TABLE public.attendance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id),
    status attendance_status NOT NULL,
    detected_at TIMESTAMPTZ, -- When BLE detected (if applicable)
    marked_at TIMESTAMPTZ DEFAULT NOW(), -- When marked by faculty
    is_manual BOOLEAN DEFAULT FALSE,
    is_modified BOOLEAN DEFAULT FALSE,
    modified_at TIMESTAMPTZ,
    modified_by UUID REFERENCES public.profiles(id),
    notes TEXT,
    CONSTRAINT unique_session_student UNIQUE (session_id, student_id)
);

-- Indexes
CREATE INDEX idx_logs_session ON public.attendance_logs(session_id);
CREATE INDEX idx_logs_student ON public.attendance_logs(student_id);
CREATE INDEX idx_logs_status ON public.attendance_logs(status);
-- Index on timestamp (queries can filter by date using WHERE marked_at::date = ...)
-- Functional index removed to avoid immutability issues
CREATE INDEX idx_logs_marked_at ON public.attendance_logs(marked_at);

-- ----------------------------------------------------------------------------
-- 11b. LEAVES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leaves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    reason TEXT NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    leave_type TEXT NOT NULL, -- 'full_day' | 'half_day'
    status TEXT DEFAULT 'pending_hod' CHECK (status IN ('pending', 'pending_hod', 'pending_principal', 'approved', 'rejected', 'accepted', 'declined')),
    admin_comment TEXT,
    approved_by_hod UUID REFERENCES public.profiles(id),
    hod_approved_at TIMESTAMPTZ,
    approved_by_principal UUID REFERENCES public.profiles(id),
    principal_approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Ensure columns exist (in case table existed but was old)
DO $$
BEGIN
    -- Add status if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leaves' AND column_name='status') THEN
        ALTER TABLE public.leaves ADD COLUMN status request_status DEFAULT 'pending';
    END IF;

    -- Add admin_comment if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leaves' AND column_name='admin_comment') THEN
        ALTER TABLE public.leaves ADD COLUMN admin_comment TEXT;
    END IF;
END $$;

-- 3. Safely Create Indexes
CREATE INDEX IF NOT EXISTS idx_leaves_user ON public.leaves(user_id);
CREATE INDEX IF NOT EXISTS idx_leaves_status ON public.leaves(status);

-- 4. Create Notification Trigger Function (OR REPLACE handles updates)
CREATE OR REPLACE FUNCTION public.handle_leave_status_update()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.status != NEW.status) THEN
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            body,
            priority,
            data
        ) VALUES (
            NEW.user_id,
            'management_update',
            'Leave Request Update',
            'Your leave request has been ' || UPPER(NEW.status::text),
            'high',
            jsonb_build_object('leave_id', NEW.id, 'status', NEW.status, 'comment', NEW.admin_comment)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Attach Trigger (Drop first to ensure clean state)
DROP TRIGGER IF EXISTS on_leave_status_change ON public.leaves;

CREATE TRIGGER on_leave_status_change
    AFTER UPDATE ON public.leaves
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.handle_leave_status_update();

-- ----------------------------------------------------------------------------
-- 12. ATTENDANCE PERMISSIONS (OD & Leave)
-- ----------------------------------------------------------------------------
CREATE TABLE public.attendance_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.students(id),
    type TEXT NOT NULL CHECK (type IN ('od', 'leave')),
    category od_category, -- Only for OD
    reason TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL, -- Same as start_date for single day
    start_time TIME, -- For OD (time range)
    end_time TIME, -- For OD (time range)
    granted_by UUID NOT NULL REFERENCES public.profiles(id), -- Incharge or HOD
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_date_range CHECK (end_date >= start_date),
    CONSTRAINT valid_time_range CHECK (
        (type = 'od' AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time >= start_time) OR
        (type = 'leave' AND start_time IS NULL AND end_time IS NULL)
    )
);

-- Indexes
CREATE INDEX idx_permissions_student ON public.attendance_permissions(student_id);
-- Using immutable date range function
-- Note: If this fails, remove the third parameter '[]' and use: daterange(start_date, end_date)
CREATE INDEX idx_permissions_dates ON public.attendance_permissions USING gist (daterange(start_date, end_date));
CREATE INDEX idx_permissions_active ON public.attendance_permissions(is_active);
CREATE INDEX idx_permissions_type ON public.attendance_permissions(type);

-- ----------------------------------------------------------------------------
-- 13. OFFLINE QUEUE (For Mobile App Sync)
-- ----------------------------------------------------------------------------
CREATE TABLE public.offline_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    faculty_id UUID NOT NULL REFERENCES public.profiles(id),
    operation TEXT NOT NULL CHECK (operation IN ('create_session', 'update_session', 'create_log', 'update_log')),
    payload JSONB NOT NULL,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_queue_faculty ON public.offline_queue(faculty_id);
CREATE INDEX idx_queue_status ON public.offline_queue(status);
CREATE INDEX idx_queue_created ON public.offline_queue(created_at);

-- ----------------------------------------------------------------------------
-- 14. NOTIFICATIONS
-- ----------------------------------------------------------------------------
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    type notification_type NOT NULL,
    priority notification_priority DEFAULT 'normal',
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB, -- Additional data (substitute_id, swap_id, etc.)
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    fcm_sent BOOLEAN DEFAULT FALSE,
    fcm_sent_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(is_read);
CREATE INDEX idx_notifications_type ON public.notifications(type);
CREATE INDEX idx_notifications_created ON public.notifications(created_at);
CREATE INDEX idx_notifications_data_gin ON public.notifications USING gin(data);

-- ----------------------------------------------------------------------------
-- 15. APP CONFIG
-- ----------------------------------------------------------------------------
CREATE TABLE public.app_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES public.admins(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default config
INSERT INTO public.app_config (key, value, description) VALUES
    ('min_supported_version', '"1.0.0"', 'Minimum supported app version'),
    ('academic_year', '"2024-2025"', 'Current academic year'),
    ('semester', '"1"', 'Current semester (1 or 2)'),
    ('college_service_uuid', '"0000FEED-0000-1000-8000-00805F9B34FB"', 'BLE Service UUID for beacons');

-- ----------------------------------------------------------------------------
-- 16. CLASS INCHARGES
-- ----------------------------------------------------------------------------
CREATE TABLE public.class_incharges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    faculty_id UUID NOT NULL REFERENCES public.profiles(id),
    dept TEXT NOT NULL,
    year INTEGER NOT NULL,
    section TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- NOTE: unique_class_incharge removed to allow up to 2 incharges per class
    CONSTRAINT unique_faculty_assignment UNIQUE (faculty_id, dept, year, section)
);

-- Indexes
CREATE INDEX idx_class_incharges_faculty ON public.class_incharges(faculty_id);
CREATE INDEX idx_class_incharges_class ON public.class_incharges(dept, year, section);

-- ----------------------------------------------------------------------------
-- 17. ISSUES / SUPPORT
-- ----------------------------------------------------------------------------
CREATE TABLE public.issues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT CHECK (type IN ('bug', 'feature', 'support', 'other')) DEFAULT 'bug',
    status TEXT CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')) DEFAULT 'open',
    priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
    resolution_note TEXT,
    resolved_by UUID REFERENCES public.admins(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_issues_user ON public.issues(user_id);
CREATE INDEX idx_issues_status ON public.issues(status);
CREATE INDEX idx_issues_created ON public.issues(created_at);

ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- VIEWS (For Performance - Free Tier Compatible)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Student Attendance Aggregates
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.view_student_aggregates AS
SELECT
    s.id AS student_id,
    s.roll_no,
    s.full_name,
    s.dept,
    s.section,
    s.year,
    COALESCE(agg.present_sessions, 0) AS present_sessions,
    COALESCE(agg.absent_sessions, 0) AS absent_sessions,
    COALESCE(agg.od_sessions, 0) AS od_sessions,
    COALESCE(agg.total_sessions, 0) AS total_sessions,
    CASE
        WHEN COALESCE(agg.total_sessions, 0) = 0 THEN 0
        ELSE ROUND(
            (COALESCE(agg.present_sessions, 0)::NUMERIC / agg.total_sessions) * 100, 2
        )
    END AS attendance_percentage
FROM students s
LEFT JOIN (
    SELECT
        al.student_id,
        COUNT(*) AS total_sessions,
        COUNT(*) FILTER (WHERE al.status = 'present') AS present_sessions,
        COUNT(*) FILTER (WHERE al.status = 'absent') AS absent_sessions,
        COUNT(*) FILTER (WHERE al.status = 'od') AS od_sessions
    FROM attendance_logs al
    GROUP BY al.student_id
) agg ON s.id = agg.student_id
WHERE s.is_active = TRUE;

GRANT SELECT ON view_student_aggregates TO authenticated;

-- ----------------------------------------------------------------------------
-- Department Attendance Summary (Daily)
-- ----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW public.view_dept_attendance_summary AS
SELECT 
    ass.date,
    ass.target_dept,
    ass.target_year,
    ass.target_section,
    COUNT(DISTINCT ass.id) AS total_sessions,
    COUNT(DISTINCT als.student_id) FILTER (WHERE als.status IN ('present', 'od')) AS present_students,
    COUNT(DISTINCT als.student_id) FILTER (WHERE als.status = 'absent') AS absent_students,
    COUNT(DISTINCT als.student_id) AS total_students,
    ROUND(
        (COUNT(DISTINCT als.student_id) FILTER (WHERE als.status IN ('present', 'od'))::NUMERIC / 
         NULLIF(COUNT(DISTINCT als.student_id), 0)::NUMERIC) * 100, 
        2
    ) AS attendance_percentage
FROM public.attendance_sessions ass
LEFT JOIN public.attendance_logs als ON ass.id = als.session_id
WHERE ass.date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY ass.date, ass.target_dept, ass.target_year, ass.target_section;

-- Indexes
CREATE UNIQUE INDEX idx_mv_dept_summary_unique ON public.view_dept_attendance_summary(date, target_dept, target_year, target_section);
CREATE INDEX idx_mv_dept_summary_date ON public.view_dept_attendance_summary(date);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Function: Update updated_at timestamp
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Function: Check permission overlap
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_permission_overlap()
RETURNS TRIGGER AS $$
DECLARE
    overlap_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO overlap_count
    FROM public.attendance_permissions
    WHERE student_id = NEW.student_id
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
        AND is_active = TRUE
        AND type = NEW.type
        AND (
            (NEW.type = 'leave' AND daterange(start_date, end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')) OR
            (NEW.type = 'od' AND 
             daterange(start_date, end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]') AND
             tsrange(
                 (start_date + start_time)::timestamp,
                 (end_date + end_time)::timestamp,
                 '[]'
             ) && tsrange(
                 (NEW.start_date + NEW.start_time)::timestamp,
                 (NEW.end_date + NEW.end_time)::timestamp,
                 '[]'
             ))
        );
    
    IF overlap_count > 0 THEN
        RAISE EXCEPTION 'Conflict: Student already has % on overlapping date/time range', NEW.type;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Function: Auto-apply permissions to attendance logs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_apply_permissions()
RETURNS TRIGGER AS $$
DECLARE
    perm_record RECORD;
BEGIN
    -- Check if student has active OD or Leave for this session
    SELECT * INTO perm_record
    FROM public.attendance_permissions
    WHERE student_id = NEW.student_id
        AND is_active = TRUE
        AND (
            (type = 'leave' AND NEW.marked_at::date BETWEEN start_date AND end_date) OR
            (type = 'od' AND 
             NEW.marked_at::date BETWEEN start_date AND end_date AND
             NEW.marked_at::time BETWEEN start_time AND end_time)
        )
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF perm_record IS NOT NULL THEN
        IF perm_record.type = 'od' THEN
            NEW.status = 'od';
        ELSIF perm_record.type = 'leave' THEN
            NEW.status = 'leave';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Function: Refresh materialized views (Call this via cron or Edge Function)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_attendance_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.view_student_aggregates;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.view_dept_attendance_summary;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Function: Process offline queue
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_offline_queue_item(queue_item_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    queue_item RECORD;
    result BOOLEAN := FALSE;
BEGIN
    -- Get queue item
    SELECT * INTO queue_item
    FROM public.offline_queue
    WHERE id = queue_item_id AND status = 'pending';
    
    IF queue_item IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Update status to processing
    UPDATE public.offline_queue
    SET status = 'processing', processed_at = NOW()
    WHERE id = queue_item_id;
    
    -- Process based on operation type
    BEGIN
        CASE queue_item.operation
            WHEN 'create_session' THEN
                INSERT INTO public.attendance_sessions (
                    faculty_id, subject_id, date, slot_id, start_time,
                    target_dept, target_year, target_section, batch, total_students
                )
                SELECT 
                    (payload->>'faculty_id')::UUID,
                    (payload->>'subject_id')::UUID,
                    (payload->>'date')::DATE,
                    payload->>'slot_id',
                    (payload->>'start_time')::TIMESTAMPTZ,
                    payload->>'target_dept',
                    (payload->>'target_year')::INTEGER,
                    payload->>'target_section',
                    (payload->>'batch')::INTEGER,
                    (payload->>'total_students')::INTEGER
                FROM public.offline_queue
                WHERE id = queue_item_id;
                result := TRUE;
                
            WHEN 'create_log' THEN
                INSERT INTO public.attendance_logs (
                    session_id, student_id, status, detected_at, is_manual
                )
                SELECT 
                    (payload->>'session_id')::UUID,
                    (payload->>'student_id')::UUID,
                    (payload->>'status')::attendance_status,
                    (payload->>'detected_at')::TIMESTAMPTZ,
                    (payload->>'is_manual')::BOOLEAN
                FROM public.offline_queue
                WHERE id = queue_item_id;
                result := TRUE;
                
            ELSE
                RAISE EXCEPTION 'Unknown operation type: %', queue_item.operation;
        END CASE;
        
        -- Mark as completed
        UPDATE public.offline_queue
        SET status = 'completed'
        WHERE id = queue_item_id;
        
    EXCEPTION WHEN OTHERS THEN
        -- Mark as failed
        UPDATE public.offline_queue
        SET status = 'failed',
            error_message = SQLERRM,
            retry_count = retry_count + 1
        WHERE id = queue_item_id;
        
        result := FALSE;
    END;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Function: Get student roster for class
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_class_roster(
    p_dept TEXT,
    p_year INTEGER,
    p_section TEXT,
    p_batch INTEGER DEFAULT NULL
)
RETURNS TABLE (
    student_id UUID,
    roll_no TEXT,
    full_name TEXT,
    bluetooth_uuid TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.roll_no,
        s.full_name,
        s.bluetooth_uuid
    FROM public.students s
    WHERE s.dept = p_dept
        AND s.year = p_year
        AND s.section = p_section
        AND s.is_active = TRUE
        AND (p_batch IS NULL OR s.batch = p_batch)
    ORDER BY s.roll_no;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update updated_at on profiles
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Update updated_at on students
CREATE TRIGGER update_students_updated_at
    BEFORE UPDATE ON public.students
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Update updated_at on master_timetables
CREATE TRIGGER update_timetables_updated_at
    BEFORE UPDATE ON public.master_timetables
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Check permission overlap before insert/update
CREATE TRIGGER check_permission_overlap_trigger
    BEFORE INSERT OR UPDATE ON public.attendance_permissions
    FOR EACH ROW
    EXECUTE FUNCTION public.check_permission_overlap();

-- Auto-apply permissions to attendance logs
CREATE TRIGGER auto_apply_permissions_trigger
    BEFORE INSERT ON public.attendance_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_apply_permissions();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_timetables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_swaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offline_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_incharges ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SECURITY DEFINER FUNCTIONS (Bypass RLS to avoid infinite recursion)
-- ============================================================================

-- Function to securely bypass RLS and create a profile on behalf of a new user
-- Function to securely bypass RLS and create BOTH an auth.user and a profile instantly
CREATE OR REPLACE FUNCTION public.admin_create_profile(
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT,
    p_role user_role,
    p_dept TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_user_id UUID;
    encrypted_pw TEXT;
BEGIN
    -- Only allow elevated roles or HODs to execute this
    IF NOT public.is_elevated_role() AND NOT public.is_hod() THEN
        RAISE EXCEPTION 'Unauthorized: only admins and HODs can provision profiles';
    END IF;

    -- If HOD, carefully ensure they aren't generating foreign department accounts
    IF public.is_hod() AND p_dept != public.auth_user_dept() THEN
        RAISE EXCEPTION 'Unauthorized: HODs can only provision faculty for their own department';
    END IF;

    -- Generate password hash
    encrypted_pw := crypt(p_password, gen_salt('bf'));

    -- Check if user already exists in auth.users (Orphan account from previous failed attempts)
    SELECT id INTO new_user_id FROM auth.users WHERE email = p_email;

    IF new_user_id IS NULL THEN
        -- Generate ID
        new_user_id := gen_random_uuid();

        -- 1. Insert directly into auth.users to bypass email-confirmation delays
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
        )
        VALUES (
            '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated', p_email, encrypted_pw, NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_full_name), NOW(), NOW(), '', '', '', ''
        );
        
        -- 2. Insert into auth.identities
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id
        )
        VALUES (
            gen_random_uuid(), new_user_id, format('{"sub":"%s","email":"%s"}', new_user_id::text, p_email)::jsonb, 'email', NOW(), NOW(), NOW(), new_user_id::text
        );
    ELSE
        -- Update existing orphan user so the newly generated temporary password works
        UPDATE auth.users 
        SET encrypted_password = encrypted_pw,
            raw_user_meta_data = jsonb_build_object('full_name', p_full_name),
            email_confirmed_at = COALESCE(email_confirmed_at, NOW())
        WHERE id = new_user_id;
    END IF;

    -- 3. Upsert into public.profiles
    -- This guarantees that if the auth row was dangling, we finally create their profile
    INSERT INTO public.profiles (id, email, full_name, role, dept)
    VALUES (new_user_id, p_email, p_full_name, p_role, p_dept)
    ON CONFLICT (id) DO UPDATE 
    SET full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        dept = EXCLUDED.dept;

    RETURN jsonb_build_object('id', new_user_id, 'email', p_email);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_create_profile(TEXT, TEXT, TEXT, user_role, TEXT) TO authenticated;

-- Function to securely reset a faculty member's password
CREATE OR REPLACE FUNCTION public.admin_update_faculty_password(
    p_user_id UUID,
    p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_role TEXT;
    target_dept TEXT;
    encrypted_pw TEXT;
BEGIN
    -- Only allow elevated roles or HODs to execute this
    IF NOT public.is_elevated_role() AND NOT public.is_hod() THEN
        RAISE EXCEPTION 'Unauthorized: only admins and HODs can reset passwords';
    END IF;

    -- Fetch target user's role and dept from profiles
    SELECT role::text, dept INTO target_role, target_dept
    FROM public.profiles
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target user profile not found';
    END IF;

    -- If HOD, carefully ensure they aren't modifying foreign department accounts
    IF public.is_hod() THEN
        IF target_dept != public.auth_user_dept() THEN
            RAISE EXCEPTION 'Unauthorized: HODs can only modify faculty in their own department';
        END IF;
        IF target_role IN ('hod', 'principal', 'admin', 'management', 'developer') THEN
            RAISE EXCEPTION 'Unauthorized: HODs cannot reset passwords for elevated roles';
        END IF;
    END IF;

    -- Generate password hash
    encrypted_pw := crypt(p_new_password, gen_salt('bf'));

    -- Update the password in auth.users
    UPDATE auth.users 
    SET encrypted_password = encrypted_pw,
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_update_faculty_password(UUID, TEXT) TO authenticated;



-- Function to get user's role (bypasses RLS)
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (SELECT role FROM public.admins WHERE id = auth.uid()),
    (SELECT role::TEXT FROM public.profiles WHERE id = auth.uid())
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Function to get user's department (bypasses RLS)
CREATE OR REPLACE FUNCTION public.auth_user_dept()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (SELECT dept FROM public.admins WHERE id = auth.uid()),
    (SELECT dept FROM public.profiles WHERE id = auth.uid())
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Function to get current user's email (bypasses auth.users access issues)
CREATE OR REPLACE FUNCTION public.get_my_email()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT email FROM auth.users WHERE id = auth.uid()
$$;

-- Is the current user an elevated role? (full access)
CREATE OR REPLACE FUNCTION public.is_elevated_role()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND role::TEXT IN ('principal', 'management', 'developer')
  )
  OR EXISTS (
    SELECT 1 FROM public.admins WHERE id = auth.uid()
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Is the current user an HOD?
CREATE OR REPLACE FUNCTION public.is_hod()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role::TEXT = 'hod'
  )
  OR EXISTS (
    SELECT 1 FROM public.admins WHERE id = auth.uid() AND role = 'hod'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Is the current user HOD of a specific dept?
CREATE OR REPLACE FUNCTION public.is_hod_of(target_dept TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role::TEXT = 'hod' AND dept = target_dept
  )
  OR EXISTS (
    SELECT 1 FROM public.admins
    WHERE id = auth.uid() AND role = 'hod' AND dept = target_dept
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Securely get admin role by email (Case Insensitive)
CREATE OR REPLACE FUNCTION public.get_user_admin_role(check_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    found_role TEXT;
BEGIN
    SELECT role INTO found_role
    FROM public.admins
    WHERE email ILIKE check_email;
    RETURN found_role;
END;
$$;

-- Legacy helper (used by supabase_migration_v2 RBAC policies)
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('principal', 'management', 'developer')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Grant execute to all authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_dept() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_elevated_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_hod() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_hod_of(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_admin_role(TEXT) TO authenticated;

-- ============================================================================
-- ADMINS RLS Policy
-- ============================================================================
CREATE POLICY "admins_read_own" ON public.admins
    FOR SELECT TO authenticated
    USING (email = auth.jwt() ->> 'email');

-- ============================================================================
-- PROFILES Policies
-- ============================================================================
-- Anyone authenticated can read profiles (needed for faculty lookups)
CREATE POLICY "profiles_read_all" ON public.profiles 
    FOR SELECT TO authenticated 
    USING (true);

-- Users can update own profile; elevated can update any; HOD can update own dept
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR public.is_elevated_role()
    OR (public.is_hod() AND dept = public.auth_user_dept())
  );

-- Elevated can INSERT/DELETE profiles
CREATE POLICY "profiles_insert_elevated" ON public.profiles
  FOR INSERT WITH CHECK (public.is_elevated_role());
CREATE POLICY "profiles_delete_elevated" ON public.profiles
  FOR DELETE USING (public.is_elevated_role());

-- Users can insert their own profile (used during initial welcome setup)
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- ============================================================================
-- DEPARTMENTS Policies
-- ============================================================================
-- All authenticated can read
CREATE POLICY "departments_all" ON public.departments 
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- SUBJECTS Policies
-- ============================================================================
-- All authenticated can read
CREATE POLICY "subjects_all" ON public.subjects
    FOR SELECT USING (auth.uid() IS NOT NULL);
-- Elevated can manage all subjects
CREATE POLICY "subjects_elevated_manage" ON public.subjects
  FOR ALL USING (public.is_elevated_role());
-- HOD can manage own dept subjects
CREATE POLICY "subjects_hod_manage" ON public.subjects
  FOR ALL USING (public.is_hod() AND dept = public.auth_user_dept());

-- Indexes
CREATE INDEX idx_subjects_code ON public.subjects(code);
CREATE INDEX idx_subjects_dept ON public.subjects(dept);
CREATE INDEX idx_subjects_semester ON public.subjects(semester);


-- ============================================================================
-- ACADEMIC_CALENDAR Policies
-- ============================================================================
-- All authenticated can read
CREATE POLICY "calendar_all_read" ON public.academic_calendar 
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- HOD, Principal, Management, Admin, Developer can manage
CREATE POLICY "calendar_manage" ON public.academic_calendar 
    FOR ALL USING (public.auth_user_role() IN ('hod', 'principal', 'management', 'admin', 'developer'));

-- ============================================================================
-- MASTER_TIMETABLES Policies (class-centric, role-based)
-- ============================================================================
-- SELECT: everyone authenticated can read all (needed for swap, schedule views)
CREATE POLICY "timetables_select_all" ON public.master_timetables
  FOR SELECT TO authenticated USING (true);

-- Elevated = full CRUD on all
CREATE POLICY "timetables_elevated_manage" ON public.master_timetables
  FOR ALL USING (public.is_elevated_role());

-- HOD = full CRUD on own dept
CREATE POLICY "timetables_hod_manage" ON public.master_timetables
  FOR ALL USING (public.is_hod() AND dept = public.auth_user_dept());

-- Faculty = own rows only
CREATE POLICY "timetables_faculty_own_insert" ON public.master_timetables
  FOR INSERT WITH CHECK (faculty_id = auth.uid());
CREATE POLICY "timetables_faculty_own_update" ON public.master_timetables
  FOR UPDATE USING (faculty_id = auth.uid());
CREATE POLICY "timetables_faculty_own_delete" ON public.master_timetables
  FOR DELETE USING (faculty_id = auth.uid());

-- ============================================================================
-- STUDENTS Policies
-- ============================================================================
-- Faculty can read students in their assigned classes
CREATE POLICY "students_faculty" ON public.students
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.master_timetables mt
            WHERE mt.faculty_id = auth.uid()
                AND mt.target_dept = students.dept
                AND mt.target_year = students.year
                AND mt.target_section = students.section
        )
    );

-- Substitute faculty can read students
CREATE POLICY "students_substitute" ON public.students
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.substitutions s
            WHERE s.substitute_faculty_id = auth.uid()
                AND s.date = CURRENT_DATE
                AND s.status = 'accepted'
                AND s.target_dept = students.dept
                AND s.target_year = students.year
                AND s.target_section = students.section
        )
    );

-- Class incharge can see their class
CREATE POLICY "students_class_incharge" ON public.students
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
                AND p.role = 'class_incharge'
                AND p.dept = students.dept
        )
    );

-- HOD = full CRUD on own dept
CREATE POLICY "students_hod_manage" ON public.students
  FOR ALL USING (public.is_hod() AND dept = public.auth_user_dept());

-- Elevated = full CRUD on all
CREATE POLICY "students_admin" ON public.students
    FOR ALL USING (public.is_elevated_role());

-- Principal = full CRUD on all
CREATE POLICY "students_principal_manage" ON public.students
  FOR ALL USING (public.auth_user_role() = 'principal');

-- ============================================================================
-- ATTENDANCE SESSIONS Policies
-- ============================================================================
-- Faculty can read their own sessions
CREATE POLICY "sessions_faculty_read" ON public.attendance_sessions 
    FOR SELECT USING (
        faculty_id = auth.uid()
        OR substitute_faculty_id = auth.uid()
    );

-- Faculty can create their own sessions
CREATE POLICY "sessions_faculty_create" ON public.attendance_sessions 
    FOR INSERT WITH CHECK (faculty_id = auth.uid());

-- Faculty can create sessions for substituted classes
CREATE POLICY "sessions_substitute_create" ON public.attendance_sessions 
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.substitutions s
            WHERE s.substitute_faculty_id = auth.uid()
                AND s.date = CURRENT_DATE
                AND s.status = 'accepted'
                AND s.target_dept = target_dept
                AND s.target_year = target_year
                AND s.target_section = target_section
        )
    );

-- Faculty can read sessions where they substituted
CREATE POLICY "sessions_substitute_read" ON public.attendance_sessions 
    FOR SELECT USING (substitute_faculty_id = auth.uid());

-- Faculty can update their own sessions (within 24 hours)
CREATE POLICY "sessions_faculty_update" ON public.attendance_sessions 
    FOR UPDATE USING (
        faculty_id = auth.uid()
        AND created_at > NOW() - INTERVAL '24 hours'
    );

-- HOD = full CRUD on dept sessions
CREATE POLICY "sessions_hod_manage" ON public.attendance_sessions
  FOR ALL USING (
    public.is_hod()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = attendance_sessions.faculty_id
        AND p.dept = public.auth_user_dept()
    )
  );

-- Superadmin can manage all
CREATE POLICY "sessions_admin" ON public.attendance_sessions
    FOR ALL USING (public.auth_user_role() IN ('management', 'developer'));

-- Principal = full CRUD
CREATE POLICY "sessions_principal_manage" ON public.attendance_sessions
  FOR ALL USING (public.auth_user_role() = 'principal');

-- Admins can read all sessions
CREATE POLICY "sessions_admin_read" ON public.attendance_sessions 
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE email = public.get_my_email()
        )
    );

-- ============================================================================
-- ATTENDANCE LOGS Policies
-- ============================================================================
-- Faculty can read logs for their sessions
CREATE POLICY "logs_faculty_read" ON public.attendance_logs 
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.attendance_sessions
            WHERE id = attendance_logs.session_id
                AND (faculty_id = auth.uid() OR substitute_faculty_id = auth.uid())
        )
    );

-- Faculty can manage own session logs
CREATE POLICY "logs_faculty_manage" ON public.attendance_logs 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.attendance_sessions
            WHERE id = attendance_logs.session_id
                AND faculty_id = auth.uid()
        )
    );

-- HOD = full CRUD on dept logs
CREATE POLICY "logs_hod_manage" ON public.attendance_logs
  FOR ALL USING (
    public.is_hod()
    AND EXISTS (
      SELECT 1 FROM public.attendance_sessions s
      JOIN public.profiles p ON p.id = s.faculty_id
      WHERE s.id = attendance_logs.session_id
        AND p.dept = public.auth_user_dept()
    )
  );

-- Superadmin can manage all
CREATE POLICY "logs_admin" ON public.attendance_logs
    FOR ALL USING (public.auth_user_role() IN ('management', 'developer'));

-- Principal = full CRUD
CREATE POLICY "logs_principal_manage" ON public.attendance_logs
  FOR ALL USING (public.auth_user_role() = 'principal');

-- Admins can read all logs
CREATE POLICY "logs_admin_read" ON public.attendance_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE email = public.get_my_email()
        )
    );

-- ============================================================================
-- ATTENDANCE PERMISSIONS Policies
-- ============================================================================
-- Class incharge can manage permissions for their class
CREATE POLICY "permissions_incharge" ON public.attendance_permissions 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.students s ON s.dept = p.dept
            WHERE p.id = auth.uid()
                AND p.role = 'class_incharge'
                AND s.id = attendance_permissions.student_id
        )
    );

-- HOD can manage permissions for their dept
CREATE POLICY "permissions_hod" ON public.attendance_permissions 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = attendance_permissions.student_id
                AND public.auth_user_role() = 'hod'
                AND s.dept = public.auth_user_dept()
        )
    );

-- ============================================================================
-- NOTIFICATIONS Policies
-- ============================================================================
-- Users can read their own notifications
CREATE POLICY "notifications_own_read" ON public.notifications 
    FOR SELECT USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY "notifications_own_update" ON public.notifications 
    FOR UPDATE USING (user_id = auth.uid());

-- Users can insert notifications (for sending to others)
CREATE POLICY "notifications_insert" ON public.notifications 
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- ISSUES Policies
-- ============================================================================
-- Users can see their own issues
CREATE POLICY "issues_own_read" ON public.issues
    FOR SELECT USING (user_id = auth.uid());

-- Users can create issues
CREATE POLICY "issues_insert" ON public.issues
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Admins/Developers can manage all issues
CREATE POLICY "issues_admin_manage" ON public.issues
    FOR ALL USING (public.is_elevated_role());

-- ============================================================================
-- SUBSTITUTIONS Policies
-- ============================================================================
-- Faculty can read substitutions where they are original or substitute
CREATE POLICY "substitutions_faculty_read" ON public.substitutions 
    FOR SELECT USING (
        original_faculty_id = auth.uid() 
        OR substitute_faculty_id = auth.uid()
    );

-- Faculty can create substitution requests
CREATE POLICY "substitutions_faculty_create" ON public.substitutions 
    FOR INSERT WITH CHECK (
        original_faculty_id = auth.uid() 
        OR created_by = auth.uid()
    );

-- Faculty can update substitutions they're involved in
CREATE POLICY "substitutions_faculty_update" ON public.substitutions 
    FOR UPDATE USING (
        original_faculty_id = auth.uid() 
        OR substitute_faculty_id = auth.uid()
    );

-- HOD can read/manage substitutions in their dept
CREATE POLICY "substitutions_hod" ON public.substitutions 
    FOR ALL USING (
        public.auth_user_role() = 'hod' 
        AND target_dept = public.auth_user_dept()
    );

-- Superadmin can manage all substitutions
CREATE POLICY "substitutions_admin" ON public.substitutions
    FOR ALL USING (public.auth_user_role() IN ('management', 'developer'));

-- Principal = full CRUD
CREATE POLICY "substitutions_principal_manage" ON public.substitutions
  FOR ALL USING (public.auth_user_role() = 'principal');

-- ============================================================================
-- CLASS SWAPS Policies
-- ============================================================================
-- Faculty can read swaps they're involved in
CREATE POLICY "swaps_faculty_read" ON public.class_swaps 
    FOR SELECT USING (
        faculty_a_id = auth.uid() 
        OR faculty_b_id = auth.uid()
    );

-- Faculty can create swap requests
CREATE POLICY "swaps_faculty_create" ON public.class_swaps 
    FOR INSERT WITH CHECK (faculty_a_id = auth.uid());

-- Faculty can update swaps they're involved in (accept/reject)
CREATE POLICY "swaps_faculty_update" ON public.class_swaps 
    FOR UPDATE USING (
        faculty_a_id = auth.uid() 
        OR faculty_b_id = auth.uid()
    );

-- HOD can manage swaps in their dept
CREATE POLICY "swaps_hod" ON public.class_swaps 
    FOR ALL USING (
        public.auth_user_role() = 'hod'
        AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE (p.id = faculty_a_id OR p.id = faculty_b_id)
                AND p.dept = public.auth_user_dept()
        )
    );

-- Superadmin can manage all swaps
CREATE POLICY "swaps_admin" ON public.class_swaps
    FOR ALL USING (public.auth_user_role() IN ('management', 'developer'));

-- Principal = full CRUD
CREATE POLICY "swaps_principal_manage" ON public.class_swaps
  FOR ALL USING (public.auth_user_role() = 'principal');

-- ============================================================================
-- OFFLINE QUEUE Policies
-- ============================================================================
-- Faculty can only access their own queue items
CREATE POLICY "queue_faculty_own" ON public.offline_queue 
    FOR ALL USING (faculty_id = auth.uid());

-- ============================================================================
-- APP CONFIG Policies
-- ============================================================================
-- Everyone can read config (public)
CREATE POLICY "config_read_all" ON public.app_config
    FOR SELECT USING (TRUE);

-- Elevated roles can manage config
CREATE POLICY "config_elevated_manage" ON public.app_config
  FOR ALL USING (public.is_elevated_role());

-- ============================================================================
-- ADDITIONAL ELEVATED POLICIES
-- ============================================================================
-- Attendance Permissions: elevated can manage all
CREATE POLICY "permissions_elevated_manage" ON public.attendance_permissions
  FOR ALL USING (public.is_elevated_role());

-- Notifications: elevated can manage all
CREATE POLICY "notifications_elevated_manage" ON public.notifications
  FOR ALL USING (public.is_elevated_role());

-- Class Incharges: all can read, elevated + HOD can manage
CREATE POLICY "incharges_select_all" ON public.class_incharges
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "incharges_elevated_manage" ON public.class_incharges
  FOR ALL USING (public.is_elevated_role());
CREATE POLICY "incharges_hod_manage" ON public.class_incharges
  FOR ALL USING (public.is_hod() AND dept = public.auth_user_dept());

-- ============================================================================
-- FOREIGN KEY CASCADES (safe re-runs)
-- ============================================================================
-- Ensure subject deletion cascades
ALTER TABLE substitutions DROP CONSTRAINT IF EXISTS substitutions_subject_id_fkey;
ALTER TABLE substitutions ADD CONSTRAINT substitutions_subject_id_fkey
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;

ALTER TABLE attendance_sessions DROP CONSTRAINT IF EXISTS attendance_sessions_subject_id_fkey;
ALTER TABLE attendance_sessions ADD CONSTRAINT attendance_sessions_subject_id_fkey
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;

-- ============================================================================
-- COMPLAINTS & SUGGESTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS complaints_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    student_roll_no TEXT,
    dept TEXT,
    year INTEGER,
    section TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
    status TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed','rejected')),
    response TEXT,
    responded_by UUID REFERENCES profiles(id),
    responded_at TIMESTAMPTZ,
    is_anonymous BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE complaints_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "complaints_read_all" ON complaints_suggestions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "complaints_elevated_manage" ON complaints_suggestions
  FOR ALL USING (public.is_elevated_role());
CREATE POLICY "complaints_hod_manage" ON complaints_suggestions
  FOR ALL USING (public.is_hod() AND dept = public.auth_user_dept());
-- ============================================================================
-- INDEXES FOR PERFORMANCE (Free Tier Safe)
-- ============================================================================

-- Additional composite indexes for common queries
CREATE INDEX idx_logs_session_status ON public.attendance_logs(session_id, status);
CREATE INDEX idx_sessions_faculty_date ON public.attendance_sessions(faculty_id, date DESC);
CREATE INDEX idx_students_dept_year_section_active ON public.students(dept, year, section, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_timetables_faculty_day_active ON public.master_timetables(faculty_id, day, is_active) WHERE is_active = TRUE;

-- GIN index for JSONB searches (if needed)
CREATE INDEX idx_queue_payload_gin ON public.offline_queue USING gin(payload);
CREATE INDEX idx_notifications_data_gin ON public.notifications USING gin(data);

-- ============================================================================
-- INITIAL DATA / SEED DATA (Optional)
-- ============================================================================

-- Insert default departments (adjust as needed)
INSERT INTO public.departments (code, name) VALUES
    ('CSE', 'Computer Science and Engineering'),
    ('ECE', 'Electronics and Communication Engineering'),
    ('H&S', 'Humanities and Sciences'),
    ('CSM', 'Computer Science and Mathematics'),
    ('DS', 'Data Science')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 17. SPECIAL HOLIDAYS (from migration)
-- ============================================================================
create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  type text check (type in ('holiday', 'event', 'exam')) default 'holiday',
  description text,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.holidays enable row level security;

-- Read for everyone
create policy "Enable read access for all users" on public.holidays
  for select using (true);

-- Elevated roles can manage holidays
create policy "holidays_elevated_manage" on public.holidays
  for all using (public.is_elevated_role());

-- HOD can manage holidays
create policy "holidays_hod_manage" on public.holidays
  for all using (public.is_hod());

-- Seed Data
insert into public.holidays (title, date, type, description) values
  ('Republic Day', '2026-01-26', 'holiday', 'National Holiday'),
  ('Annual Tech Fest', '2026-03-15', 'event', 'College wide technical symposium'),
  ('Mid Semester Exams', '2026-02-10', 'exam', 'Phase 1 internal assessments')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 18. ISSUES/REPORTS TABLE
-- ============================================================================
create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  description text not null,
  has_screenshot boolean default false,
  status text check (status in ('open', 'investigating', 'resolved')) default 'open',
  created_at timestamptz default now()
);

alter table public.issues enable row level security;

create policy "Users can insert their own issues" on public.issues
  for insert with check (auth.uid() = user_id);

create policy "Users can view their own issues" on public.issues
  for select using (auth.uid() = user_id);

create policy "issues_elevated_manage" on public.issues
  for all using (public.is_elevated_role());

-- ============================================================================
-- LEAVES POLICIES (two-stage approval: HOD → Principal)
-- ============================================================================
-- NOTE: The leaves table is defined in section 11b above.

-- Users can create and see their own leaves
create policy "Users can insert their own leaves" on public.leaves
  for insert with check (auth.uid() = user_id);

create policy "Users can view their own leaves" on public.leaves
  for select using (auth.uid() = user_id);

-- HOD can view, update, and insert leaves for their department
create policy "HOD can view department leaves" on public.leaves
  for select using (
      public.auth_user_role() = 'hod' AND
      exists (select 1 from public.profiles where id = leaves.user_id and dept = public.auth_user_dept())
  );

create policy "HOD can update department leaves" on public.leaves
  for update using (
      public.auth_user_role() = 'hod' AND
      exists (select 1 from public.profiles where id = leaves.user_id and dept = public.auth_user_dept())
  );

create policy "HOD can insert department leaves" on public.leaves
  for insert with check (
      public.auth_user_role() = 'hod' AND
      exists (select 1 from public.profiles where id = user_id and dept = public.auth_user_dept())
  );

-- Principal can view, update, and insert all leaves
create policy "Principal can view all leaves" on public.leaves
  for select using (public.auth_user_role() = 'principal');

create policy "Principal can update all leaves" on public.leaves
  for update using (public.auth_user_role() = 'principal');

create policy "Principal can insert all leaves" on public.leaves
  for insert with check (public.auth_user_role() = 'principal');

-- Developer/Management can view, update, and insert all leaves
create policy "Admins can view all leaves" on public.leaves
  for select using (public.auth_user_role() in ('developer', 'management'));

create policy "Admins can update all leaves" on public.leaves
  for update using (public.auth_user_role() in ('developer', 'management'));

create policy "Admins can insert all leaves" on public.leaves
  for insert with check (public.auth_user_role() in ('developer', 'management'));

/*
FREE TIER LIMITATIONS & WORKAROUNDS:

1. DATABASE SIZE: 500 MB
   - Use materialized views instead of storing aggregates
   - Archive old attendance logs (move to separate table after 90 days)
   - Compress JSONB data where possible

2. BANDWIDTH: 5 GB/month
   - Optimize queries to return only needed data
   - Use pagination for large lists
   - Cache frequently accessed data on client

3. REALTIME: 200 concurrent connections
   - Use connection pooling
   - Disconnect idle connections
   - Limit Realtime subscriptions per user

4. EDGE FUNCTIONS: 2 million invocations/month
   - Batch operations where possible
   - Use database functions for simple operations
   - Cache results when appropriate

5. STORAGE: 1 GB
   - Only store essential files
   - Use external storage (S3, Cloudinary) for large files if needed

6. AUTH: Unlimited (free tier friendly)
   - No concerns here

RECOMMENDATIONS:
- Monitor usage via Supabase dashboard
- Set up alerts for approaching limits
- Consider upgrading if usage exceeds free tier
- Use efficient queries and indexes
- Archive old data regularly
*/

-- ============================================================================
-- HIDDEN ITEMS TABLE (For Soft Delete)
-- ============================================================================

-- Create hidden_items table to store "deleted" requests by specific users
CREATE TABLE IF NOT EXISTS public.hidden_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    item_id UUID NOT NULL, -- Target ID (Requests/Swaps)
    item_type TEXT NOT NULL, -- 'substitution' or 'swap'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_hide UNIQUE (user_id, item_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hidden_items_user ON public.hidden_items(user_id);
CREATE INDEX IF NOT EXISTS idx_hidden_items_item ON public.hidden_items(item_id);

-- RLS
ALTER TABLE public.hidden_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own hidden items" ON public.hidden_items
    FOR ALL USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON public.hidden_items TO authenticated;
GRANT ALL ON public.hidden_items TO service_role;

-- ============================================================================
-- AUTOMATED NOTIFICATION TRIGGERS
-- ============================================================================

-- Function to handle New Substitution Requests
CREATE OR REPLACE FUNCTION public.handle_new_substitution()
RETURNS TRIGGER AS $$
DECLARE
  sender_name TEXT;
  slot_display TEXT;
BEGIN
  -- Get sender name
  SELECT full_name INTO sender_name FROM public.profiles WHERE id = NEW.original_faculty_id;
  
  -- Format Slot ID (e.g. "p1" -> "Period 1")
  slot_display := UPPER(NEW.slot_id);

  -- Insert Notification for the Substitute Faculty
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    priority,
    data
  ) VALUES (
    NEW.substitute_faculty_id,
    'substitute_request',
    'Substitute Request',
    COALESCE(sender_name, 'A Faculty') || ' requests you to cover ' || slot_display || ' (' || NEW.target_dept || '-' || NEW.target_year || '-' || NEW.target_section || ')',
    'high',
    jsonb_build_object('requestId', NEW.id, 'type', 'request')
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for Substitutions
DROP TRIGGER IF EXISTS on_substitution_created ON public.substitutions;
CREATE TRIGGER on_substitution_created
  AFTER INSERT ON public.substitutions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_substitution();

-- Function to handle Swap Requests
CREATE OR REPLACE FUNCTION public.handle_new_swap()
RETURNS TRIGGER AS $$
DECLARE
  sender_name TEXT;
BEGIN
  SELECT full_name INTO sender_name FROM public.profiles WHERE id = NEW.faculty_a_id;

  -- Notify Faculty B
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    priority,
    data
  ) VALUES (
    NEW.faculty_b_id,
    'swap_request',
    'Swap Request',
    COALESCE(sender_name, 'A Faculty') || ' wants to swap ' || UPPER(NEW.slot_a_id) || ' with your ' || UPPER(NEW.slot_b_id),
    'high',
    jsonb_build_object('swapId', NEW.id, 'type', 'swap')
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for Swaps
DROP TRIGGER IF EXISTS on_swap_created ON public.class_swaps;
CREATE TRIGGER on_swap_created
  AFTER INSERT ON public.class_swaps
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_swap();

-- ============================================================================
-- PUSH NOTIFICATION TRIGGERS FOR MANAGEMENT ANNOUNCEMENTS
-- ============================================================================
-- These triggers auto-send push notifications when events/holidays/exams are added

-- Enable pg_net extension (required for HTTP calls)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to send push to ALL faculty when calendar event is created
CREATE OR REPLACE FUNCTION notify_calendar_event()
RETURNS TRIGGER AS $$
DECLARE
  faculty_token TEXT;
  event_emoji TEXT;
  notification_title TEXT;
  notification_body TEXT;
  supabase_url TEXT := 'YOUR_SUPABASE_URL'; -- e.g., 'https://xyz.supabase.co'
  service_key TEXT := 'YOUR_SERVICE_ROLE_KEY';
BEGIN
  -- Determine emoji and title based on event type
  CASE NEW.type
    WHEN 'exam' THEN
      event_emoji := '📝';
      notification_title := event_emoji || ' Exam Scheduled';
    WHEN 'holiday' THEN
      event_emoji := '🎉';
      notification_title := event_emoji || ' Holiday Announced';
    WHEN 'event' THEN
      event_emoji := '📢';
      notification_title := event_emoji || ' College Event';
    ELSE
      event_emoji := '📌';
      notification_title := event_emoji || ' Announcement';
  END CASE;

  notification_body := NEW.title || ' on ' || TO_CHAR(NEW.date, 'Mon DD, YYYY');

  -- Loop through all faculty with push tokens
  FOR faculty_token IN 
    SELECT push_token FROM profiles 
    WHERE push_token IS NOT NULL 
      AND role = 'faculty'
      AND notifications_enabled = true
  LOOP
    -- Send push via Edge Function
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-push',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || service_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'token', faculty_token,
        'title', notification_title,
        'body', notification_body,
        'data', jsonb_build_object('type', 'CALENDAR_EVENT', 'eventId', NEW.id)
      )
    );
  END LOOP;

  -- Also create in-app notifications for all faculty
  INSERT INTO notifications (user_id, type, title, body, is_read)
  SELECT 
    id, 
    'alert', 
    notification_title, 
    notification_body, 
    false
  FROM profiles 
  WHERE role = 'faculty' AND notifications_enabled = true;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on academic_calendar
DROP TRIGGER IF EXISTS on_calendar_insert ON academic_calendar;
CREATE TRIGGER on_calendar_insert
  AFTER INSERT ON academic_calendar
  FOR EACH ROW
  EXECUTE FUNCTION notify_calendar_event();

-- ============================================================================
-- IMPORTANT: REPLACE THESE VALUES IN notify_calendar_event() BEFORE RUNNING
-- ============================================================================
-- 1. supabase_url: Your Supabase project URL (e.g., 'https://abcd1234.supabase.co')
-- 2. service_key: Your Service Role Key (from Settings → API → service_role)
--
-- SECURITY NOTE: The service_role key is embedded in the function. This is
-- acceptable because the function runs with SECURITY DEFINER (database context).
-- ============================================================================

-- ============================================================================
-- AUTO-DELETE OLD HISTORY RECORDS (3+ months) using pg_cron
-- ============================================================================
-- NOTE: pg_cron requires Pro plan or self-hosted Supabase.
-- Go to: Supabase Dashboard → Database → Extensions → Search "pg_cron" → Enable

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Cleanup function
CREATE OR REPLACE FUNCTION cleanup_old_history()
RETURNS void AS $$
DECLARE
  subs_deleted INTEGER;
  swaps_deleted INTEGER;
BEGIN
  -- Delete substitution requests older than 3 months
  DELETE FROM substitutions
  WHERE date < NOW() - INTERVAL '3 months'
    AND status IN ('accepted', 'declined');
  GET DIAGNOSTICS subs_deleted = ROW_COUNT;
  
  -- Delete swap requests older than 3 months
  DELETE FROM class_swaps
  WHERE date < NOW() - INTERVAL '3 months'
    AND status IN ('accepted', 'declined');
  GET DIAGNOSTICS swaps_deleted = ROW_COUNT;
  
  -- Log the cleanup
  RAISE NOTICE 'Cleanup complete: % substitutions, % swaps deleted', subs_deleted, swaps_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule the cron job (runs every Sunday at 3:00 AM UTC)
SELECT cron.schedule(
  'cleanup-old-history',      -- Job name
  '0 3 * * 0',                -- Cron expression: At 03:00 on Sunday
  $$SELECT cleanup_old_history()$$
);

-- ============================================================================
-- RPC: get_class_attendance_aggregates
-- ============================================================================
-- Replaces the client-side getAggregatedClassData() function that was
-- downloading 6000+ attendance_log rows to the phone and processing them in JS.
-- The phone receives only ~60 pre-aggregated rows instead of 6000+ raw logs.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_class_attendance_aggregates(
  p_dept TEXT,
  p_year INT,
  p_section TEXT,
  p_threshold FLOAT DEFAULT NULL
)
RETURNS TABLE (
  student_id UUID,
  roll_no TEXT,
  full_name TEXT,
  dept TEXT,
  section TEXT,
  year INT,
  present_sessions BIGINT,
  absent_sessions BIGINT,
  od_sessions BIGINT,
  leave_sessions BIGINT,
  total_sessions BIGINT,
  attendance_percentage INT,
  student_mobile TEXT,
  parent_mobile TEXT
)
LANGUAGE sql
STABLE
AS $$
  WITH session_count AS (
    SELECT COUNT(*) AS total
    FROM attendance_sessions
    WHERE target_dept = p_dept
      AND target_year = p_year
      AND target_section = p_section
  ),
  student_stats AS (
    SELECT
      s.id AS student_id,
      s.roll_no,
      s.full_name,
      s.dept,
      s.section,
      s.year,
      COALESCE(SUM(CASE WHEN al.status = 'present' THEN 1 ELSE 0 END), 0) AS present_sessions,
      COALESCE(SUM(CASE WHEN al.status = 'absent'  THEN 1 ELSE 0 END), 0) AS absent_sessions,
      COALESCE(SUM(CASE WHEN al.status = 'od'      THEN 1 ELSE 0 END), 0) AS od_sessions,
      COALESCE(SUM(CASE WHEN al.status = 'leave'   THEN 1 ELSE 0 END), 0) AS leave_sessions,
      s.mobile AS student_mobile,
      s.parent_mobile
    FROM students s
    LEFT JOIN attendance_logs al ON al.student_id = s.id
    LEFT JOIN attendance_sessions asess 
      ON asess.id = al.session_id
      AND asess.target_dept = p_dept
      AND asess.target_year = p_year
      AND asess.target_section = p_section
    WHERE s.dept = p_dept
      AND s.year = p_year
      AND s.section = p_section
      AND s.is_active = true
    GROUP BY s.id, s.roll_no, s.full_name, s.dept, s.section, s.year, s.mobile, s.parent_mobile
  )
  SELECT
    ss.student_id,
    ss.roll_no,
    ss.full_name,
    ss.dept,
    ss.section,
    ss.year,
    ss.present_sessions,
    ss.absent_sessions,
    ss.od_sessions,
    ss.leave_sessions,
    sc.total AS total_sessions,
    CASE 
      WHEN (ss.present_sessions + ss.absent_sessions + ss.od_sessions) > 0 
      THEN ROUND(((ss.present_sessions + ss.od_sessions)::FLOAT / (ss.present_sessions + ss.absent_sessions + ss.od_sessions)::FLOAT) * 100)::INT
      ELSE 0
    END AS attendance_percentage,
    ss.student_mobile,
    ss.parent_mobile
  FROM student_stats ss
  CROSS JOIN session_count sc
  WHERE (p_threshold IS NULL OR 
    CASE 
      WHEN (ss.present_sessions + ss.absent_sessions + ss.od_sessions) > 0 
      THEN ROUND(((ss.present_sessions + ss.od_sessions)::FLOAT / (ss.present_sessions + ss.absent_sessions + ss.od_sessions)::FLOAT) * 100)
      ELSE 0
    END < p_threshold)
  ORDER BY ss.roll_no;
$$;

-- ============================================================================
-- RPC: get_dashboard_stats
-- ============================================================================
-- Replaces the client-side getDashboardStats() that did N+1 queries
-- (one COUNT per unique class). Single call returns all stats.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_faculty_id UUID,
  p_day TEXT,
  p_date TEXT
)
RETURNS TABLE (
  classes_today INT,
  pending_count INT,
  total_students BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH today_slots AS (
    SELECT slot_id
    FROM master_timetables
    WHERE faculty_id = p_faculty_id
      AND day = p_day
      AND is_active = true
  ),
  completed_slots AS (
    SELECT slot_id
    FROM attendance_sessions
    WHERE faculty_id = p_faculty_id
      AND date = p_date::DATE
  ),
  unique_classes AS (
    SELECT DISTINCT target_dept, target_year, target_section
    FROM master_timetables
    WHERE faculty_id = p_faculty_id
      AND is_active = true
  ),
  student_counts AS (
    SELECT COUNT(*) AS cnt
    FROM students s
    INNER JOIN unique_classes uc
      ON s.dept = uc.target_dept
      AND s.year = uc.target_year
      AND s.section = uc.target_section
    WHERE s.is_active = true
  )
  SELECT
    (SELECT COUNT(*)::INT FROM today_slots) AS classes_today,
    (SELECT COUNT(*)::INT FROM today_slots ts WHERE ts.slot_id NOT IN (SELECT slot_id FROM completed_slots)) AS pending_count,
    (SELECT cnt FROM student_counts) AS total_students;
$$;

-- ============================================================================
-- RPC: get_faculty_schedule
-- ============================================================================
-- Replaces the client-side getTodaySchedule() that did N+1 queries for swaps.
-- Returns the fully resolved schedule = base timetable - swapped out + swapped in.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_faculty_schedule(
  p_faculty_id UUID,
  p_day TEXT,
  p_date TEXT
)
RETURNS TABLE (
  id UUID,
  day TEXT,
  slot_id TEXT,
  start_time TIME,
  end_time TIME,
  room TEXT,
  target_dept TEXT,
  target_year INT,
  target_section TEXT,
  batch INT,
  subject_id UUID,
  subject_name TEXT,
  subject_code TEXT,
  is_swap BOOLEAN
)
LANGUAGE sql
STABLE
AS $$
  -- Base schedule (own classes, excluding swapped-out slots)
  WITH accepted_swaps AS (
    SELECT id, faculty_a_id, faculty_b_id, slot_a_id, slot_b_id
    FROM class_swaps
    WHERE date = p_date::DATE
      AND status = 'accepted'
      AND (faculty_a_id = p_faculty_id OR faculty_b_id = p_faculty_id)
  ),
  swapped_out_slots AS (
    -- Slots I gave away
    SELECT slot_a_id AS slot_id FROM accepted_swaps WHERE faculty_a_id = p_faculty_id
    UNION ALL
    SELECT slot_b_id AS slot_id FROM accepted_swaps WHERE faculty_b_id = p_faculty_id
  ),
  base_schedule AS (
    SELECT mt.id, mt.day, mt.slot_id, mt.start_time, mt.end_time, mt.room,
           mt.target_dept, mt.target_year, mt.target_section, mt.batch,
           mt.subject_id, sub.name AS subject_name, sub.code AS subject_code,
           false AS is_swap
    FROM master_timetables mt
    JOIN subjects sub ON sub.id = mt.subject_id
    WHERE mt.faculty_id = p_faculty_id
      AND mt.day = p_day
      AND mt.is_active = true
      AND mt.slot_id NOT IN (SELECT slot_id FROM swapped_out_slots)
  ),
  acquired_schedule AS (
    -- Slots I acquired from swap partners
    SELECT mt.id, mt.day, mt.slot_id, mt.start_time, mt.end_time, mt.room,
           mt.target_dept, mt.target_year, mt.target_section, mt.batch,
           mt.subject_id, sub.name AS subject_name, sub.code AS subject_code,
           true AS is_swap
    FROM accepted_swaps sw
    JOIN master_timetables mt ON (
      -- If I'm Faculty A, I acquire B's slot
      (sw.faculty_a_id = p_faculty_id AND mt.faculty_id = sw.faculty_b_id AND mt.slot_id = sw.slot_b_id)
      OR
      -- If I'm Faculty B, I acquire A's slot
      (sw.faculty_b_id = p_faculty_id AND mt.faculty_id = sw.faculty_a_id AND mt.slot_id = sw.slot_a_id)
    )
    JOIN subjects sub ON sub.id = mt.subject_id
    WHERE mt.day = p_day
      AND mt.is_active = true
  )
  SELECT * FROM base_schedule
  UNION ALL
  SELECT * FROM acquired_schedule
  ORDER BY start_time;
$$;

-- ============================================================================
-- DB TRIGGERS: AUTOMATED PROFILE HYDRATION
-- ============================================================================
-- This function runs automatically whenever a new row is inserted into auth.users.
-- It checks the newly created auth.users email against the public.faculty_invitations table.
-- If a pending invitation is found, it automatically creates the public.profiles record
-- and marks the invitation as accepted.

CREATE OR REPLACE FUNCTION public.handle_new_user_from_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
    invitation_record RECORD;
BEGIN
    -- Check if there is a pending invitation for the new user's email
    SELECT * INTO invitation_record
    FROM public.faculty_invitations
    WHERE LOWER(email) = LOWER(NEW.email) AND status = 'pending'
    LIMIT 1;

    -- If a pending invitation exists, auto-create the profile
    IF FOUND THEN
        -- Safely insert the profile
        INSERT INTO public.profiles (id, email, full_name, role, dept)
        VALUES (
            NEW.id, 
            LOWER(invitation_record.email), 
            invitation_record.full_name, 
            invitation_record.role, 
            invitation_record.dept
        );

        -- If they are a class incharge, also map them
        IF invitation_record.role = 'class_incharge' AND invitation_record.year IS NOT NULL AND invitation_record.section IS NOT NULL THEN
            INSERT INTO public.class_incharges (faculty_id, dept, year, section)
            VALUES (NEW.id, invitation_record.dept, invitation_record.year, invitation_record.section)
            ON CONFLICT DO NOTHING;
        END IF;

        -- Mark the invitation as accepted
        UPDATE public.faculty_invitations
        SET status = 'accepted', updated_at = NOW()
        WHERE id = invitation_record.id;
        
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN unique_violation THEN
        -- Profile already exists, do nothing
        RETURN NEW;
    WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user_from_invite failed: %', SQLERRM;
        RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_invite_check ON auth.users;

CREATE TRIGGER on_auth_user_created_invite_check
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_from_invite();

-- ============================================================================
-- STUDENT LEAVES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.student_leaves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    reason_category TEXT NOT NULL DEFAULT 'personal' CHECK (reason_category IN ('medical', 'personal', 'family', 'academic', 'event', 'other')),
    reason_text TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days INTEGER GENERATED ALWAYS AS (end_date - start_date + 1) STORED,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    submitted_by UUID REFERENCES public.profiles(id),
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_student_leaves_student ON public.student_leaves(student_id);
CREATE INDEX idx_student_leaves_status ON public.student_leaves(status);
CREATE INDEX idx_student_leaves_dates ON public.student_leaves(start_date, end_date);

ALTER TABLE public.student_leaves ENABLE ROW LEVEL SECURITY;

-- HOD/elevated can manage student leaves in their dept
CREATE POLICY "student_leaves_read" ON public.student_leaves
    FOR SELECT USING (
        public.is_elevated_role() OR public.is_hod()
    );

CREATE POLICY "student_leaves_insert" ON public.student_leaves
    FOR INSERT WITH CHECK (
        public.is_elevated_role() OR public.is_hod()
    );

CREATE POLICY "student_leaves_update" ON public.student_leaves
    FOR UPDATE USING (
        public.is_elevated_role() OR public.is_hod()
    );

CREATE POLICY "student_leaves_delete" ON public.student_leaves
    FOR DELETE USING (
        public.is_elevated_role()
    );

-- ============================================================================
-- VIEW: Student Attendance Aggregates
-- ============================================================================
-- Used by StudentOverviewPage, CompliancePage, and BenchmarkingPage
-- Aggregates attendance_logs per student into summary stats.

CREATE OR REPLACE VIEW public.view_student_aggregates AS
SELECT
    al.student_id,
    s.full_name,
    s.roll_no,
    s.dept,
    s.year,
    s.section,
    COUNT(DISTINCT al.session_id) AS total_sessions,
    COUNT(DISTINCT al.session_id) FILTER (WHERE al.status = 'present') AS present_sessions,
    COUNT(DISTINCT al.session_id) FILTER (WHERE al.status = 'absent') AS absent_sessions,
    COUNT(DISTINCT al.session_id) FILTER (WHERE al.status = 'od') AS od_sessions,
    COUNT(DISTINCT al.session_id) FILTER (WHERE al.status = 'leave') AS leave_sessions,
    CASE
        WHEN COUNT(DISTINCT al.session_id) > 0 THEN
            ROUND(
                (
                    COUNT(DISTINCT al.session_id) FILTER (WHERE al.status IN ('present', 'od'))::NUMERIC
                    / COUNT(DISTINCT al.session_id)::NUMERIC
                ) * 100, 2
            )
        ELSE 0
    END AS attendance_percentage
FROM public.attendance_logs al
JOIN public.students s ON s.id = al.student_id
GROUP BY al.student_id, s.full_name, s.roll_no, s.dept, s.year, s.section;

-- ============================================================================
-- DB FUNCTIONS: SYSTEM ADMIN MANAGEMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_create_system_admin(
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT,
    p_role TEXT,
    p_username TEXT,
    p_dept TEXT DEFAULT NULL,
    p_avatar_url TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_designation TEXT DEFAULT NULL,
    p_joining_date DATE DEFAULT NULL,
    p_gender TEXT DEFAULT NULL,
    p_qualification TEXT DEFAULT NULL,
    p_experience_years INTEGER DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_date_of_birth DATE DEFAULT NULL,
    p_blood_group TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    IF public.auth_user_role() NOT IN ('developer', 'management', 'principal') THEN
        RAISE EXCEPTION 'Unauthorized to create system admins';
    END IF;

    IF p_role = 'developer' AND public.auth_user_role() != 'developer' THEN
        RAISE EXCEPTION 'Only developers can create other developers';
    END IF;

    -- 1. Check if user already exists in auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE email = LOWER(p_email);

    IF v_user_id IS NOT NULL THEN
        -- User exists, update them
        UPDATE auth.users SET 
            encrypted_password = crypt(p_password, extensions.gen_salt('bf')),
            raw_user_meta_data = jsonb_build_object('full_name', p_full_name, 'avatar_url', p_avatar_url),
            updated_at = NOW()
        WHERE id = v_user_id;
    ELSE
        -- User does not exist, insert them
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            confirmation_token, recovery_token, email_change_token_new, email_change
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', LOWER(p_email), crypt(p_password, extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_full_name, 'avatar_url', p_avatar_url), NOW(), NOW(),
            '', '', '', ''
        ) RETURNING id INTO v_user_id;
    END IF;

    -- 2. Check if user exists in public.admins
    IF EXISTS (SELECT 1 FROM public.admins WHERE email = LOWER(p_email)) THEN
        -- Update existing admin record
        UPDATE public.admins SET 
            role = p_role,
            full_name = p_full_name,
            username = p_username,
            dept = p_dept,
            avatar_url = p_avatar_url,
            phone = p_phone,
            designation = p_designation,
            joining_date = p_joining_date,
            gender = p_gender,
            qualification = p_qualification,
            experience_years = p_experience_years,
            address = p_address,
            date_of_birth = p_date_of_birth,
            blood_group = p_blood_group,
            is_active = true,
            updated_at = NOW()
        WHERE email = LOWER(p_email);
    ELSE
        -- Insert new admin record
        INSERT INTO public.admins (
            id, username, email, full_name, role, dept, avatar_url, phone, designation, joining_date, gender, qualification, experience_years, address, date_of_birth, blood_group
        ) VALUES (
            v_user_id, p_username, LOWER(p_email), p_full_name, p_role, p_dept, p_avatar_url, p_phone, p_designation, p_joining_date, p_gender, p_qualification, p_experience_years, p_address, p_date_of_birth, p_blood_group
        );
    END IF;

    RETURN jsonb_build_object('id', v_user_id, 'status', 'success');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_system_admin(
    p_user_id UUID,
    p_full_name TEXT,
    p_role TEXT,
    p_username TEXT,
    p_dept TEXT DEFAULT NULL,
    p_password TEXT DEFAULT NULL,
    p_avatar_url TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_designation TEXT DEFAULT NULL,
    p_joining_date DATE DEFAULT NULL,
    p_gender TEXT DEFAULT NULL,
    p_qualification TEXT DEFAULT NULL,
    p_experience_years INTEGER DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_date_of_birth DATE DEFAULT NULL,
    p_blood_group TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_target_role TEXT;
BEGIN
    IF public.auth_user_role() NOT IN ('developer', 'management', 'principal') THEN
        RAISE EXCEPTION 'Unauthorized to update system admins';
    END IF;

    SELECT role INTO v_target_role FROM public.admins WHERE id = p_user_id;
    
    IF v_target_role = 'developer' AND public.auth_user_role() != 'developer' THEN
        RAISE EXCEPTION 'Only developers can modify other developers';
    END IF;
    IF p_role = 'developer' AND public.auth_user_role() != 'developer' THEN
        RAISE EXCEPTION 'Only developers can grant the developer role';
    END IF;

    UPDATE public.admins
    SET full_name = p_full_name, role = p_role, username = p_username, dept = p_dept,
        avatar_url = p_avatar_url, phone = p_phone, designation = p_designation,
        joining_date = p_joining_date, gender = p_gender, qualification = p_qualification,
        experience_years = p_experience_years, address = p_address, date_of_birth = p_date_of_birth,
        blood_group = p_blood_group, updated_at = NOW()
    WHERE id = p_user_id;

    IF p_password IS NOT NULL AND p_password != '' THEN
        UPDATE auth.users
        SET encrypted_password = crypt(p_password, extensions.gen_salt('bf')), updated_at = NOW()
        WHERE id = p_user_id;
    END IF;

    UPDATE auth.users
    SET raw_user_meta_data = jsonb_set(
        jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{full_name}', to_jsonb(p_full_name)),
        '{avatar_url}', to_jsonb(p_avatar_url)
    ), updated_at = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object('id', p_user_id, 'status', 'success');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_system_admin(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_target_role TEXT;
BEGIN
    IF public.auth_user_role() NOT IN ('developer', 'management', 'principal') THEN
        RAISE EXCEPTION 'Unauthorized to delete system admins';
    END IF;

    SELECT role INTO v_target_role FROM public.admins WHERE id = p_user_id;
    IF v_target_role = 'developer' AND public.auth_user_role() != 'developer' THEN
        RAISE EXCEPTION 'Only developers can delete other developers';
    END IF;

    DELETE FROM public.admins WHERE id = p_user_id;
    DELETE FROM auth.users WHERE id = p_user_id;

    RETURN jsonb_build_object('id', p_user_id, 'status', 'deleted');
END;
$$;

-- ============================================================================
-- STORAGE CONFIGURATION
-- ============================================================================

-- Create avatars bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Avatars Bucket Policies
CREATE POLICY "Avatar images are publicly accessible."
  ON storage.objects FOR SELECT
  USING ( bucket_id = 'avatars' );

CREATE POLICY "Anyone can upload an avatar."
  ON storage.objects FOR INSERT
  WITH CHECK ( bucket_id = 'avatars' );

CREATE POLICY "Anyone can update their own avatar."
  ON storage.objects FOR UPDATE
  USING ( bucket_id = 'avatars' );

CREATE POLICY "Anyone can delete their own avatar."
  ON storage.objects FOR DELETE
  USING ( bucket_id = 'avatars' );

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
