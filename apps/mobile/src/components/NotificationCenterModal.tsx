import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import {
  CalendarEvent,
  formatFriendlyDate,
  formatTime12Hour,
  getDaysDifference,
  EVENT_TYPE_CONFIG,
  subscribeCollegeAnnouncements,
  subscribeUserPrivateNotifications,
  markNotificationAsRead,
  InAppNotification,
} from '@eventpulse/shared';
import { colors, radii, shadows } from '../theme/tokens';
import { FeedbackItem } from './AdminFeedbackModal';

const STORAGE_KEY_DISMISSED = '@vanko_dismissed_alerts_v1';
const WORKER_BASE_URL =
  process.env.EXPO_PUBLIC_WORKER_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  'https://vanko-api.vanko-app.workers.dev';

export type AlertSeverity = 'urgent' | 'warning' | 'info' | 'danger';
export type AlertCategory = 'all' | 'announcements' | 'urgent' | 'deadlines' | 'events' | 'clashes' | 'messages';

export interface ComputedAlert {
  id: string; // unique key e.g. `${eventId}_deadline_2h_${dateStr}`
  eventId: string;
  title: string;
  headline: string;
  body: string;
  timeDisplay: string;
  severity: AlertSeverity;
  category: 'announcements' | 'deadlines' | 'events' | 'clashes';
  icon: string;
  iconColor: string;
  iconBg: string;
  timestampSort: number; // ms for sorting
  isUrgent: boolean;
  isAnnouncement?: boolean;
  isAdminFeedback?: boolean;
  type?: string;
}

interface NotificationCenterModalProps {
  visible: boolean;
  onClose: () => void;
  events: CalendarEvent[];
  clashes?: any[];
  onUnreadCountChange?: (count: number) => void;
  onOpenAdminFeedback?: () => void;
  onOpenUserFeedback?: () => void;
}

/**
 * Parses event time string ("6:00 PM", "18:00") into hour/minute numbers
 */
function parseEventTime(timeStr?: string | null, defaultH = 9, defaultM = 0): { hours: number; minutes: number } {
  if (!timeStr) return { hours: defaultH, minutes: defaultM };
  const trimmed = timeStr.trim();
  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = parseInt(match12[2], 10);
    const isPm = match12[3].toLowerCase() === 'pm';
    if (isPm && h < 12) h += 12;
    if (!isPm && h === 12) h = 0;
    return { hours: h, minutes: m };
  }
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return { hours: parseInt(match24[1], 10), minutes: parseInt(match24[2], 10) };
  }
  return { hours: defaultH, minutes: defaultM };
}

/**
 * Creates full Date object from YYYY-MM-DD + time
 */
