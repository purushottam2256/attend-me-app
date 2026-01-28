-- Refresh the student aggregates view to ensure latest students are visible
REFRESH MATERIALIZED VIEW public.view_student_aggregates;

-- Verify if there are students satisfying the condition
-- Replace 'CSE', 3, 'A' with what you inserted into class_incharges
-- SELECT count(*) FROM view_student_aggregates WHERE dept = 'CSE' AND year = 3 AND section = 'A';
