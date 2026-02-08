/**
 * Supabase Edge Function: send-push
 * 
 * Sends push notifications via Firebase Cloud Messaging (FCM) HTTP v1 API
 * Uses Service Account for OAuth 2.0 Authentication
 */

// Deno configured
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Minimal JWT implementation using Web Crypto API (No external deps if possible, but djwt is standard for Deno)
import { create } from "https://deno.land/x/djwt@v2.8/mod.ts";

const FCM_PROJECT_ID = "mrce-attend-me"; // Extracted from user's JSON
const FCM_V1_ENDPOINT = `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`;

interface ServiceAccount {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

interface PushRequest {
  token: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
  categoryId?: string;
}

// Generate OAuth 2.0 Access Token
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
  const privateKey = await importPrivateKey(key);

  const jwt = await create({ alg: "RS256", typ: "JWT" }, claim, privateKey);

  // Exchange JWT for Access Token
  const params = new URLSearchParams();
  params.append("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  params.append("assertion", jwt);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to get access token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

// Helper to import PEM private key
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const binaryDerString = window.atob(
    pem.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "")
  );
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    true,
    ["sign"]
  );
}

serve(async (req: Request) => {
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Get Service Account from Secret
    // @ts-ignore: Deno.env
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!serviceAccountJson) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT secret is missing");
    }

    let serviceAccount: ServiceAccount;
    try {
        serviceAccount = JSON.parse(serviceAccountJson);
    } catch (e) {
        throw new Error("Invalid JSON in FIREBASE_SERVICE_ACCOUNT secret");
    }

    // 2. Parse request body
    const { token, title, body, data, imageUrl, categoryId }: PushRequest = await req.json();

    if (!token || !title || !body) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Get Access Token
    const accessToken = await getAccessToken(serviceAccount);

    // 4. Build V1 Payload
    const payload = {
      message: {
        token: token,
        notification: {
          title: title,
          body: body,
        },
        data: {
          ...(data || {}),
          categoryId: categoryId || "", // Crucial for Expo actions
        },
        android: {
          priority: "high",
          notification: {
            channel_id: "requests",
            sound: "default",
            click_action: categoryId, // Valid for expo-notifications
          }
        }
      }
    };

    if (imageUrl) {
      // @ts-ignore: dynamic
      payload.message.android.notification.image = imageUrl;
    }

    // 5. Send to FCM V1
    const res = await fetch(FCM_V1_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await res.json();

    // V1 API returns the message name on success, error object on failure
    if (!res.ok) {
       console.error("FCM V1 Error:", result);
       return new Response(
        JSON.stringify({ success: false, error: result.error?.message || "FCM Send Failed" }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
    }

    return new Response(
      JSON.stringify({ success: true, messageId: result.name }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Edge Function Exception:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
