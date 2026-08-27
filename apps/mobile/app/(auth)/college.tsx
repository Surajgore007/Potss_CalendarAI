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
  formatFriendlyDate,
  getDaysDifference,
} from '@eventpulse/shared';
import { colors, radii, shadows } from '../../src/theme/tokens';

export default function CollegeFeedScreen() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { addEvent, removeEvent, events: userEvents } = useEvents();

  const [communityEvents, setCommunityEvents] = useState<CommunityEvent[]>([]);
  const [activeFilter, setActiveFilter] = useState<EventType | 'all'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  // Subscribe to live SIES GST community events
  useEffect(() => {
    const unsubscribe = subscribeToCommunityEvents('SIES_GST', (list) => {
      setCommunityEvents(list);
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
    return userEvents.find(
      (e) =>
        e.title.toLowerCase().trim() === commEvent.title.toLowerCase().trim() &&
        e.event_start_date === commEvent.event_start_date
    );
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
          <View style={styles.liveDot} />
          <Text style={styles.liveBannerText}>
            {communityEvents.length > 0
              ? `${communityEvents.length} live event${communityEvents.length !== 1 ? 's' : ''} from SIES GST`
              : 'Live feed — events posted here by admin'}
          </Text>
          <Ionicons name="wifi" size={12} color="#16A34A" style={{ marginLeft: 'auto' }} />
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
                        {item.time ? ` at ${item.time}` : ''}
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

                {/* Action Buttons */}
                <View style={styles.cardActionsRow}>
                  {item.registration_link && (
                    <TouchableOpacity
                      style={styles.linkButton}
                      onPress={() => Linking.openURL(item.registration_link!)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="open-outline" size={14} color={colors.textPrimary} />
                      <Text style={styles.linkButtonText} numberOfLines={1}>Register Link</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.saveButton, saved && styles.saveButtonDone]}
                    onPress={() => handleTogglePersonal(item)}
                    disabled={isSaving}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={saved ? 'checkmark-circle' : 'add-circle-outline'}
                      size={15}
                      color={saved ? colors.success : '#FFFFFF'}
                    />
                    <Text style={[styles.saveButtonText, saved && styles.saveButtonTextDone]}>
                      {isSaving ? 'Updating...' : saved ? 'In Calendar' : 'Add to Calendar'}
                    </Text>
                  </TouchableOpacity>

                  {isAdmin && (
                    <TouchableOpacity
                      style={styles.deleteAdminBtn}
                      onPress={() => handleDeleteCommunityEvent(item.id, item.title)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              </GlassCard>
            );
          })
        )}
      </ScrollView>
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
    paddingBottom: 40,
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
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.canvasSubtle,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  linkButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.control,
  },
  saveButtonDone: {
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.2)',
  },
  saveButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveButtonTextDone: {
    color: colors.success,
  },
  deleteAdminBtn: {
    padding: 8,
    borderRadius: radii.control,
    backgroundColor: colors.dangerLight,
  },
});
