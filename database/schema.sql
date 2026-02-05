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
    'swap_accepted'
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
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_subjects_code ON public.subjects(code);
CREATE INDEX idx_subjects_dept_year ON public.subjects(dept, year);

-- ----------------------------------------------------------------------------
-- 6. MASTER TIMETABLES
-- ----------------------------------------------------------------------------
CREATE TABLE public.master_timetables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    faculty_id UUID NOT NULL REFERENCES public.profiles(id),
    day TEXT NOT NULL CHECK (day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
    slot_id TEXT NOT NULL, -- p1, p2, p3, p4, p5, p6, p7
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    subject_id UUID NOT NULL REFERENCES public.subjects(id),
    target_dept TEXT NOT NULL,
    target_year INTEGER NOT NULL,
    target_section TEXT NOT NULL,
    batch INTEGER, -- NULL for full class, 1 or 2 for lab batches
    room TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_faculty_slot_day UNIQUE (faculty_id, day, slot_id)
);

-- Indexes
CREATE INDEX idx_timetables_faculty ON public.master_timetables(faculty_id);
CREATE INDEX idx_timetables_day_slot ON public.master_timetables(day, slot_id);
CREATE INDEX idx_timetables_target ON public.master_timetables(target_dept, target_year, target_section);

-- ----------------------------------------------------------------------------
-- 7. ACADEMIC CALENDAR (Holidays & Exams)
-- ----------------------------------------------------------------------------
CREATE TABLE public.academic_calendar (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('holiday', 'exam', 'event')),
    title TEXT NOT NULL,
    description TEXT,
    affects_periods TEXT[], -- NULL means all periods, or ['p1', 'p2'] for specific
    created_by UUID REFERENCES public.admins(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_date_type UNIQUE (date, type)
);

-- Indexes
CREATE INDEX idx_calendar_date ON public.academic_calendar(date);
CREATE INDEX idx_calendar_type ON public.academic_calendar(type);

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
    CONSTRAINT unique_class_incharge UNIQUE (dept, year, section),
    CONSTRAINT unique_faculty_assignment UNIQUE (faculty_id, dept, year, section)
);

-- Indexes
CREATE INDEX idx_class_incharges_faculty ON public.class_incharges(faculty_id);
CREATE INDEX idx_class_incharges_class ON public.class_incharges(dept, year, section);

-- ============================================================================
-- MATERIALIZED VIEWS (For Performance - Free Tier Compatible)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Student Attendance Aggregates (Updates hourly 9 AM - 5 PM)
-- ----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW public.view_student_aggregates AS
SELECT 
    s.id AS student_id,
    s.roll_no,
    s.full_name,
    s.dept,
    s.section,
    s.year,
    COUNT(DISTINCT als.id) FILTER (WHERE als.status = 'present' OR als.status = 'od') AS present_sessions,
    COUNT(DISTINCT als.id) FILTER (WHERE als.status = 'absent') AS absent_sessions,
    COUNT(DISTINCT als.id) FILTER (WHERE als.status = 'od') AS od_sessions,
    COUNT(DISTINCT als.id) FILTER (WHERE als.status = 'leave') AS leave_sessions,
    COUNT(DISTINCT als.id) AS total_sessions,
    CASE 
        WHEN COUNT(DISTINCT als.id) > 0 THEN
            ROUND(
                (COUNT(DISTINCT als.id) FILTER (WHERE als.status = 'present' OR als.status = 'od')::NUMERIC / 
                 COUNT(DISTINCT als.id)::NUMERIC) * 100, 
                2
            )
        ELSE 0
    END AS attendance_percentage,
    MAX(als.marked_at) AS last_attendance_date
FROM public.students s
LEFT JOIN public.attendance_logs als ON s.id = als.student_id
LEFT JOIN public.attendance_sessions ass ON als.session_id = ass.id
WHERE s.is_active = TRUE
GROUP BY s.id, s.roll_no, s.full_name, s.dept, s.section, s.year;

-- Indexes on materialized view
CREATE UNIQUE INDEX idx_mv_student_aggregates_student_id ON public.view_student_aggregates(student_id);
CREATE INDEX idx_mv_student_aggregates_dept_section ON public.view_student_aggregates(dept, section);
CREATE INDEX idx_mv_student_aggregates_percentage ON public.view_student_aggregates(attendance_percentage);

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

-- Function to get user's role (bypasses RLS)
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS TEXT AS $$
  SELECT role::TEXT FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Function to get user's department (bypasses RLS)
CREATE OR REPLACE FUNCTION public.auth_user_dept()
RETURNS TEXT AS $$
  SELECT dept FROM public.profiles WHERE id = auth.uid()
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

-- Grant execute to all authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_dept() TO authenticated;

