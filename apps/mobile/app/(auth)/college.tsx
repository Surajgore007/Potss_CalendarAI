import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../src/context/AuthContext';
import { useEvents } from '../../src/context/EventsContext';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { GlassButton } from '../../src/components/ui/GlassButton';
import {
  CommunityEvent,
  EventType,
  EVENT_TYPE_CONFIG,
  subscribeToCommunityEvents,
  deleteCommunityEvent,
  toggleCommunityEventAttendance,
  formatFriendlyDate,
  formatTime12Hour,
  getDaysDifference,
  normalizeDateString,
} from '@eventpulse/shared';
import { colors, radii, shadows } from '../../src/theme/tokens';
import { AdminEventReminderModal } from '../../src/components/AdminEventReminderModal';
import { registerForPushNotificationsAsync } from '../../src/services/pushNotificationService';
import { isOnline, subscribeToNetworkStatus } from '../../src/services/networkService';

const SIES_GST_COMMUNITY_CACHE_KEY = '@vanko_cached_community_events_SIES_GST';

function normalizeCommunityEvent(ev: CommunityEvent): CommunityEvent {
  return {
    ...ev,
    event_start_date: normalizeDateString(ev.event_start_date) || ev.event_start_date,
    event_end_date: normalizeDateString(ev.event_end_date) || ev.event_end_date || null,
    registration_deadline: normalizeDateString(ev.registration_deadline) || ev.registration_deadline || null,
  };
}

