/**
 * NotificationContext - Manages notification state and push token lifecycle
 *
 * Responsibilities:
 * - Initialize NotificationService on app start
 * - Register/unregister push tokens on login/logout
 * - Track unread notification count
 * - Handle notification responses (deep linking, actions)
 * - Subscribe to realtime notification updates
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
  useCallback,
} from "react";
import { InteractionManager } from "react-native";
import * as Notifications from "expo-notifications";
import { supabase } from "../config/supabase";
import { withTimeout } from '../utils/withTimeout';
import { useAuth } from "./AuthContext";
import {
  NotificationService,
  PushTokenData,
} from "../services/NotificationService";
import { NotificationRepository } from "../services/NotificationRepository";
import { navigate, navigateNested } from "../navigation/navigationRef";
import createLogger from "../utils/logger";

const log = createLogger("Notifications");

// ============================================================================
// TYPES
// ============================================================================

interface NotificationContextData {
  // State
  unreadCount: number;
  pushToken: PushTokenData | null;
  isInitialized: boolean;

  // Actions
  refreshNotifications: () => Promise<void>;
  respondToSubstituteRequest: (
    requestId: string,
    action: "accept" | "decline",
  ) => Promise<{
    success: boolean;
    message: string;
    type: "success" | "error" | "warning" | "info";
  }>;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  markNotificationsAsRead: (notificationIds: string[]) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

// ============================================================================
// CONTEXT
// ============================================================================

const NotificationContext = createContext<NotificationContextData>(
  {} as NotificationContextData,
);

// ============================================================================
// PROVIDER
// ============================================================================

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();

  // State
  const [unreadCount, setUnreadCount] = useState(0);
  const [pushToken, setPushToken] = useState<PushTokenData | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Refs for listeners
  const notificationListenerRef = useRef<Notifications.Subscription | null>(
    null,
  );
  const responseListenerRef = useRef<Notifications.Subscription | null>(null);
  const realtimeChannelRef = useRef<any>(null);

  // --------------------------------------------------------------------------
  // INITIALIZATION
  // --------------------------------------------------------------------------

  useEffect(() => {
    // Defer init so it doesn't compete with the first render frame
    const timer = setTimeout(async () => {
      await NotificationService.init();
      setIsInitialized(true);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // --------------------------------------------------------------------------
  // USER SESSION HANDLING
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!user || !isInitialized) return;

    // Stagger all notification work so the UI stays responsive
    const task = InteractionManager.runAfterInteractions(() => {
      registerPushToken();
      fetchUnreadCount();
      setupNotificationListeners();
      setupRealtimeSubscription();

      // Cleanup old notifications — low priority, delay further
      setTimeout(() => NotificationService.cleanupOldNotifications(), 3000);
    });

    return () => {
      task.cancel();
      notificationListenerRef.current?.remove();
      responseListenerRef.current?.remove();
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
    };
  }, [user, isInitialized]);

  // --------------------------------------------------------------------------
  // PUSH TOKEN REGISTRATION
  // --------------------------------------------------------------------------

  const registerPushToken = async () => {
    if (!user) return;

    const tokenData = await NotificationService.registerForPushNotifications();

    if (tokenData) {
      setPushToken(tokenData);
      await NotificationService.saveTokenToDatabase(user.id, tokenData);
    }
  };

  // --------------------------------------------------------------------------
  // NOTIFICATION LISTENERS
  // --------------------------------------------------------------------------

  const setupNotificationListeners = () => {
    // Foreground notification received
    notificationListenerRef.current =
      Notifications.addNotificationReceivedListener((notification) => {
        const title = notification.request.content.title;
        const data = notification.request.content.data;
        log.debug("Foreground notification:", title, data);

        // Update badge count
        setUnreadCount((prev) => prev + 1);

        // Specific handling for Management Announcements (FCM)
        if (
          data?.type === "announcement" ||
          data?.categoryId === "ANNOUNCEMENT"
        ) {
          // Show a prominent toast/alert in-app
          // We use a custom event or context exposure to show this,
          // but for now we'll rely on the system banner (configured in NotificationService)
          // If we wanted a modal, we'd set state here.
        }

        // Refresh lists if it's a request/swap/leave
        if (
          data?.type === "request" ||
          data?.type === "swap" ||
          data?.type === "leave"
        ) {
          fetchUnreadCount();
        }
      });

    // User interacted with notification (tap or action button)
    responseListenerRef.current =
      Notifications.addNotificationResponseReceivedListener(
        async (response) => {
          await handleNotificationResponse(response);
        },
      );
  };

  // --------------------------------------------------------------------------
  // NOTIFICATION RESPONSE HANDLING
  // --------------------------------------------------------------------------

  const handleNotificationResponse = async (
    response: Notifications.NotificationResponse,
  ) => {
    const actionId = response.actionIdentifier;
    const data = response.notification.request.content.data as Record<
      string,
      any
    >;

    // ─── STALENESS GUARD ───────────────────────────────────────────────
    // When the app resumes from background, Android/iOS replays the LAST
    // notification response through this listener even if the user did NOT
    // tap a notification. We detect this by checking if the notification
    // was delivered more than 5 seconds ago — a genuine tap happens
    // within milliseconds of showing the notification.
    const notificationDate = response.notification.date;
    const nowMs = Date.now();
    const ageMs = nowMs - notificationDate;
    
    if (ageMs > 5000) {
      log.debug('Ignoring stale notification response (age:', Math.round(ageMs / 1000), 's). This is a background resume, not a user tap.');
      return; // ← Skip navigation entirely
    }
    // ────────────────────────────────────────────────────────────────────

    log.debug("Response:", { actionId, data });

    // Handle interactive button actions
    switch (actionId) {
      case "ACCEPT":
        // The data payload from push might be nested or direct depending on how backend sent it
        // We'll check data.requestId or data.body.requestId
        const requestId = data.requestId || (data.body && data.body.requestId);

        if (requestId) {
          log.info("Processing ACCEPT action for:", requestId);
          // Optimistic feedback
          const result = await respondToSubstituteRequest(requestId, "accept");

          // Show feedback even if app was backgrounded (will show when foregrounded)
          if (result.success) {
            await NotificationService.showLocalNotification({
              title: "Success",
              body: result.message,
              categoryId: "simple",
            });
          } else {
            await NotificationService.showLocalNotification({
              title: "Action Failed",
              body: result.message,
              categoryId: "simple",
            });
          }
        } else {
          log.warn("Missing requestId in push payload", data);
        }
        break;

      case "DECLINE":
        const reqId = data.requestId || (data.body && data.body.requestId);
        if (reqId) {
          await respondToSubstituteRequest(reqId, "decline");
          await NotificationService.showLocalNotification({
            title: "Declined",
            body: "Request declined",
            categoryId: "simple",
          });
        }
        break;

      case "SNOOZE":
        // Re-schedule reminder for 5 minutes
        await NotificationService.scheduleNotification({
          title: response.notification.request.content.title || "Reminder",
          body: response.notification.request.content.body || "",
          triggerDate: new Date(Date.now() + 5 * 60 * 1000),
          data,
        });
        break;

      case "OPEN":
      case Notifications.DEFAULT_ACTION_IDENTIFIER:
        // Navigate based on notification type
        handleDeepLink(data);
        break;
    }
  };

  // --------------------------------------------------------------------------
  // DEEP LINKING
  // --------------------------------------------------------------------------

  const handleDeepLink = (data: Record<string, any>) => {
    const type = data.type;

    switch (type) {
      case "SUB_REQUEST":
      case "SWAP_REQUEST":
        navigate("Notifications");
        break;

      case "CLASS_REMINDER":
        navigateNested("MainTabs", "Home");
        break;

      case "ATTENDANCE_ALERT":
        navigate("MyClassHub");
        break;

      default:
        // Default: open notifications screen
        navigate("Notifications");
    }
  };

  // --------------------------------------------------------------------------
  // REALTIME SUBSCRIPTION
  // --------------------------------------------------------------------------

  const setupRealtimeSubscription = () => {
    if (!user) return;

    realtimeChannelRef.current = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          log.debug("New notification:", payload.new);
          setUnreadCount((prev) => prev + 1);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Refresh count when notifications are updated (marked as read)
          fetchUnreadCount();
        },
      )
      .subscribe();
  };

  // --------------------------------------------------------------------------
  // UNREAD COUNT
  // --------------------------------------------------------------------------

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;

    const { count, error } = await withTimeout(
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false),
      10000,
      'fetchUnreadCount',
    );

    if (!error && count !== null) {
      setUnreadCount(count);
      NotificationService.setBadgeCount(count);
    }
  }, [user]);

  // --------------------------------------------------------------------------
  // MARK AS READ
  // --------------------------------------------------------------------------

  const markNotificationAsRead = async (notificationId: string) => {
    await withTimeout(
      supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId),
      10000,
      'markNotificationAsRead',
    );

    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markNotificationsAsRead = async (notificationIds: string[]) => {
    try {
      // Local update
      await NotificationRepository.markMultipleAsRead(notificationIds);

      // Server update (fire and forget)
      const userId = user?.id;
      const validIds = notificationIds.filter(
        (id) => id && typeof id === "string" && id.trim().length > 0,
      );

      if (userId && validIds.length > 0) {
        supabase
          .from("notifications")
          .update({ is_read: true })
          .in("id", validIds)
          .then(({ error }) => {
            if (error)
              log.error(
                "Failed to batch mark notifications read on server",
                error,
              );
          });
      }

      // Update state locally
      fetchUnreadCount();
    } catch (error) {
      log.error("Error batch marking notifications as read", error);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    await withTimeout(
      supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false),
      10000,
      'markAllAsRead',
    );

    setUnreadCount(0);
    NotificationService.clearBadge();
  };

  // --------------------------------------------------------------------------
  // SUBSTITUTE REQUEST RESPONSE
  // --------------------------------------------------------------------------

  const respondToSubstituteRequest = async (
    requestId: string,
    action: "accept" | "decline",
  ): Promise<{
    success: boolean;
    message: string;
    type: "success" | "error" | "warning" | "info";
  }> => {
    let currentUser = user;
    if (!currentUser) {
      // Need to explicitly fetch session since this might be called from background with no active context
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        currentUser = session.user as any;
      }
    }

    if (!currentUser)
      return { success: false, message: "Not authenticated", type: "error" };

    try {
      // 1. Fetch request details
      const { data: request, error: fetchError } = await withTimeout(
        supabase
          .from("substitutions")
          .select("status, original_faculty_id, slot_id")
          .eq("id", requestId)
          .single(),
        10000,
        'respondToSub:fetchRequest',
      );

      if (fetchError || !request) {
        return { success: false, message: "Request not found", type: "error" };
      }

      // 2. Get sender's push token
      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("push_token")
        .eq("id", request.original_faculty_id)
        .single();

      // 3. Get current user's name
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", currentUser.id)
        .single();
      const myName = profile?.full_name || "A faculty";

      const slotLabel = request.slot_id?.split("_")[1] || "class";

      if (action === "accept") {
        // Check if already taken
        if (request.status === "accepted") {
          return {
            success: false,
            message: "Too late! Someone else took this class.",
            type: "warning",
          };
        }
        if (request.status !== "pending") {
          return {
            success: false,
            message: `Request is ${request.status}`,
            type: "warning",
          };
        }

        // Update request
        const { error: updateError } = await supabase
          .from("substitutions")
          .update({
            status: "accepted",
            substitute_faculty_id: currentUser.id,
            accepted_at: new Date().toISOString(),
          })
          .eq("id", requestId)
          .eq("status", "pending");

        if (updateError) throw updateError;

        // Create in-app notification for sender
        await supabase.from("notifications").insert({
          user_id: request.original_faculty_id,
          type: "info",
          title: "Request Accepted ✅",
          body: `${myName} accepted your request for ${slotLabel}.`,
          is_read: false,
        });

        // Send push notification
        if (senderProfile?.push_token) {
          await NotificationService.sendPushNotification(
            senderProfile.push_token,
            "Request Accepted ✅",
            `${myName} accepted your request for ${slotLabel}.`,
            { type: "SUB_RESPONSE", requestId },
          );
        }

        await fetchUnreadCount();
        return {
          success: true,
          message: "You have accepted the class!",
          type: "success",
        };
      } else {
        // Decline
        const { error: declineError } = await supabase
          .from("substitutions")
          .update({ status: "declined" })
          .eq("id", requestId);

        if (declineError) throw declineError;

        // Create in-app notification for sender
        await supabase.from("notifications").insert({
          user_id: request.original_faculty_id,
          type: "info",
          title: "Request Declined",
          body: `${myName} declined your request for ${slotLabel}.`,
          is_read: false,
        });

        // Send push notification
        if (senderProfile?.push_token) {
          await NotificationService.sendPushNotification(
            senderProfile.push_token,
            "Request Declined",
            `${myName} declined your request for ${slotLabel}.`,
            { type: "SUB_RESPONSE", requestId },
          );
        }

        await fetchUnreadCount();
        return { success: true, message: "Request declined", type: "info" };
      }
    } catch (error: any) {
      log.error("Error responding to request:", error);
      return {
        success: false,
        message: error.message || "An error occurred",
        type: "error",
      };
    }
  };

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        pushToken,
        isInitialized,
        refreshNotifications: fetchUnreadCount,
        respondToSubstituteRequest,
        markNotificationAsRead,
        markNotificationsAsRead,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

// ============================================================================
// HOOK
// ============================================================================

export const useNotifications = () => useContext(NotificationContext);