-- ============================================================================
-- PROFILES Policies
-- ============================================================================
-- Anyone authenticated can read profiles (needed for faculty lookups)
CREATE POLICY "profiles_read_all" ON public.profiles 
    FOR SELECT TO authenticated 
    USING (true);

-- Users can update their own profile
CREATE POLICY "profiles_update" ON public.profiles 
    FOR UPDATE USING (id = auth.uid());

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

-- ============================================================================
-- MASTER_TIMETABLES Policies
-- ============================================================================
-- Faculty can read their own
CREATE POLICY "timetables_own" ON public.master_timetables 
    FOR SELECT USING (faculty_id = auth.uid());

-- HOD can read their dept (using function)
CREATE POLICY "timetables_hod_read" ON public.master_timetables 
    FOR SELECT USING (
        public.auth_user_role() = 'hod' 
        AND target_dept = public.auth_user_dept()
    );

-- Superadmin can read all
CREATE POLICY "timetables_admin" ON public.master_timetables 
    FOR SELECT USING (public.auth_user_role() IN ('management', 'developer'));

-- Principal can read all
CREATE POLICY "timetables_principal_read" ON public.master_timetables 
    FOR SELECT USING (public.auth_user_role() = 'principal');

-- Admins can manage all timetables
CREATE POLICY "timetables_admin_manage" ON public.master_timetables 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE email = public.get_my_email()
        )
    );

-- ============================================================================
-- STUDENTS Policies
-- ============================================================================
-- Faculty can read students they teach
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

-- Faculty can read students for substituted classes
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

-- HOD can read their dept
CREATE POLICY "students_hod_read" ON public.students 
    FOR SELECT USING (
        public.auth_user_role() = 'hod' 
        AND dept = public.auth_user_dept()
    );

-- Superadmin can manage all
CREATE POLICY "students_admin" ON public.students 
    FOR ALL USING (public.auth_user_role() IN ('management', 'developer'));

-- Principal can read all
CREATE POLICY "students_principal_read" ON public.students 
    FOR SELECT USING (public.auth_user_role() = 'principal');

-- Admins can manage students
CREATE POLICY "students_admin_manage" ON public.students 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE email = public.get_my_email()
        )
    );

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

-- HOD can read sessions in their dept
CREATE POLICY "sessions_hod_read" ON public.attendance_sessions 
    FOR SELECT USING (
        public.auth_user_role() = 'hod' 
        AND target_dept = public.auth_user_dept()
    );

-- Superadmin can manage all
CREATE POLICY "sessions_admin" ON public.attendance_sessions 
    FOR ALL USING (public.auth_user_role() IN ('management', 'developer'));

-- Principal can read all
CREATE POLICY "sessions_principal_read" ON public.attendance_sessions 
    FOR SELECT USING (public.auth_user_role() = 'principal');

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

-- HOD can read logs in their dept
CREATE POLICY "logs_hod_read" ON public.attendance_logs 
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.attendance_sessions sess
            WHERE sess.id = session_id
                AND public.auth_user_role() = 'hod'
                AND sess.target_dept = public.auth_user_dept()
        )
    );

-- Superadmin can manage all
CREATE POLICY "logs_admin" ON public.attendance_logs 
    FOR ALL USING (public.auth_user_role() IN ('management', 'developer'));

-- Principal can read all
CREATE POLICY "logs_principal_read" ON public.attendance_logs 
    FOR SELECT USING (public.auth_user_role() = 'principal');

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

-- Principal can read all substitutions
CREATE POLICY "substitutions_principal" ON public.substitutions 
    FOR SELECT USING (public.auth_user_role() = 'principal');

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

-- Principal can read all swaps
CREATE POLICY "swaps_principal" ON public.class_swaps 
    FOR SELECT USING (public.auth_user_role() = 'principal');

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

-- Only admins can update config
CREATE POLICY "config_admin_update" ON public.app_config 
    FOR UPDATE USING (public.auth_user_role() IN ('management', 'developer'));

-- ============================================================================
-- EDGE FUNCTION CONTRACTS (Documentation)
-- ============================================================================