export default function CollegeFeedScreen() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { addEvent, removeEvent, events: userEvents } = useEvents();

  const [communityEvents, setCommunityEvents] = useState<CommunityEvent[]>([]);
  const [activeFilter, setActiveFilter] = useState<EventType | 'all'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [attendingId, setAttendingId] = useState<string | null>(null);
  const [reminderEvent, setReminderEvent] = useState<CommunityEvent | null>(null);
  const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(true);

  // Extract 2-letter uppercase initials from user profile
  const getUserInitials = (): string => {
    if (!user?.displayName) return 'ST';
    const parts = user.displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return user.displayName.slice(0, 2).toUpperCase();
  };

  const isUserGoing = (commEvent: CommunityEvent): boolean => {
    if (!user?.uid) return false;
    const inAttendees = Array.isArray(commEvent.attendees) && commEvent.attendees.includes(user.uid);
    const inPreviews = !!commEvent.attendeePreviews && user.uid in commEvent.attendeePreviews;
    return inAttendees || inPreviews;
  };

  const handleToggleAttendance = async (commEvent: CommunityEvent) => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to confirm attendance.');
      return;
    }
    const currentlyGoing = isUserGoing(commEvent);
    setAttendingId(commEvent.id);

    try {
      await toggleCommunityEventAttendance(
        commEvent.id,
        user.uid,
        getUserInitials(),
        !currentlyGoing
      );
      if (!currentlyGoing) {
        registerForPushNotificationsAsync(user.uid, user.college || 'SIES_GST').catch(() => {});
      }
    } catch (err: any) {
      console.error('Error toggling attendance:', err);
      Alert.alert('Notice', 'Could not update your attendance.');
    } finally {
      setAttendingId(null);
    }
  };

  // 1. Initial Frame-0 hydration from persistent device storage
  useEffect(() => {
    AsyncStorage.getItem(SIES_GST_COMMUNITY_CACHE_KEY)
      .then((stored) => {
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setCommunityEvents(parsed.map(normalizeCommunityEvent));
            }
          } catch {
            // Ignored
          }
        }
      })
      .catch(() => {});
  }, []);

  // 2. Track network online/offline status for live banner indicator
  useEffect(() => {
    const unsubscribe = subscribeToNetworkStatus((online) => {
      setIsNetworkOnline(online);
    });
    return () => unsubscribe();
  }, []);

  // 3. Subscribe to live SIES GST community events with offline cache shield
  useEffect(() => {
    const unsubscribe = subscribeToCommunityEvents('SIES_GST', async (list, fromCache) => {
      const online = await isOnline();

      // CRITICAL OFFLINE / CACHE SHIELD:
      // If Firestore emits an empty list while offline or fromCache is true,
      // do NOT wipe cached SIES GST events!
      if (list.length === 0) {
        if (fromCache || !online) {
          return;
        }
      }

      const normalized = list.map(normalizeCommunityEvent);
      setCommunityEvents(normalized);
      if (normalized.length > 0) {
        AsyncStorage.setItem(SIES_GST_COMMUNITY_CACHE_KEY, JSON.stringify(normalized)).catch(() => {});
      }
    });
    return () => unsubscribe();
  }, []);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  // Filter events
  const filteredEvents = useMemo(() => {
    if (activeFilter === 'all') return communityEvents;
    return communityEvents.filter((ev) => ev.type === activeFilter);
  }, [communityEvents, activeFilter]);

  // Find matching event in student's personal calendar
  const getSavedPersonalEvent = (commEvent: CommunityEvent) => {
    const cleanCommDate = commEvent.event_start_date ? commEvent.event_start_date.slice(0, 10) : '';
    return userEvents.find((e) => {
      const cleanUserDate = e.event_start_date ? e.event_start_date.slice(0, 10) : '';
      return (
        e.title.toLowerCase().trim() === commEvent.title.toLowerCase().trim() &&
        cleanUserDate === cleanCommDate
      );
    });
  };

  const isSavedToPersonal = (commEvent: CommunityEvent) => {
    return !!getSavedPersonalEvent(commEvent);
  };

  const handleTogglePersonal = async (commEvent: CommunityEvent) => {
    const existing = getSavedPersonalEvent(commEvent);
    setAddingId(commEvent.id);

    try {
      if (existing) {
        // Remove from student's private calendar
        await removeEvent(existing.id);
        if (user && isUserGoing(commEvent)) {
          await toggleCommunityEventAttendance(commEvent.id, user.uid, getUserInitials(), false).catch(() => {});
        }
        Alert.alert('Removed from Calendar', `"${commEvent.title}" was removed from your personal schedule.`);
      } else {
        // Add to student's private calendar
        await addEvent({
          title: commEvent.title,
          type: commEvent.type,
          event_start_date: commEvent.event_start_date,
          event_end_date: commEvent.event_end_date,
          registration_deadline: commEvent.registration_deadline,
          time: commEvent.time,
          mode: commEvent.mode,
          location: commEvent.location,
          registration_link: commEvent.registration_link,
          source_group: commEvent.source_group || 'SIES GST Community',
          raw_text: commEvent.description || '',
          confidence_score: 1.0,
          tags: commEvent.tags || ['SIES_GST'],
          reminder_offsets: [4320, 1440, 0],
          status: 'upcoming',
        });
        // Automatically sync attendance so student receives targeted admin reminders for this saved event
        if (user && !isUserGoing(commEvent)) {
          await toggleCommunityEventAttendance(commEvent.id, user.uid, getUserInitials(), true).catch(() => {});
          registerForPushNotificationsAsync(user.uid, user.college || 'SIES_GST').catch(() => {});
        }
        Alert.alert('Saved to Calendar', `"${commEvent.title}" was added to your private schedule.`);
      }
    } catch (err: any) {
      console.error('Error toggling personal calendar event:', err);
      Alert.alert('Notice', 'Could not update personal calendar.');
    } finally {
      setAddingId(null);
    }
  };

  const handleDeleteCommunityEvent = (eventId: string, title: string) => {
    Alert.alert('Remove SIES Event', `Delete "${title}" from the public SIES GST feed?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCommunityEvent(eventId);
          } catch (err: any) {
            console.error('Failed to delete community event:', err);
            Alert.alert('Error', 'Only verified admins can remove public community events.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Top Header Card */}
        <GlassCard contentStyle={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.collegeIconBadge}>
              <Ionicons name="school-outline" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.headerTextWrap}>
              <View style={styles.collegePillRow}>
                <View style={styles.collegePill}>
                  <Text style={styles.collegePillText}>SIES GST • NERUL</Text>
                </View>
                {isAdmin && (
                  <View style={styles.adminBadge}>
                    <Ionicons name="shield-checkmark" size={10} color="#FFFFFF" />
                    <Text style={styles.adminBadgeText}>ADMIN</Text>
                  </View>
                )}
              </View>
              <Text style={styles.headerTitle} numberOfLines={1}>College Radar</Text>
              <Text style={styles.headerSubtitle} numberOfLines={2}>
                Curated hackathons, CTFs, and tech announcements for SIES GST students
              </Text>
              <Text style={styles.disclaimerText}>
                Unofficial student community feed · Not affiliated with or endorsed by SIES GST
              </Text>
            </View>

            {isAdmin && (
              <TouchableOpacity
                style={styles.publishBtn}
                onPress={() => router.push('/extract')}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <Text style={styles.publishBtnText}>Publish</Text>
              </TouchableOpacity>
            )}
          </View>
        </GlassCard>

        {/* Live Feed Banner */}
        <View style={styles.liveBanner}>
          <View style={[styles.liveDot, !isNetworkOnline && { backgroundColor: colors.warning }]} />
          <Text style={styles.liveBannerText}>
            {communityEvents.length > 0
              ? isNetworkOnline
                ? `${communityEvents.length} live event${communityEvents.length !== 1 ? 's' : ''} from campus admin`
                : `${communityEvents.length} event${communityEvents.length !== 1 ? 's' : ''} (Offline Mode)`
              : isNetworkOnline
              ? 'Live feed — events posted here by admin'
              : 'Offline — no cached campus events'}
          </Text>
          <Ionicons
            name={isNetworkOnline ? 'wifi' : 'cloud-offline-outline'}
            size={13}
            color={isNetworkOnline ? '#16A34A' : colors.warning}
            style={{ marginLeft: 'auto' }}
          />
        </View>

        {/* Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {(['all', 'hackathon', 'ctf', 'workshop', 'deadline'] as const).map((t) => {
            const isActive = activeFilter === t;
            const label = t === 'all' ? 'All Events' : EVENT_TYPE_CONFIG[t as EventType]?.label || t;
            return (
              <TouchableOpacity
                key={t}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveFilter(t)}
                activeOpacity={0.75}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Events Feed */}
        {filteredEvents.length === 0 ? (
          <GlassCard contentStyle={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="school-outline" size={30} color={colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>
              {communityEvents.length === 0
                ? 'No events published yet'
                : `No ${activeFilter === 'all' ? '' : activeFilter + ' '}events`}
            </Text>
            <Text style={styles.emptySubtitle}>
              {communityEvents.length === 0
                ? 'SIES GST hackathons, CTFs and announcements will appear here once the admin publishes them.'
                : 'Try a different filter to see other event types.'}
            </Text>
          </GlassCard>
        ) : (
          filteredEvents.map((item) => {
            const typeConf = EVENT_TYPE_CONFIG[item.type] || EVENT_TYPE_CONFIG.other;
            const saved = isSavedToPersonal(item);
            const isSaving = addingId === item.id;

            return (
              <GlassCard key={item.id} contentStyle={styles.eventCard}>
                <View style={styles.eventTopRow}>
                  <View style={styles.typeBadge}>
                    <Ionicons name={typeConf.icon as any || 'sparkles-outline'} size={12} color={colors.textPrimary} />
                    <Text style={styles.typeBadgeText}>{typeConf.label.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.modeText}>{item.mode.toUpperCase()}</Text>
                </View>

                <Text style={styles.eventTitle} numberOfLines={2}>
                  {item.title}
                </Text>

                {/* Dates & Deadlines */}
                <View style={styles.dateMetaGrid}>
                  {item.event_start_date && (
                    <View style={styles.metaRow}>
                      <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.metaText} numberOfLines={1}>
                        Event: {formatFriendlyDate(item.event_start_date)}
                        {item.time ? ` at ${formatTime12Hour(item.time)}` : ''}
                      </Text>
                    </View>
                  )}

                  {item.registration_deadline && (
                    <View style={styles.metaRow}>
                      <Ionicons name="alarm-outline" size={14} color={colors.warning} />
                      <Text style={[styles.metaText, { color: colors.warning }]} numberOfLines={1}>
                        Deadline: {formatFriendlyDate(item.registration_deadline)}
                        {(() => {
                          const diff = getDaysDifference(item.registration_deadline);
                          if (diff === 0) return ' (Today)';
                          if (diff === 1) return ' (Tomorrow)';
                          if (diff > 0) return ` (${diff}d left)`;
                          return '';
                        })()}
                      </Text>
                    </View>
                  )}

                  {item.location && (
                    <View style={styles.metaRow}>
                      <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.metaText} numberOfLines={1}>{item.location}</Text>
                    </View>
                  )}
                </View>

                {/* Social Attendance Presence Row */}
                {(() => {
                  const goingCount = item.attendeesCount || 0;
                  const userGoing = isUserGoing(item);
                  const previews = Object.entries(item.attendeePreviews || {});
                  const displayAvatars = previews.slice(0, 3);
                  const remainingCount = goingCount > displayAvatars.length ? goingCount - displayAvatars.length : 0;

                  return (
                    <View style={styles.socialAttendanceRow}>
                      <View style={styles.socialTextGroup}>
                        <Ionicons name="people-outline" size={14} color={userGoing ? colors.success : colors.textSecondary} />
                        <Text style={[styles.socialText, userGoing && styles.socialTextActive]}>
                          {goingCount === 0
                            ? 'Be first to confirm going'
                            : userGoing
                            ? `${goingCount} GSTians Going (You + ${goingCount - 1})`
                            : `${goingCount} GSTian${goingCount > 1 ? 's' : ''} Going`}
                        </Text>
                      </View>

                      {displayAvatars.length > 0 && (
                        <View style={styles.avatarStack}>
                          {displayAvatars.map(([uid, initials], idx) => (
                            <View
                              key={uid}
                              style={[
                                styles.avatarBubble,
                                { zIndex: 10 - idx, marginLeft: idx > 0 ? -8 : 0 },
                              ]}
                            >
                              <Text style={styles.avatarInitials}>{initials}</Text>
                            </View>
                          ))}
                          {remainingCount > 0 && (
                            <View style={[styles.avatarBubble, styles.avatarMoreBubble, { marginLeft: -8 }]}>
                              <Text style={styles.avatarMoreText}>+{remainingCount}</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })()}

                {/* Student Actions Row */}
                <View style={styles.studentActionsRow}>
                  {/* Public "I'm Going" Action */}
                  <TouchableOpacity
                    style={[styles.goingButton, isUserGoing(item) && styles.goingButtonActive]}
                    onPress={() => handleToggleAttendance(item)}
                    disabled={attendingId === item.id}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={isUserGoing(item) ? 'checkmark-circle' : 'people-outline'}
                      size={14}
                      color={isUserGoing(item) ? colors.success : colors.textPrimary}
                    />
                    <Text
                      style={[styles.goingButtonText, isUserGoing(item) && styles.goingButtonTextActive]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {attendingId === item.id
                        ? 'Updating...'
                        : isUserGoing(item)
                        ? 'Going'
                        : "I'm Going"}
                    </Text>
                  </TouchableOpacity>

                  {/* Private "Save to Calendar" Bookmark Action */}
                  <TouchableOpacity
                    style={[styles.saveButton, saved && styles.saveButtonDone]}
                    onPress={() => handleTogglePersonal(item)}
                    disabled={isSaving}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={saved ? 'bookmark' : 'bookmark-outline'}
                      size={14}
                      color={saved ? colors.primary : '#FFFFFF'}
                    />
                    <Text
                      style={[styles.saveButtonText, saved && styles.saveButtonTextDone]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {isSaving ? 'Updating...' : saved ? 'Saved' : 'Save Event'}
                    </Text>
                  </TouchableOpacity>

                  {item.registration_link && (
                    <TouchableOpacity
                      style={styles.linkButton}
                      onPress={() => Linking.openURL(item.registration_link!)}
                      activeOpacity={0.8}
                      accessibilityLabel="Open registration link"
                    >
                      <Ionicons name="open-outline" size={14} color={colors.textPrimary} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Admin Management Section (Exclusive to Admins) */}
                {isAdmin && (
                  <View style={styles.adminCardSection}>
                    <View style={styles.adminSectionHeader}>
                      <View style={styles.adminHeaderBadge}>
                        <Ionicons name="shield-checkmark" size={10} color="#4F46E5" />
                        <Text style={styles.adminHeaderBadgeText}>ADMIN TOOLS</Text>
                      </View>
                      <View style={styles.adminAudiencePill}>
                        <Ionicons name="people" size={11} color={colors.textSecondary} />
                        <Text style={styles.adminAudienceText} numberOfLines={1}>
                          {item.attendees?.length || 0} saved to schedule
                        </Text>
                      </View>
                    </View>

                    <View style={styles.adminButtonsRow}>
                      <TouchableOpacity
                        style={styles.adminNotifyButton}
                        onPress={() => setReminderEvent(item)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="notifications" size={14} color="#FFFFFF" />
                        <Text style={styles.adminNotifyButtonText} numberOfLines={1} ellipsizeMode="tail">
                          Notify Attendees{item.attendees && item.attendees.length > 0 ? ` (${item.attendees.length})` : ''}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.adminDeleteButton}
                        onPress={() => handleDeleteCommunityEvent(item.id, item.title)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        activeOpacity={0.7}
                        accessibilityLabel="Delete event from campus feed"
                      >
                        <Ionicons name="trash-outline" size={15} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </GlassCard>
            );
          })
        )}
      </ScrollView>

      {/* Admin Event Reminder & Push Notification Modal */}
      <AdminEventReminderModal
        visible={!!reminderEvent}
        onClose={() => setReminderEvent(null)}
        event={reminderEvent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  mainScroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 110,
    gap: 14,
    maxWidth: 640,
    alignSelf: 'center',
    width: '100%',
  },
  headerCard: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  collegeIconBadge: {
    width: 44,
    height: 44,
    borderRadius: radii.card,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  collegePillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  collegePill: {
    backgroundColor: colors.canvasSubtle,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  collegePillText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.4,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  adminBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
  disclaimerText: {
    fontSize: 10,
    color: colors.textTertiary,
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 14,
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.control,
  },
  publishBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  filterScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.control,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.subtle,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  liveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(22, 163, 74, 0.07)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.15)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#16A34A',
  },
  liveBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803D',
    letterSpacing: -0.1,
  },
  emptyCard: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.canvasSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  eventCard: {
    padding: 16,
    gap: 10,
  },
  eventTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.canvasSubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  modeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textTertiary,
    letterSpacing: 0.4,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 22,
  },
  dateMetaGrid: {
    gap: 6,
    paddingVertical: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  studentActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  socialAttendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: radii.control,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  socialTextGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  socialText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  socialTextActive: {
    color: colors.success,
    fontWeight: '600',
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  avatarInitials: {
    fontSize: 9,
    fontWeight: '700',
    color: '#4F46E5',
  },
  avatarMoreBubble: {
    backgroundColor: '#F1F5F9',
  },
  avatarMoreText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#64748B',
  },
  goingButton: {
    flex: 1,
    minWidth: 0,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.canvasSubtle,
    paddingHorizontal: 8,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  goingButtonActive: {
    backgroundColor: '#F0FDF4',
    borderColor: 'rgba(22, 163, 74, 0.25)',
  },
  goingButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  goingButtonTextActive: {
    color: colors.success,
  },
  saveButton: {
    flex: 1,
    minWidth: 0,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    borderRadius: radii.control,
  },
  saveButtonDone: {
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  saveButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveButtonTextDone: {
    color: colors.textPrimary,
  },
  linkButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvasSubtle,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    flexShrink: 0,
  },
  adminCardSection: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  adminSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  adminHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  adminHeaderBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4F46E5',
    letterSpacing: 0.4,
  },
  adminAudiencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  adminAudienceText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  adminButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adminNotifyButton: {
    flex: 1,
    minWidth: 0,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    ...shadows.subtle,
  },
  adminNotifyButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  adminDeleteButton: {
    width: 38,
    height: 38,
    borderRadius: radii.control,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
