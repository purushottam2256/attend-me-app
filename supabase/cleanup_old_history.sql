-- ============================================================================
-- AUTO-DELETE OLD HISTORY RECORDS (3+ months) using pg_cron
-- ============================================================================
-- Run this in Supabase SQL Editor

-- STEP 1: Enable pg_cron extension (requires Pro plan or self-hosted)
-- Go to: Supabase Dashboard → Database → Extensions → Search "pg_cron" → Enable

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- STEP 2: Create the cleanup function
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

-- STEP 3: Schedule the cron job (runs every Sunday at 3:00 AM UTC)
SELECT cron.schedule(
  'cleanup-old-history',      -- Job name
  '0 3 * * 0',                -- Cron expression: At 03:00 on Sunday
  $$SELECT cleanup_old_history()$$
);

-- ============================================================================
-- VERIFY SETUP
-- ============================================================================

-- Check if cron job is scheduled:
SELECT * FROM cron.job;

-- To manually run the cleanup:
-- SELECT cleanup_old_history();

-- To unschedule the job:
-- SELECT cron.unschedule('cleanup-old-history');

-- ============================================================================
-- CRON EXPRESSION REFERENCE
-- ============================================================================
-- ┌───────────── minute (0 - 59)
-- │ ┌───────────── hour (0 - 23)
-- │ │ ┌───────────── day of month (1 - 31)
-- │ │ │ ┌───────────── month (1 - 12)
-- │ │ │ │ ┌───────────── day of week (0 - 6) (Sunday = 0)
-- │ │ │ │ │
-- 0 3 * * 0  = Every Sunday at 3:00 AM UTC
-- 0 0 1 * *  = First day of every month at midnight
-- 0 */6 * * * = Every 6 hours
