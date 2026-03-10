# 🕒 Attend-Me: Automated Push Notifications Guide

This guide details the process of configuring automated execution for the **Attend-Me** push notification service.

Due to the limitations of the Supabase Free Tier (specifically the unavailability of the `pg_cron` extension), we utilize **cron-job.org**—a dependable, free-tier external scheduling service—to invoke our Supabase Edge Functions at precise 10-minute intervals.

---

## Prerequisites

Ensure the following conditions are met before proceeding:

- You have installed the Supabase CLI locally.
- You have linked your local environment to your remote Supabase project.
- Your `FIREBASE_SERVICE_ACCOUNT` secret is successfully configured in the Supabase Dashboard.

---

## Step 1: Deploy the Edge Function

First, you must deploy the edge function to your Supabase project.

1. Open your terminal at the root of the project repository.
2. Execute the following deployment command. We use the `--no-verify-jwt` flag to bypass native JWT verification, allowing our external cron service to trigger it using the standard `ANON` API key instead.

```bash
npx supabase functions deploy process-reminders --no-verify-jwt
```

3. Once the deployment succeeds, retrieve your function's URL from the **Supabase Dashboard**:
   - Navigate to your project -> **Edge Functions**.
   - Select `process-reminders` and copy the Endpoint URL.
   - _Format:_ `https://[PROJECT_ID].supabase.co/functions/v1/process-reminders`

---

## Step 2: Configure the External Scheduler

We will now authorize and configure the external cron service to securely invoke the endpoint.

1. Navigate to [cron-job.org](https://cron-job.org/en/) and authenticate or create a free account.
2. From the Console Dashboard, click **Create cron job**.
3. **General Configurations:**
   - **Title:** `Attend-Me: Class Reminders Job`
   - **URL:** Paste the Endpoint URL retrieved in Step 1.
4. **Execution Schedule:**
   - Select **User-defined**.
   - Input the cron expression: `*/10 * * * *` _(This ensures execution precisely every 10 minutes)._

---

## Step 3: Configure Authorization Headers

> [!IMPORTANT]
> Supabase Edge Functions inherently reject unauthenticated requests. You must provide your project's `ANON_KEY` to successfully bypass the gateway's 401 Unauthorized block.

1. Scroll down to the **Advanced Settings** section on cron-job.org.
2. Set the **Request Method** to `POST`.
3. In the **Headers** section, define the authorization payload:
   - **Header Name:** `Authorization`
   - **Header Value:** `Bearer YOUR_SUPABASE_ANON_KEY`
   - _(Note: You can retrieve your `ANON_KEY` from the Supabase Dashboard under **Project Settings -> API**)._
4. Leave the **Request Body** blank.
5. Click **Create** to finalize the job.

---

## Step 4: Verification & Troubleshooting

Your automated scheduling is now active. Every 10 minutes, the orchestrator will securely ping your edge function. The function will then parse the `master_timetables` and dispatch targeted FCM notifications to faculty members whose classes are concluding.

### Monitoring Execution Health

- **Cron-job.org Logs:** You can monitor the HTTP execution history directly in the cron-job.org dashboard. Look for `HTTP 200 OK` statuses.
- **Supabase Logs:** For deep debugging, navigate to the **Supabase Dashboard -> Edge Functions -> process-reminders -> Logs**. This tracks internal database reads and Firebase messaging outputs. If you observe `HTTP 500` errors, revisit your `FIREBASE_SERVICE_ACCOUNT` secret configuration.
