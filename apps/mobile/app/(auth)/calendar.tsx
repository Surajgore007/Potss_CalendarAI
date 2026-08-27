import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEvents } from '../../src/context/EventsContext';
import { SidebarRail } from '../../src/components/SidebarRail';
import { TimelineGrid } from '../../src/components/TimelineGrid';
import { ClashBanner } from '../../src/components/ClashBanner';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { colors, radii, spacing, shadows } from '../../src/theme/tokens';
import {
  CalendarEvent,
  EVENT_TYPE_CONFIG,
  formatFriendlyDate,
  getTodayISODate,
} from '@eventpulse/shared';

export default function CalendarScreen() {
  const router = useRouter();
  const { events, clashes, removeEvent } = useEvents();

  const [viewMode, setViewMode] = useState<'timeline' | 'month' | 'agenda'>('month');
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(new Date());
  const [selectedDayISO, setSelectedDayISO] = useState<string>(getTodayISODate());

  const handleDeleteEvent = (eventId: string, eventTitle: string) => {
    Alert.alert('Delete Event', `Are you sure you want to remove "${eventTitle}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await removeEvent(eventId);
        },
      },
    ]);
  };

  // Month Grid calculations
  const monthCalendarData = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startingDayOfWeek = firstDay.getDay(); // 0 = Sun
    const totalDays = lastDay.getDate();

    const days: {
      dayNum: number | null;
      iso: string | null;
      isCurrentMonth: boolean;
      isToday: boolean;
      events: CalendarEvent[];
      deadlines: CalendarEvent[];
    }[] = [];

    // Previous month padding
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push({
        dayNum: null,
        iso: null,
        isCurrentMonth: false,
        isToday: false,
        events: [],
        deadlines: [],
      });
    }

    const activeEvents = events.filter((e) => e.status !== 'skipped');

    for (let d = 1; d <= totalDays; d++) {
      const dateObj = new Date(year, month, d);
      const iso = getTodayISODate(dateObj);
      const isToday = iso === getTodayISODate();

      const dayEvents = activeEvents.filter((e) => {
        if (!e.event_start_date) return false;
        if (e.event_start_date === iso) return true;
        if (e.event_end_date && e.event_start_date <= iso && e.event_end_date >= iso) {
          return true;
        }
        return false;
      });
      const dayDeadlines = activeEvents.filter((e) => e.registration_deadline === iso);

      days.push({
        dayNum: d,
        iso,
        isCurrentMonth: true,
        isToday,
        events: dayEvents,
        deadlines: dayDeadlines,
      });
    }

    return days;
  }, [currentMonthDate, events]);

  const changeMonth = (delta: number) => {
    setCurrentMonthDate((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
  };

  const selectedDayActivity = useMemo(() => {
    const active = events.filter((e) => e.status !== 'skipped');
    const dayEvents = active.filter((e) => {
      if (!e.event_start_date) return false;
      if (e.event_start_date === selectedDayISO) return true;
      if (e.event_end_date && e.event_start_date <= selectedDayISO && e.event_end_date >= selectedDayISO) {
        return true;
      }
      return false;
    });
    const dayDeadlines = active.filter((e) => e.registration_deadline === selectedDayISO);
    return { dayEvents, dayDeadlines };
  }, [selectedDayISO, events]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.layoutWrapper}>
        {Platform.OS === 'web' && (
          <SidebarRail onExtractPress={() => router.push('/extract')} />
        )}

        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* iOS-Style Minimal Navigation Bar */}
          <View style={styles.navBar}>
            <View style={styles.navBarLeft}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => router.push('/')}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <View>
                <Text style={styles.screenTitle}>Calendar</Text>
                <Text style={styles.screenSubtitle}>
                  Schedule & dead-line timeline
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.addEventBtn}
              onPress={() => router.push('/extract')}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* iOS-Style Full-Width Segmented Control */}
          <View style={styles.segmentedControl}>
            {(['month', 'timeline', 'agenda'] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.segmentTab,
                  viewMode === mode && styles.segmentTabActive,
                ]}
                onPress={() => setViewMode(mode)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.segmentText,
                    viewMode === mode && styles.segmentTextActive,
                  ]}
                >
                  {mode === 'month'
                    ? 'Month'
                    : mode === 'timeline'
                    ? 'Timeline'
                    : 'Agenda'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Clash Alert Banner */}
          {clashes.length > 0 && <ClashBanner clashes={clashes} />}

          {/* VIEW MODE 1: MONTH GRID (Apple Calendar Style) */}
          {viewMode === 'month' && (
            <GlassCard contentStyle={styles.monthCardContent}>
              {/* Month Navigation Row */}
              <View style={styles.monthNavRow}>
                <View style={styles.monthTitleRow}>
                  <Text style={styles.monthHeading}>
                    {currentMonthDate.toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                  <TouchableOpacity
                    style={styles.todayPill}
                    onPress={() => {
                      setCurrentMonthDate(new Date());
                      setSelectedDayISO(getTodayISODate());
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.todayPillText}>Today</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.monthNavArrows}>
                  <TouchableOpacity
                    style={styles.navArrowBtn}
                    onPress={() => changeMonth(-1)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chevron-back" size={16} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.navArrowBtn}
                    onPress={() => changeMonth(1)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chevron-forward" size={16} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Day of Week Headers */}
              <View style={styles.weekdaysRow}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                  <View key={idx} style={styles.weekdayCol}>
                    <Text style={styles.weekdayText}>{day}</Text>
                  </View>
                ))}
              </View>

              {/* Day Grid Matrix */}
              <View style={styles.gridMatrix}>
                {monthCalendarData.map((day, idx) => {
                  if (!day.dayNum || !day.iso) {
                    return <View key={`empty_${idx}`} style={styles.emptyGridCell} />;
                  }

                  const isSelected = day.iso === selectedDayISO;
                  const hasEvents = day.events.length > 0;
                  const hasDeadlines = day.deadlines.length > 0;

                  return (
                    <TouchableOpacity
                      key={day.iso}
                      style={[
                        styles.dayGridCell,
                        isSelected && styles.dayGridCellSelected,
                      ]}
                      onPress={() => setSelectedDayISO(day.iso!)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.dayNumberCircle,
                          day.isToday && styles.dayTodayCircle,
                          isSelected && !day.isToday && styles.daySelectedCircle,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayNumberLabel,
                            day.isToday && styles.dayTodayLabel,
                            isSelected && !day.isToday && styles.daySelectedLabel,
                          ]}
                        >
                          {day.dayNum}
                        </Text>
                      </View>

                      {/* Clean Minimalist Micro Indicator Dots (No emojis) */}
                      <View style={styles.microDotsRow}>
                        {hasEvents && (
                          <View style={[styles.microDot, { backgroundColor: colors.primary }]} />
                        )}
                        {hasDeadlines && (
                          <View style={[styles.microDot, { backgroundColor: colors.warning }]} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Day Inspector Panel */}
              <View style={styles.dayInspectorSection}>
                <View style={styles.inspectorHeader}>
                  <Text style={styles.inspectorDateTitle}>
                    {formatFriendlyDate(selectedDayISO)}
                  </Text>
                </View>

                {selectedDayActivity.dayDeadlines.length === 0 &&
                selectedDayActivity.dayEvents.length === 0 ? (
                  <View style={styles.emptyDayInspector}>
                    <Ionicons name="calendar-outline" size={22} color={colors.textSecondary} />
                    <Text style={styles.emptyDayText}>
                      No events or deadlines on this date
                    </Text>
                  </View>
                ) : (
                  <View style={styles.inspectorEventsList}>
                    {selectedDayActivity.dayDeadlines.map((dl) => (
                      <TouchableOpacity
                        key={dl.id}
                        style={styles.inspectorItemCard}
                        onPress={() => router.push(`/event/${dl.id}`)}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.itemTypeBadge, { backgroundColor: colors.warningLight }]}>
                          <Ionicons name="alarm-outline" size={16} color={colors.warning} />
                        </View>
                        <View style={styles.itemTextContainer}>
                          <Text style={styles.itemTitle} numberOfLines={1}>
                            {dl.title}
                          </Text>
                          <Text style={styles.itemMeta}>
                            Deadline • Registration closing
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                      </TouchableOpacity>
                    ))}

                    {selectedDayActivity.dayEvents.map((ev) => {
                      const conf = EVENT_TYPE_CONFIG[ev.type] || EVENT_TYPE_CONFIG.other;
                      return (
                        <TouchableOpacity
                          key={ev.id}
                          style={styles.inspectorItemCard}
                          onPress={() => router.push(`/event/${ev.id}`)}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.itemTypeBadge, { backgroundColor: colors.primaryLight }]}>
                            <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
                          </View>
                          <View style={styles.itemTextContainer}>
                            <Text style={styles.itemTitle} numberOfLines={1}>
                              {ev.title}
                            </Text>
                            <Text style={styles.itemMeta}>
                              {conf.label} • {ev.mode === 'online' ? 'Online' : ev.location || 'In-Person'}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            </GlassCard>
          )}

          {/* VIEW MODE 2: TIMELINE */}
          {viewMode === 'timeline' && (
            <TimelineGrid
              events={events}
              onSelectEvent={(event) => router.push(`/event/${event.id}`)}
            />
          )}

          {/* VIEW MODE 3: AGENDA LIST */}
          {viewMode === 'agenda' && (
            <GlassCard contentStyle={styles.agendaCardContent}>
              <Text style={styles.agendaHeading}>Upcoming Schedule</Text>
              {events.length === 0 ? (
                <View style={styles.emptyDayInspector}>
                  <Ionicons name="calendar-outline" size={24} color={colors.textSecondary} />
                  <Text style={styles.emptyDayText}>No scheduled events yet</Text>
                </View>
              ) : (
                <View style={styles.agendaList}>
                  {events
                    .filter((e) => e.status !== 'skipped')
                    .map((ev) => (
                      <TouchableOpacity
                        key={ev.id}
                        style={styles.agendaListItem}
                        onPress={() => router.push(`/event/${ev.id}`)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.agendaDateCol}>
                          <Text style={styles.agendaDateDay}>
                            {ev.event_start_date ? ev.event_start_date.split('-')[2] : '--'}
                          </Text>
                          <Text style={styles.agendaDateMonth}>
                            {ev.event_start_date
                              ? new Date(ev.event_start_date).toLocaleDateString('en-US', { month: 'short' })
                              : ''}
                          </Text>
                        </View>
                        <View style={styles.agendaDetailsCol}>
                          <Text style={styles.agendaTitle} numberOfLines={1}>
                            {ev.title}
                          </Text>
                          <Text style={styles.agendaMeta}>
                            {ev.type.toUpperCase()} • {ev.mode.toUpperCase()}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                      </TouchableOpacity>
                    ))}
                </View>
              )}
            </GlassCard>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  layoutWrapper: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  mainScroll: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 48,
    gap: 14,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  navBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 26,
    flexShrink: 1,
  },
  screenSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
    lineHeight: 16,
    flexShrink: 1,
  },
  addEventBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#EBEBED',
    borderRadius: radii.control,
    padding: 3,
  },
  segmentTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.control - 3,
    minHeight: 36,
  },
  segmentTabActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    ...shadows.subtle,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 16,
    flexShrink: 1,
  },
  segmentTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  monthCardContent: {
    padding: 16,
    gap: 16,
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 22,
    flexShrink: 1,
  },
  todayPill: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  todayPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    lineHeight: 14,
  },
  monthNavArrows: {
    flexDirection: 'row',
    gap: 4,
  },
  navArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  weekdayCol: {
    width: '14.28%',
    alignItems: 'center',
  },
  weekdayText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 14,
  },
  gridMatrix: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emptyGridCell: {
    width: '14.28%',
    height: 48,
  },
  dayGridCell: {
    width: '14.28%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  dayGridCellSelected: {
    backgroundColor: 'rgba(79, 70, 229, 0.06)',
  },
  dayNumberCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayTodayCircle: {
    backgroundColor: colors.primary,
  },
  daySelectedCircle: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  dayNumberLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 16,
  },
  dayTodayLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  daySelectedLabel: {
    color: colors.primary,
    fontWeight: '700',
  },
  microDotsRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 2,
    height: 4,
  },
  microDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  dayInspectorSection: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    gap: 10,
  },
  inspectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inspectorDateTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 18,
    flexShrink: 1,
  },
  emptyDayInspector: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  emptyDayText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
    lineHeight: 16,
  },
  inspectorEventsList: {
    gap: 8,
  },
  inspectorItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    gap: 12,
  },
  itemTypeBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTextContainer: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 17,
    flexShrink: 1,
  },
  itemMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 14,
    flexShrink: 1,
  },
  agendaCardContent: {
    padding: 16,
    gap: 14,
  },
  agendaHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 20,
  },
  agendaList: {
    gap: 10,
  },
  agendaListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    gap: 12,
  },
  agendaDateCol: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
  },
  agendaDateDay: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
    lineHeight: 22,
  },
  agendaDateMonth: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  agendaDetailsCol: {
    flex: 1,
    gap: 2,
  },
  agendaTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 17,
    flexShrink: 1,
  },
  agendaMeta: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
});