function getEventDateTime(dateStr: string, timeStr?: string | null, defaultH = 9): Date {
  const { hours, minutes } = parseEventTime(timeStr, defaultH, 0);
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, hours, minutes, 0, 0);
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  visible,
  onClose,
  events,
  clashes = [],
  onUnreadCountChange,
  onOpenAdminFeedback,
  onOpenUserFeedback,
}) => {
  const router = useRouter();
  const { user, isAdmin, getIdToken } = useAuth();
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<AlertCategory>('all');
  const [collegeAnnouncements, setCollegeAnnouncements] = useState<InAppNotification[]>([]);
  const [userNotifications, setUserNotifications] = useState<InAppNotification[]>([]);
  const [adminFeedbacks, setAdminFeedbacks] = useState<FeedbackItem[]>([]);

  // Load dismissed alert IDs from persistent storage
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_DISMISSED)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) setDismissedIds(parsed);
          } catch { }
        }
      })
      .catch(() => { });
  }, []);

  // Real-time Firestore subscriptions for campus announcements and private reminders
  useEffect(() => {
    const unsubAnnouncements = subscribeCollegeAnnouncements(
      'SIES_GST',
      (items) => {
        setCollegeAnnouncements(items);
      },
      () => {
        // Safe fallback on subscription error
      }
    );

    let unsubUserNotifs: (() => void) | undefined;
    if (user?.uid) {
      unsubUserNotifs = subscribeUserPrivateNotifications(
        user.uid,
        (items) => {
          setUserNotifications(items);
        },
        () => {
          // Safe fallback
        }
      );
    }

    return () => {
      unsubAnnouncements();
      if (unsubUserNotifs) unsubUserNotifs();
    };
  }, [user?.uid]);

  // Periodic & visibility-triggered fetch for Admin Feedback Messages
  useEffect(() => {
    if (!isAdmin) return;

    let isMounted = true;
    const fetchAdminFeedbacks = async () => {
      try {
        const idToken = await getIdToken();
        if (!idToken) return;
        const res = await fetch(`${WORKER_BASE_URL}/api/admin/feedback`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok && isMounted) {
          const data = (await res.json()) as any;
          setAdminFeedbacks(data.feedback || []);
        }
      } catch {
        // Safe fallback
      }
    };

    fetchAdminFeedbacks();
    const interval = setInterval(fetchAdminFeedbacks, 45000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAdmin, getIdToken, visible]);

  // Compute live intelligent alerts based on real dates and times
  const allAlerts = useMemo<ComputedAlert[]>(() => {
    const now = new Date();
    const nowMs = now.getTime();
    const list: ComputedAlert[] = [];

    // 0. SIES GST Campus Announcements & Admin Broadcasts
    collegeAnnouncements.forEach((ann) => {
      const createdMs = ann.createdAt ? new Date(ann.createdAt).getTime() : nowMs;
      const diffMs = nowMs - createdMs;
      const diffMins = Math.max(0, Math.floor(diffMs / (1000 * 60)));
      const diffHours = Math.floor(diffMins / 60);
      let timeDisplay = 'Just now';
      if (diffMins < 1) {
        timeDisplay = 'Just now';
      } else if (diffMins < 60) {
        timeDisplay = `${diffMins}m ago`;
      } else if (diffHours < 24) {
        timeDisplay = `${diffHours}h ago`;
      } else {
        timeDisplay = formatFriendlyDate(ann.createdAt.slice(0, 10), false);
      }

      list.push({
        id: ann.id,
        eventId: ann.eventId || '',
        title: ann.title,
        headline: 'Campus Announcement',
        body: ann.message,
        timeDisplay,
        severity: 'info',
        category: 'announcements',
        icon: 'megaphone',
        iconColor: '#4F46E5',
        iconBg: '#EEF2FF',
        timestampSort: createdMs,
        isUrgent: false,
        isAnnouncement: true,
      });
    });

    // 0b. Targeted Event Reminders & Developer Responses for User
    userNotifications.forEach((notif) => {
      const createdMs = notif.createdAt ? new Date(notif.createdAt).getTime() : nowMs;
      const diffMs = nowMs - createdMs;
      const diffMins = Math.max(0, Math.floor(diffMs / (1000 * 60)));
      const diffHours = Math.floor(diffMins / 60);
      let timeDisplay = 'Just now';
      if (diffMins < 1) {
        timeDisplay = 'Just now';
      } else if (diffMins < 60) {
        timeDisplay = `${diffMins}m ago`;
      } else if (diffHours < 24) {
        timeDisplay = `${diffHours}h ago`;
      } else {
        timeDisplay = formatFriendlyDate(notif.createdAt.slice(0, 10), false);
      }

      const isAdminReply = notif.type === 'admin_reply';

      list.push({
        id: notif.id,
        eventId: notif.eventId || '',
        title: notif.title || (isAdminReply ? 'Response to your feedback' : 'Event Reminder'),
        headline: isAdminReply ? 'Developer Response' : 'Event Reminder',
        body: notif.message,
        timeDisplay,
        severity: isAdminReply ? 'info' : 'urgent',
        category: 'announcements',
        icon: isAdminReply ? 'chatbubble-ellipses' : 'notifications',
        iconColor: isAdminReply ? '#6366F1' : '#EA580C',
        iconBg: isAdminReply ? '#EEF2FF' : '#FFEDD5',
        timestampSort: createdMs,
        isUrgent: true,
        isAnnouncement: true,
        type: notif.type,
      });
    });

    // 0c. Admin Inbound User Feedback / Messages (Admin-Only)
    if (isAdmin && adminFeedbacks.length > 0) {
      const pendingFeedbacks = adminFeedbacks.filter((f) => !f.adminReply);
      pendingFeedbacks.forEach((fb) => {
        const createdMs = fb.createdAt ? new Date(fb.createdAt).getTime() : nowMs;
        const diffMs = nowMs - createdMs;
        const diffMins = Math.max(0, Math.floor(diffMs / (1000 * 60)));
        const diffHours = Math.floor(diffMins / 60);
        let timeDisplay = 'Just now';
        if (diffMins < 1) {
          timeDisplay = 'Just now';
        } else if (diffMins < 60) {
          timeDisplay = `${diffMins}m ago`;
        } else if (diffHours < 24) {
          timeDisplay = `${diffHours}h ago`;
        } else if (fb.createdAt) {
          timeDisplay = formatFriendlyDate(fb.createdAt.slice(0, 10), false);
        } else {
          timeDisplay = 'Recently';
        }

        const senderName =
          fb.email && fb.email !== 'anonymous'
            ? fb.email.split('@')[0]
            : 'Student';
        const categoryLabel =
          fb.category === 'bug'
            ? 'Bug Report'
            : fb.category === 'suggestion'
            ? 'Suggestion'
            : fb.category === 'complaint'
            ? 'Complaint'
            : 'Message';

        list.push({
          id: `admin_fb_${fb.id}`,
          eventId: '',
          title: `${categoryLabel} from ${senderName}`,
          headline: 'User Message / Report',
          body: fb.message,
          timeDisplay,
          severity: fb.category === 'bug' ? 'danger' : 'urgent',
          category: 'announcements',
          icon:
            fb.category === 'bug'
              ? 'bug'
              : fb.category === 'complaint'
              ? 'alert-circle'
              : 'chatbubbles',
          iconColor: fb.category === 'bug' ? '#DC2626' : '#6366F1',
          iconBg: fb.category === 'bug' ? '#FEF2F2' : '#EEF2FF',
          timestampSort: createdMs,
          isUrgent: true,
          isAnnouncement: true,
          isAdminFeedback: true,
        });
      });
    }

    events.forEach((item) => {
      if (item.status === 'skipped') return;

      // 1. Registration Deadlines (2h, 12h, 24h, 48h, and missed in last 24h)
      if (item.registration_deadline) {
        const targetDate = getEventDateTime(item.registration_deadline, item.time, 23); // default to 11 PM
        const diffMs = targetDate.getTime() - nowMs;
        const diffHours = diffMs / (1000 * 60 * 60);
        const timeFormatted = item.time ? formatTime12Hour(item.time) : '11:59 PM';

        // (a) Urgent: Deadline in <= 2 Hours
        if (diffHours > 0 && diffHours <= 2) {
          const mins = Math.max(1, Math.round(diffMs / (1000 * 60)));
          list.push({
            id: `${item.id}_dl_2h_${item.registration_deadline}`,
            eventId: item.id,
            title: item.title,
            headline: `Registration Closes in ${mins} Mins!`,
            body: `Urgent final call: Registration deadline is at ${timeFormatted}.`,
            timeDisplay: `${mins}m left`,
            severity: 'danger',
            category: 'deadlines',
            icon: 'alarm',
            iconColor: '#DC2626',
            iconBg: '#FEE2E2',
            timestampSort: targetDate.getTime(),
            isUrgent: true,
          });
        }
        // (b) Deadline in <= 12 Hours
        else if (diffHours > 2 && diffHours <= 12) {
          const hrs = Math.round(diffHours);
          list.push({
            id: `${item.id}_dl_12h_${item.registration_deadline}`,
            eventId: item.id,
            title: item.title,
            headline: `Deadline in ~${hrs} Hours`,
            body: `Registration closes today at ${timeFormatted}. Don't miss out.`,
            timeDisplay: `In ${hrs}h`,
            severity: 'urgent',
            category: 'deadlines',
            icon: 'alarm-outline',
            iconColor: '#EA580C',
            iconBg: '#FFEDD5',
            timestampSort: targetDate.getTime(),
            isUrgent: true,
          });
        }
        // (c) Deadline in <= 24 Hours (Tomorrow)
        else if (diffHours > 12 && diffHours <= 24) {
          list.push({
            id: `${item.id}_dl_24h_${item.registration_deadline}`,
            eventId: item.id,
            title: item.title,
            headline: 'Registration Closes Tomorrow',
            body: `Deadline is tomorrow (${formatFriendlyDate(item.registration_deadline, false)}) at ${timeFormatted}.`,
            timeDisplay: 'Tomorrow',
            severity: 'warning',
            category: 'deadlines',
            icon: 'alarm-outline',
            iconColor: '#D97706',
            iconBg: '#FEF3C7',
            timestampSort: targetDate.getTime(),
            isUrgent: false,
          });
        }
        // (d) Deadline in 24h - 48h
        else if (diffHours > 24 && diffHours <= 48) {
          list.push({
            id: `${item.id}_dl_48h_${item.registration_deadline}`,
            eventId: item.id,
            title: item.title,
            headline: 'Registration Closing Soon',
            body: `Deadline on ${formatFriendlyDate(item.registration_deadline, false)} at ${timeFormatted}.`,
            timeDisplay: 'In 2 days',
            severity: 'info',
            category: 'deadlines',
            icon: 'calendar-outline',
            iconColor: '#4F46E5',
            iconBg: '#EEF2FF',
            timestampSort: targetDate.getTime(),
            isUrgent: false,
          });
        }
        // (e) Missed deadline within the last 24 hours
        else if (diffHours < 0 && diffHours >= -24) {
          list.push({
            id: `${item.id}_dl_missed_${item.registration_deadline}`,
            eventId: item.id,
            title: item.title,
            headline: 'Registration Closed',
            body: `The registration deadline passed on ${formatFriendlyDate(item.registration_deadline, false)}.`,
            timeDisplay: 'Closed',
            severity: 'warning',
            category: 'deadlines',
            icon: 'alert-circle-outline',
            iconColor: '#64748B',
            iconBg: '#F1F5F9',
            timestampSort: targetDate.getTime(),
            isUrgent: false,
          });
        }
      }

      // 2. Event Start Dates (2h, 12h, 24h, today)
      if (item.event_start_date) {
        const targetDate = getEventDateTime(item.event_start_date, item.time, 9); // default 9 AM
        const diffMs = targetDate.getTime() - nowMs;
        const diffHours = diffMs / (1000 * 60 * 60);
        const timeFormatted = item.time ? formatTime12Hour(item.time) : '9:00 AM';

        // (a) Starting in <= 2 Hours
        if (diffHours > 0 && diffHours <= 2) {
          const mins = Math.max(1, Math.round(diffMs / (1000 * 60)));
          list.push({
            id: `${item.id}_ev_2h_${item.event_start_date}`,
            eventId: item.id,
            title: item.title,
            headline: `Starting in ~${mins} Mins!`,
            body: `Event starts at ${timeFormatted}. Prepare your setup and link.`,
            timeDisplay: `${mins}m`,
            severity: 'urgent',
            category: 'events',
            icon: 'flash-outline',
            iconColor: '#7C3AED',
            iconBg: '#F3E8FF',
            timestampSort: targetDate.getTime(),
            isUrgent: true,
          });
        }
        // (b) Starting Today (<= 12 Hours)
        else if (diffHours > 2 && diffHours <= 14) {
          list.push({
            id: `${item.id}_ev_today_${item.event_start_date}`,
            eventId: item.id,
            title: item.title,
            headline: 'Event Starts Today',
            body: `Schedule kickoff at ${timeFormatted}. Mode: ${item.mode.toUpperCase()}.`,
            timeDisplay: 'Today',
            severity: 'info',
            category: 'events',
            icon: 'calendar',
            iconColor: '#2563EB',
            iconBg: '#DBEAFE',
            timestampSort: targetDate.getTime(),
            isUrgent: false,
          });
        }
        // (c) Starting Tomorrow
        else if (diffHours > 14 && diffHours <= 36) {
          list.push({
            id: `${item.id}_ev_tomorrow_${item.event_start_date}`,
            eventId: item.id,
            title: item.title,
            headline: 'Event Tomorrow',
            body: `Starts tomorrow (${formatFriendlyDate(item.event_start_date, false)}) at ${timeFormatted}.`,
            timeDisplay: 'Tomorrow',
            severity: 'info',
            category: 'events',
            icon: 'sparkles-outline',
            iconColor: '#059669',
            iconBg: '#D1FAE5',
            timestampSort: targetDate.getTime(),
            isUrgent: false,
          });
        }
      }
    });

    // 3. Clashes & Conflicts
    clashes.forEach((clashGroup: any, idx: number) => {
      const clashEvents = clashGroup.events || [];
      if (clashEvents.length >= 2) {
        const title1 = clashEvents[0]?.title || 'Event 1';
        const title2 = clashEvents[1]?.title || 'Event 2';
        list.push({
          id: `clash_${clashGroup.date || idx}`,
          eventId: clashEvents[0]?.id || '',
          title: `${title1} ⚡ ${title2}`,
          headline: 'Schedule Conflict Detected',
          body: `Overlapping schedule on ${formatFriendlyDate(clashGroup.date || '')}.`,
          timeDisplay: 'Conflict',
          severity: 'danger',
          category: 'clashes',
          icon: 'warning',
          iconColor: '#E11D48',
          iconBg: '#FFE4E6',
          timestampSort: nowMs,
          isUrgent: true,
        });
      }
    });

    // Sort intelligently: urgent alerts on top, followed by fresh announcements (newest first), then upcoming deadlines/events
    return list.sort((a, b) => {
      if (a.isUrgent !== b.isUrgent) {
        return a.isUrgent ? -1 : 1;
      }
      if (a.isAnnouncement && b.isAnnouncement) {
        return b.timestampSort - a.timestampSort;
      }
      if (a.isAnnouncement && !b.isUrgent) return -1;
      if (b.isAnnouncement && !a.isUrgent) return 1;
      return a.timestampSort - b.timestampSort;
    });
  }, [events, clashes, collegeAnnouncements, userNotifications, adminFeedbacks, isAdmin]);

  // Active un-dismissed alerts
  const activeAlerts = useMemo(() => {
    return allAlerts.filter((a) => !dismissedIds.includes(a.id));
  }, [allAlerts, dismissedIds]);

  // Count active announcements
  const announcementsCount = useMemo(() => {
    return activeAlerts.filter((a) => a.category === 'announcements').length;
  }, [activeAlerts]);

  // Notify parent of active unread count
  useEffect(() => {
    if (onUnreadCountChange) {
      onUnreadCountChange(activeAlerts.length);
    }
  }, [activeAlerts.length, onUnreadCountChange]);

  // Count active messages
  const messagesCount = useMemo(() => {
    return activeAlerts.filter((a) => a.isAdminFeedback || a.type === 'admin_reply').length;
  }, [activeAlerts]);

  // Filtered list according to tab
  const filteredAlerts = useMemo(() => {
    if (activeFilter === 'all') return activeAlerts;
    if (activeFilter === 'announcements') return activeAlerts.filter((a) => a.category === 'announcements');
    if (activeFilter === 'messages') return activeAlerts.filter((a) => a.isAdminFeedback || a.type === 'admin_reply');
    if (activeFilter === 'urgent') return activeAlerts.filter((a) => a.isUrgent);
    if (activeFilter === 'deadlines') return activeAlerts.filter((a) => a.category === 'deadlines');
    if (activeFilter === 'events') return activeAlerts.filter((a) => a.category === 'events');
    if (activeFilter === 'clashes') return activeAlerts.filter((a) => a.category === 'clashes');
    return activeAlerts;
  }, [activeAlerts, activeFilter]);

  // Dismiss single alert
  const handleDismissSingle = async (alertId: string) => {
    const updated = [...dismissedIds, alertId];
    setDismissedIds(updated);
    if (user?.uid) {
      markNotificationAsRead(user.uid, alertId).catch(() => {});
    }
    try {
      await AsyncStorage.setItem(STORAGE_KEY_DISMISSED, JSON.stringify(updated));
    } catch { }
  };

  // Clear all alerts
  const handleClearAll = async () => {
    const allIds = allAlerts.map((a) => a.id);
    const merged = Array.from(new Set([...dismissedIds, ...allIds]));
    setDismissedIds(merged);
    if (user?.uid) {
      userNotifications.forEach((n) => markNotificationAsRead(user.uid, n.id).catch(() => {}));
    }
    try {
      await AsyncStorage.setItem(STORAGE_KEY_DISMISSED, JSON.stringify(merged));
    } catch { }
  };

  const handleNavigate = (alert: ComputedAlert) => {
    onClose();
    if (user?.uid && alert.id && !alert.isAdminFeedback) {
      markNotificationAsRead(user.uid, alert.id).catch(() => {});
    }

    if (alert.isAdminFeedback && onOpenAdminFeedback) {
      setTimeout(() => {
        onOpenAdminFeedback();
      }, 150);
      return;
    }

    if (alert.type === 'admin_reply' && onOpenUserFeedback) {
      setTimeout(() => {
        onOpenUserFeedback();
      }, 150);
      return;
    }

    if (alert.eventId) {
      const isPersonal = events.some((e) => e.id === alert.eventId);
      if (isPersonal) {
        router.push(`/event/${alert.eventId}`);
      } else {
        router.push('/(auth)/college' as any);
      }
    } else {
      router.push('/(auth)/college' as any);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalCard}>
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <View style={styles.bellIconWrap}>
                    <Ionicons name="notifications-outline" size={18} color={colors.textPrimary} />
                    {activeAlerts.length > 0 && <View style={styles.bellDot} />}
                  </View>
                  <View>
                    <Text style={styles.headerTitle}>Notifications</Text>
                    <Text style={styles.headerSubtitle}>
                      {activeAlerts.length === 0
                        ? 'All caught up'
                        : `${activeAlerts.length} active alert${activeAlerts.length > 1 ? 's' : ''}`}
                    </Text>
                  </View>
                </View>

                <View style={styles.headerRight}>
                  {activeAlerts.length > 0 && (
                    <TouchableOpacity
                      style={styles.clearAllBtn}
                      onPress={handleClearAll}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={13} color={colors.textSecondary} />
                      <Text style={styles.clearAllText}>Clear All</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.closeBtn}
                    onPress={onClose}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Filter Chips Bar */}
              {activeAlerts.length > 0 && (
                <View style={styles.filterBar}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                    <TouchableOpacity
                      style={[styles.filterChip, activeFilter === 'all' && styles.filterChipActive]}
                      onPress={() => setActiveFilter('all')}
                    >
                      <Text style={[styles.filterChipText, activeFilter === 'all' && styles.filterChipTextActive]}>
                        All ({activeAlerts.length})
                      </Text>
                    </TouchableOpacity>

                    {announcementsCount > 0 && (
                      <TouchableOpacity
                        style={[styles.filterChip, activeFilter === 'announcements' && styles.filterChipActive]}
                        onPress={() => setActiveFilter('announcements')}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            activeFilter === 'announcements' && styles.filterChipTextActive,
                          ]}
                        >
                          📢 Announcements ({announcementsCount})
                        </Text>
                      </TouchableOpacity>
                    )}

                    {messagesCount > 0 && (
                      <TouchableOpacity
                        style={[styles.filterChip, activeFilter === 'messages' && styles.filterChipActive]}
                        onPress={() => setActiveFilter('messages')}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            activeFilter === 'messages' && styles.filterChipTextActive,
                          ]}
                        >
                          💬 Messages ({messagesCount})
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.filterChip, activeFilter === 'urgent' && styles.filterChipActive]}
                      onPress={() => setActiveFilter('urgent')}
                    >
                      <Text style={[styles.filterChipText, activeFilter === 'urgent' && styles.filterChipTextActive]}>
                        🔥 Urgent
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.filterChip, activeFilter === 'deadlines' && styles.filterChipActive]}
                      onPress={() => setActiveFilter('deadlines')}
                    >
                      <Text style={[styles.filterChipText, activeFilter === 'deadlines' && styles.filterChipTextActive]}>
                        Deadlines
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.filterChip, activeFilter === 'events' && styles.filterChipActive]}
                      onPress={() => setActiveFilter('events')}
                    >
                      <Text style={[styles.filterChipText, activeFilter === 'events' && styles.filterChipTextActive]}>
                        Events
                      </Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              )}

              {/* Scrollable Alerts Content */}
              <ScrollView
                style={styles.scrollList}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                {filteredAlerts.length === 0 ? (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIconWrap}>
                      <Ionicons name="checkmark-done-outline" size={28} color={colors.success} />
                    </View>
                    <Text style={styles.emptyTitle}>
                      {activeAlerts.length === 0 ? 'All Caught Up!' : 'No matching alerts'}
                    </Text>
                    <Text style={styles.emptyText}>
                      {activeAlerts.length === 0
                        ? 'You have cleared all pending notifications. We will alert you before your deadlines.'
                        : 'No alerts in this category right now.'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.alertList}>
                    {filteredAlerts.map((alert) => (
                      <TouchableOpacity
                        key={alert.id}
                        style={[
                          styles.alertCard,
                          alert.severity === 'danger' && styles.alertCardDanger,
                          alert.severity === 'urgent' && styles.alertCardUrgent,
                        ]}
                        onPress={() => handleNavigate(alert)}
                        activeOpacity={0.85}
                      >
                        <View style={[styles.typeIndicator, { backgroundColor: alert.iconBg }]}>
                          <Ionicons name={alert.icon as any} size={16} color={alert.iconColor} />
                        </View>

                        <View style={styles.alertDetails}>
                          <View style={styles.alertHeaderRow}>
                            <Text style={styles.alertHeadline} numberOfLines={1}>
                              {alert.headline}
                            </Text>
                            <View style={styles.timePill}>
                              <Text style={styles.timePillText}>{alert.timeDisplay}</Text>
                            </View>
                          </View>

                          <Text style={styles.alertEventTitle} numberOfLines={1}>
                            {alert.title}
                          </Text>

                          <Text style={styles.alertBody} numberOfLines={2}>
                            {alert.body}
                          </Text>
                        </View>

                        {/* Individual Dismiss Button */}
                        <TouchableOpacity
                          style={styles.dismissBtn}
                          onPress={() => handleDismissSingle(alert.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="close" size={15} color="#94A3B8" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '82%',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    ...shadows.overlay,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bellIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.control,
    backgroundColor: colors.canvasSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    position: 'relative',
  },
  bellDot: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.control,
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  clearAllText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.control,
    backgroundColor: colors.canvasSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBar: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    backgroundColor: '#FAFAFA',
  },
  filterScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  scrollList: {
    flexGrow: 1,
  },
  scrollContent: {
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  emptyIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  alertList: {
    gap: 10,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.control,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.07)',
    gap: 12,
    ...shadows.card,
  },
  alertCardDanger: {
    borderColor: 'rgba(220, 38, 38, 0.25)',
    backgroundColor: '#FEF2F2',
  },
  alertCardUrgent: {
    borderColor: 'rgba(234, 88, 12, 0.25)',
    backgroundColor: '#FFF7ED',
  },
  typeIndicator: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  alertDetails: {
    flex: 1,
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 2,
  },
  alertHeadline: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  timePill: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  timePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  alertEventTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 3,
  },
  alertBody: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  dismissBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
});
