-- ============================================================================
-- CLASS INCHARGES (Link Faculty to Classes)
-- ============================================================================
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

-- Enable RLS
ALTER TABLE public.class_incharges ENABLE ROW LEVEL SECURITY;

-- Sample Data (Assign Admin/Dev as Incharge for CSE-3-A for testing)
-- NOTE: Replace 'USER_ID_HERE' with actual user ID if running manually
-- INSERT INTO public.class_incharges (faculty_id, dept, year, section)
-- SELECT id, 'CSE', 3, 'A' FROM public.profiles WHERE email = 'admin@mrce.ac.in';
