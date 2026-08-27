import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEvents } from '../../src/context/EventsContext';
import { useAuth } from '../../src/context/AuthContext';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { colors, radii, shadows } from '../../src/theme/tokens';
import {
  CalendarEvent,
  EVENT_TYPE_CONFIG,
  formatFriendlyDate,
  getDaysDifference,
} from '@eventpulse/shared';
import { requestNotificationPermissions } from '../../src/services/notificationService';

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { events, clashes } = useEvents();

  const [activeFeedTab, setActiveFeedTab] = useState<'upcoming' | 'deadlines'>('upcoming');
  const [refreshing, setRefreshing] = useState(false);

  // Request Android runtime notification permissions immediately on dashboard mount
  React.useEffect(() => {
    requestNotificationPermissions().catch(() => {});
  }, []);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  // Compute active items
  const activeEvents = useMemo(() => {
    return events.filter((e) => e.status !== 'skipped');
  }, [events]);

  const upcomingList = useMemo(() => {
    return activeEvents
      .filter((e) => {
        const targetDate = e.event_start_date || e.registration_deadline;
        if (!targetDate) return false;
        return getDaysDifference(targetDate) >= 0;
      })
      .sort((a, b) => {
        const aDate = a.event_start_date || a.registration_deadline || '';
        const bDate = b.event_start_date || b.registration_deadline || '';
        return aDate.localeCompare(bDate);
      });
  }, [activeEvents]);

  const deadlinesList = useMemo(() => {
    return activeEvents
      .filter((e) => !!e.registration_deadline)
      .sort((a, b) => (a.registration_deadline || '').localeCompare(b.registration_deadline || ''));
  }, [activeEvents]);

  const urgentDeadlinesCount = useMemo(() => {
    return deadlinesList.filter((e) => {
      if (!e.registration_deadline) return false;
      const diff = getDaysDifference(e.registration_deadline);
      return diff >= 0 && diff <= 7;
    }).length;
  }, [deadlinesList]);

  const nextUp = upcomingList[0];

  // Safely format name so it never overflows
  const rawDisplayName = user?.displayName || user?.email?.split('@')[0] || 'Student';
  const firstName = rawDisplayName.length > 15 ? `${rawDisplayName.slice(0, 14)}…` : rawDisplayName;

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

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
        {/* iOS Top Header Bar */}
        <View style={styles.topBar}>
          <View style={styles.greetingCol}>
            <Text style={styles.dateSubtitle}>{todayFormatted}</Text>
            <Text style={styles.greetingTitle} numberOfLines={1} ellipsizeMode="tail">
              Hi, {firstName}
            </Text>
          </View>

          <View style={styles.topActionsRow}>
            <TouchableOpacity
              style={styles.extractBtn}
              onPress={() => router.push('/extract')}
              activeOpacity={0.8}
            >
              <Ionicons name="sparkles-outline" size={14} color="#FFFFFF" />
              <Text style={styles.extractBtnText}>Extract</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.avatarBtn}
              onPress={() => router.push('/(auth)/settings')}
              activeOpacity={0.8}
            >
              <Ionicons name="person-outline" size={16} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Minimalist 3-in-1 Status Strip */}
        <GlassCard contentStyle={styles.statusStrip}>
          <View style={styles.statusSegment}>
            <Text style={styles.statusValue}>{upcomingList.length}</Text>
            <Text style={styles.statusLabel}>Events</Text>
          </View>

          <View style={styles.statusDivider} />

          <View style={styles.statusSegment}>
            <Text style={styles.statusValue}>{urgentDeadlinesCount}</Text>
            <Text style={styles.statusLabel}>Due Soon</Text>
          </View>

          <View style={styles.statusDivider} />

          <TouchableOpacity
            style={styles.statusSegment}
            onPress={() => router.push('/calendar')}
            activeOpacity={0.7}
          >
            <View style={styles.statusBadgeRow}>
              <View
                style={[
                  styles.statusIndicatorDot,
                  {
                    backgroundColor:
                      clashes.length > 0 ? colors.danger : colors.success,
                  },
                ]}
              />
              <Text
                style={[
                  styles.statusValue,
                  {
                    color:
                      clashes.length > 0 ? colors.danger : colors.textPrimary,
                  },
                ]}
              >
                {clashes.length > 0 ? `${clashes.length}` : '0'}
              </Text>
            </View>
            <Text style={styles.statusLabel}>
              {clashes.length > 0 ? 'Conflicts' : 'Conflicts'}
            </Text>
          </TouchableOpacity>
        </GlassCard>

        {/* Hero "Up Next" Card */}
        {nextUp ? (
          <GlassCard contentStyle={styles.heroCard}>
            <View style={styles.heroHeaderRow}>
              <View style={styles.heroPill}>
                <Ionicons name="flash-outline" size={12} color={colors.primary} />
                <Text style={styles.heroPillText}>UP NEXT</Text>
              </View>
              <Text style={styles.heroCountdown}>
                {(() => {
                  const target = nextUp.event_start_date || nextUp.registration_deadline;
                  if (!target) return '';
                  const diff = getDaysDifference(target);
                  if (diff === 0) return 'Today';
                  if (diff === 1) return 'Tomorrow';
                  return `In ${diff} days`;
                })()}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => router.push(`/event/${nextUp.id}`)}
              activeOpacity={0.85}
              style={styles.heroBody}
            >
              <Text style={styles.heroTitle} numberOfLines={2} ellipsizeMode="tail">
                {nextUp.title}
              </Text>

              <View style={styles.heroMetaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="calendar-outline" size={13} color={colors.textSecondary} />
                  <Text style={styles.metaItemText} numberOfLines={1}>
                    {nextUp.event_start_date
                      ? formatFriendlyDate(nextUp.event_start_date)
                      : 'Date TBD'}
                  </Text>
                </View>

                <View style={styles.metaItem}>
                  <Ionicons
                    name={nextUp.mode === 'online' ? 'globe-outline' : 'location-outline'}
                    size={13}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.metaItemText} numberOfLines={1}>
                    {nextUp.mode === 'online' ? 'Online' : nextUp.location || 'In-Person'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </GlassCard>
        ) : (
          <GlassCard contentStyle={styles.emptyHeroCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.emptyTextCol}>
              <Text style={styles.emptyHeroTitle}>Your schedule is clear</Text>
              <Text style={styles.emptyHeroSub}>
                Paste any WhatsApp announcement to automatically extract events.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.emptyHeroBtn}
              onPress={() => router.push('/extract')}
              activeOpacity={0.8}
            >
              <Text style={styles.emptyHeroBtnText}>Add</Text>
            </TouchableOpacity>
          </GlassCard>
        )}

        {/* Feed Section with 2-Tab Selector */}
        <View style={styles.feedSection}>
          <View style={styles.feedTabRow}>
            <TouchableOpacity
              style={[
                styles.feedTab,
                activeFeedTab === 'upcoming' && styles.feedTabActive,
              ]}
              onPress={() => setActiveFeedTab('upcoming')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.feedTabText,
                  activeFeedTab === 'upcoming' && styles.feedTabTextActive,
                ]}
                numberOfLines={1}
              >
                Upcoming ({upcomingList.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.feedTab,
                activeFeedTab === 'deadlines' && styles.feedTabActive,
              ]}
              onPress={() => setActiveFeedTab('deadlines')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.feedTabText,
                  activeFeedTab === 'deadlines' && styles.feedTabTextActive,
                ]}
                numberOfLines={1}
              >
                Deadlines ({deadlinesList.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* List Items */}
          {activeFeedTab === 'upcoming' ? (
            upcomingList.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                <Ionicons name="calendar-outline" size={24} color={colors.textSecondary} />
                <Text style={styles.emptyStateText}>No upcoming events</Text>
              </View>
            ) : (
              <View style={styles.cardsList}>
                {upcomingList.map((ev) => {
                  const conf = EVENT_TYPE_CONFIG[ev.type] || EVENT_TYPE_CONFIG.other;
                  const dayNum = ev.event_start_date ? ev.event_start_date.split('-')[2] : '--';
                  const monthName = ev.event_start_date
                    ? new Date(ev.event_start_date).toLocaleDateString('en-US', { month: 'short' })
                    : '';

                  return (
                    <TouchableOpacity
                      key={ev.id}
                      style={styles.listItemCard}
                      onPress={() => router.push(`/event/${ev.id}`)}
                      activeOpacity={0.8}
                    >
                      {/* Date Badge */}
                      <View style={styles.dateBadge}>
                        <Text style={styles.dateBadgeDay}>{dayNum}</Text>
                        <Text style={styles.dateBadgeMonth}>{monthName.toUpperCase()}</Text>
                      </View>

                      {/* Info Column with minWidth: 0 & flex: 1 for text overflow resilience */}
                      <View style={styles.listItemInfo}>
                        <View style={styles.typeLabelRow}>
                          <Text style={[styles.typeBadgeText, { color: colors.primary }]}>
                            {conf.label.toUpperCase()}
                          </Text>
                          {ev.mode && (
                            <Text style={styles.modeText} numberOfLines={1}>
                              • {ev.mode === 'online' ? 'ONLINE' : 'IN-PERSON'}
                            </Text>
                          )}
                        </View>
                        <Text style={styles.listItemTitle} numberOfLines={1} ellipsizeMode="tail">
                          {ev.title}
                        </Text>
                      </View>

                      <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )
          ) : (
            deadlinesList.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                <Ionicons name="alarm-outline" size={24} color={colors.textSecondary} />
                <Text style={styles.emptyStateText}>No registration deadlines</Text>
              </View>
            ) : (
              <View style={styles.cardsList}>
                {deadlinesList.map((ev) => {
                  const diff = ev.registration_deadline
                    ? getDaysDifference(ev.registration_deadline)
                    : null;
                  const isUrgent = diff !== null && diff >= 0 && diff <= 3;

                  return (
                    <TouchableOpacity
                      key={ev.id}
                      style={styles.listItemCard}
                      onPress={() => router.push(`/event/${ev.id}`)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.dateBadge, isUrgent && styles.dateBadgeUrgent]}>
                        <Ionicons
                          name="alarm-outline"
                          size={18}
                          color={isUrgent ? colors.danger : colors.warning}
                        />
                      </View>

                      <View style={styles.listItemInfo}>
                        <View style={styles.typeLabelRow}>
                          <Text
                            style={[
                              styles.typeBadgeText,
                              { color: isUrgent ? colors.danger : colors.warning },
                            ]}
                          >
                            {diff !== null
                              ? diff === 0
                                ? 'CLOSES TODAY'
                                : diff === 1
                                ? 'CLOSES TOMORROW'
                                : `CLOSES IN ${diff} DAYS`
                              : 'DEADLINE'}
                          </Text>
                        </View>
                        <Text style={styles.listItemTitle} numberOfLines={1} ellipsizeMode="tail">
                          {ev.title}
                        </Text>
                      </View>

                      <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )
          )}
        </View>
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
    paddingBottom: 48,
    gap: 14,
    maxWidth: 480,
    alignSelf: 'center',
    width: '100%',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: 12,
  },
  greetingCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  dateSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    lineHeight: 15,
  },
  greetingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 26,
    flexShrink: 1,
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  extractBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    gap: 5,
    minHeight: 36,
  },
  extractBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 16,
  },
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  statusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  statusSegment: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  statusDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusValue: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 14,
  },
  heroCard: {
    padding: 16,
    gap: 10,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.canvasSubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  heroPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  heroCountdown: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  heroBody: {
    gap: 8,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 22,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '50%',
  },
  metaItemText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
    flexShrink: 1,
  },
  emptyHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  emptyIconCircle: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.canvasSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  emptyTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  emptyHeroTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 17,
  },
  emptyHeroSub: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  emptyHeroBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    flexShrink: 0,
  },
  emptyHeroBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  feedSection: {
    gap: 10,
  },
  feedTabRow: {
    flexDirection: 'row',
    backgroundColor: '#EBEBED',
    borderRadius: radii.control,
    padding: 3,
  },
  feedTab: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.control - 3,
    minHeight: 36,
  },
  feedTabActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    ...shadows.subtle,
  },
  feedTabText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 16,
    flexShrink: 1,
  },
  feedTabTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  cardsList: {
    gap: 8,
  },
  listItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.control,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    gap: 12,
    ...shadows.subtle,
  },
  dateBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.canvasSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  dateBadgeUrgent: {
    backgroundColor: colors.dangerLight,
    borderColor: 'rgba(220, 38, 38, 0.15)',
  },
  dateBadgeDay: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 17,
  },
  dateBadgeMonth: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  listItemInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  typeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'nowrap',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    flexShrink: 0,
  },
  modeText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '500',
    flexShrink: 1,
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 19,
    flexShrink: 1,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyStateText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
