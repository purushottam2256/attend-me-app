/**
 * Supabase Edge Function: send-push
 * 
 * Sends push notifications via Firebase Cloud Messaging (FCM)
 * 
 * Deploy:
 * 1. Go to Supabase Dashboard > Edge Functions
 * 2. Click "Create new function"
 * 3. Name it "send-push"
 * 4. Paste this code
 * 5. Add FCM_SERVER_KEY to Edge Function Secrets
 * 
 * Get FCM_SERVER_KEY from:
 * Firebase Console > Project Settings > Cloud Messaging > Server key
 */

// @ts-ignore: Deno types
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const FCM_ENDPOINT = "https://fcm.googleapis.com/fcm/send";

interface PushRequest {
  token: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
}

interface FCMPayload {
  to: string;
  notification: {
    title: string;
    body: string;
    image?: string;
    sound?: string;
    click_action?: string;
  };
  data?: Record<string, any>;
  priority: string;
  android?: {
    priority: string;
    notification?: {
      channel_id: string;
      sound?: string;
    };
  };
}

serve(async (req: Request) => {
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get FCM Server Key from environment
    // @ts-ignore: Deno.env
    const FCM_SERVER_KEY = Deno.env.get("FCM_SERVER_KEY");
    
    if (!FCM_SERVER_KEY) {
      throw new Error("FCM_SERVER_KEY not configured");
    }

    // Parse request body
    const { token, title, body, data, imageUrl }: PushRequest = await req.json();

    if (!token || !title || !body) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: token, title, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build FCM payload
    const fcmPayload: FCMPayload = {
      to: token,
      notification: {
        title,
        body,
        sound: "default",
        click_action: "FLUTTER_NOTIFICATION_CLICK", // Works for RN too
      },
      data: data || {},
      priority: "high",
      android: {
        priority: "high",
        notification: {
          channel_id: "requests", // Match the channel in NotificationService
          sound: "default",
        },
      },
    };

    if (imageUrl) {
      fcmPayload.notification.image = imageUrl;
    }

    // Send to FCM
    const response = await fetch(FCM_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `key=${FCM_SERVER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fcmPayload),
    });

    const result = await response.json();

    // Log for debugging
    console.log("FCM Response:", result);

    // Check for errors
    if (result.failure > 0) {
      const errorResult = result.results?.[0];
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorResult?.error || "FCM delivery failed",
          messageId: result.multicast_id,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: result.multicast_id,
        result: result.results?.[0],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Edge Function Error:", error);
    
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