/*
EDGE FUNCTIONS (Supabase Edge Functions - Deno Runtime)

1. send-notification
   Purpose: Send FCM push notifications
   Input: { user_id, type, title, body, data, priority }
   Output: { success: boolean, message_id?: string }
   Notes: Uses FCM Admin SDK, requires service role key

2. process-offline-queue
   Purpose: Process pending offline queue items
   Input: { faculty_id?: UUID } (optional, processes all if not provided)
   Output: { processed: number, failed: number }
   Notes: Calls process_offline_queue_item() function for each item

3. refresh-materialized-views
   Purpose: Refresh attendance aggregate views
   Input: None (or { force: boolean })
   Output: { success: boolean, refreshed_at: timestamp }
   Notes: Should be called hourly (9 AM - 5 PM) via cron or scheduled job

4. validate-substitute-request
   Purpose: Check if substitute request is still valid
   Input: { substitution_id: UUID }
   Output: { valid: boolean, status: string, message?: string }
   Notes: Prevents race conditions (Ghost Request scenario)

5. generate-attendance-report
   Purpose: Generate PDF/CSV reports
   Input: { session_ids: UUID[], format: 'pdf' | 'csv' | 'json' | 'text' }
   Output: { url: string, expires_at: timestamp }
   Notes: Uses server-side generation, stores in Supabase Storage temporarily

REALTIME VS FCM DELIVERY LOGIC:

1. REALTIME (Supabase Realtime - WebSocket):
   - Use for: In-app notifications, live updates, instant sync
   - Channels:
     * notifications:{user_id} - Personal notifications
     * substitutions:{faculty_id} - Substitute requests
     * attendance:{session_id} - Live attendance updates
   - Advantages: Instant, no external service, works in app
   - Limitations: Only works when app is open

2. FCM (Firebase Cloud Messaging):
   - Use for: Lock screen notifications, background alerts, critical updates
   - Triggers:
     * Substitute requests (high priority)
     * Class reminders (scheduled)
     * Management updates (high priority)
     * Exam duty reminders (scheduled)
   - Advantages: Works when app is closed, lock screen display
   - Implementation: Edge Function sends to FCM, FCM delivers to device

3. HYBRID APPROACH (Recommended):
   - Critical/Urgent: FCM + Realtime (dual delivery)
   - Normal: Realtime only (if app open), FCM (if app closed)
   - Scheduled: FCM only (local scheduling on device for reminders)

4. NOTIFICATION FLOW:
   a. Event occurs (e.g., substitute request)
   b. Insert into notifications table
   c. Edge Function triggered (via database trigger or webhook)
   d. Edge Function:
      - Sends FCM notification (if device_token exists)
      - Broadcasts Realtime event (if user online)
   e. Mobile app receives both:
      - FCM: Shows lock screen notification
      - Realtime: Updates in-app notification center

5. FALLBACK STRATEGY:
   - If FCM fails: Retry 3 times, then mark as failed
   - If Realtime fails: Notification still in DB, user sees on next app open
   - Offline Queue: All notifications queued, processed when online
*/

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

-- Create Policy (Read Only for everyone)
create policy "Enable read access for all users" on public.holidays
  for select using (true);

-- Seed Data
insert into public.holidays (title, date, type, description) values 
  ('Republic Day', '2026-01-26', 'holiday', 'National Holiday'), 
  ('Annual Tech Fest', '2026-03-15', 'event', 'College wide technical symposium'), 
  ('Mid Semester Exams', '2026-02-10', 'exam', 'Phase 1 internal assessments');

-- ============================================================================
-- 18. LEAVES AND ISSUES (from migration)
-- ============================================================================

-- LEAVES TABLE
create table if not exists public.leaves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  reason text not null,
  start_date timestamptz not null,
  end_date timestamptz not null,
  leave_type text check (leave_type in ('full_day', 'half_day')) default 'full_day',
  status text check (status in ('pending', 'approved', 'rejected')) default 'pending',
  created_at timestamptz default now()
);

-- ISSUES/REPORTS TABLE
create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  description text not null,
  has_screenshot boolean default false,
  status text check (status in ('open', 'investigating', 'resolved')) default 'open',
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.leaves enable row level security;
alter table public.issues enable row level security;

-- Policies (Users can create and see their own leaves/issues)
create policy "Users can insert their own leaves" on public.leaves
  for insert with check (auth.uid() = user_id);

create policy "Users can view their own leaves" on public.leaves
  for select using (auth.uid() = user_id);

create policy "Users can insert their own issues" on public.issues
  for insert with check (auth.uid() = user_id);

create policy "Users can view their own issues" on public.issues
  for select using (auth.uid() = user_id);

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
-- TIMETABLE RLS POLICIES (Fixed for Swap Feature)
-- ============================================================================

-- Drop the restrictive policy
DROP POLICY IF EXISTS "timetables_own" ON public.master_timetables;

-- Create a new policy that allows ALL authenticated users to READ all timetables
-- This is necessary for the 'Swap' feature to find other faculty schedules.
CREATE POLICY "timetables_read_all" ON public.master_timetables 
    FOR SELECT TO authenticated 
    USING (true);

-- Ensure modification is still restricted to owner
CREATE POLICY "timetables_update_own" ON public.master_timetables 
    FOR UPDATE USING (faculty_id = auth.uid());

CREATE POLICY "timetables_insert_own" ON public.master_timetables 
    FOR INSERT WITH CHECK (faculty_id = auth.uid());

CREATE POLICY "timetables_delete_own" ON public.master_timetables 
    FOR DELETE USING (faculty_id = auth.uid());

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
-- END OF SCHEMA
-- ============================================================================

