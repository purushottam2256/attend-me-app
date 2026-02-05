-- ============================================================================
-- PUSH NOTIFICATION TRIGGERS FOR MANAGEMENT ANNOUNCEMENTS
-- ============================================================================
-- Run this in Supabase SQL Editor
-- These triggers auto-send push notifications when events/holidays/exams are added

-- 1. Enable pg_net extension (required for HTTP calls)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Function to send push to ALL faculty when calendar event is created
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

-- 3. Create trigger on academic_calendar
DROP TRIGGER IF EXISTS on_calendar_insert ON academic_calendar;
CREATE TRIGGER on_calendar_insert
  AFTER INSERT ON academic_calendar
  FOR EACH ROW
  EXECUTE FUNCTION notify_calendar_event();

-- ============================================================================
-- VERIFY SETUP
-- ============================================================================
-- Run this to check if trigger is active:
SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'on_calendar_insert';

-- ============================================================================
-- IMPORTANT: REPLACE THESE VALUES BEFORE RUNNING
-- ============================================================================
-- 1. supabase_url: Your Supabase project URL (e.g., 'https://abcd1234.supabase.co')
-- 2. service_key: Your Service Role Key (from Settings → API → service_role)
--
-- SECURITY NOTE: The service_role key is embedded in the function. This is
-- acceptable because the function runs with SECURITY DEFINER (database context).
-- ============================================================================
