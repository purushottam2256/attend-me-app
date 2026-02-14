/**
 * Supabase Edge Function: process-reminders
 * 
 * triggered by Cron (or manual request) to send 10-minute class reminders.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create } from "https://deno.land/x/djwt@v2.8/mod.ts";

// reused from send-push
const FCM_PROJECT_ID = "mrce-attend-me"; 
const FCM_V1_ENDPOINT = `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`;

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

// --- Helper: Get Access Token ---
async function getAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  
  const key = serviceAccount.private_key.replace(/\\n/g, "\n");
  
  // Import private key
  const binaryDerString = window.atob(
    key.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "")
  );
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    true,
    ["sign"]
  );

  const jwt = await create({ alg: "RS256", typ: "JWT" }, claim, privateKey);

  const params = new URLSearchParams();
  params.append("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  params.append("assertion", jwt);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Failed to get token: ${JSON.stringify(data)}`);
  return data.access_token;
}

// --- Main ---

// --- Main ---

serve(async (req: Request) => {
    // 1. Setup
    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // @ts-ignore
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; // Must use Service Role to read all profiles
    const supabase = createClient(supabaseUrl, supabaseKey);

    // @ts-ignore
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!serviceAccountJson) return new Response("Missing FIREBASE_SERVICE_ACCOUNT", { status: 500 });
    const serviceAccount = JSON.parse(serviceAccountJson);

    // 2. Determine Time Check
    // We want classes starting in 10 minutes. 
    // E.g. Current time 10:00 -> Check for 10:10 start_time.
    // However, cron might run every minute or 10 mins. 
    // Safe bet: Check for classes starting between [now + 9 mins, now + 11 mins] to allow some drift.
    
    // Convert current UTC to IST (Asia/Kolkata)
    const now = new Date();
    // Add 5.5 hours for IST
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    
    const targetTime = new Date(istNow.getTime() + 10 * 60 * 1000); // +10 mins
    
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[istNow.getDay()];
    
    // Format HH:mm:00
    const pad = (n: number) => n.toString().padStart(2, '0');
    // We'll check for strict HH:mm match or range if DB stores time differently
    // Assuming DB stores 'HH:mm:ss' or 'HH:mm'
    // Let's broaden search slightly? or strict?
    // User asked for "10 min reminders". 
    // Let's format target time strictly HH:mm (e.g., 09:30)
    const timeStr = `${pad(targetTime.getHours())}:${pad(targetTime.getMinutes())}`; // '09:30' partial match
    
    // 3. Query Master Timetable
    // Need profiles joined for push_token
    const { data: classes, error } = await supabase
        .from('master_timetables')
        .select(`
            *,
            subject:subjects(name, code),
            faculty:profiles!master_timetables_faculty_id_fkey(push_token, full_name)
        `)
        .eq('day', dayName)
        .eq('is_active', true)
        .like('end_time', `${timeStr}%`); // Partial match for '09:30:00' (Checking END TIME now)

    if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!classes || classes.length === 0) {
        return new Response(JSON.stringify({ message: `No classes ending for ${dayName} at ${timeStr}` }), { status: 200 });
    }

    // 4. Send Notifications
    const accessToken = await getAccessToken(serviceAccount);
    const results = [];

    for (const cls of classes) {
        if (!cls.faculty?.push_token) continue;
        
        const subjectName = cls.subject?.name || 'Class';
        const room = cls.room || 'Location TBD';
        
        // Payload
        const payload = {
            message: {
                token: cls.faculty.push_token,
                notification: {
                    title: `Class Ending in 10 Minutes`,
                    body: `Time to take attendance for ${subjectName} (${cls.target_dept}-${cls.target_section}). Ends at ${cls.end_time}.`,
                },
                data: {
                    type: 'class_reminder',
                    categoryId: 'REMINDERS',
                    slotId: cls.id,
                    action: 'take_attendance'
                },
                android: {
                    priority: "high",
                    notification: {
                        channel_id: "reminders",
                        click_action: "REMINDERS"
                    }
                }
            }
        };

        const res = await fetch(FCM_V1_ENDPOINT, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
        results.push(await res.json());
    }

    return new Response(
        JSON.stringify({ success: true, processed: classes.length, results }),
        { status: 200, headers: { "Content-Type": "application/json" } }
    );
});
