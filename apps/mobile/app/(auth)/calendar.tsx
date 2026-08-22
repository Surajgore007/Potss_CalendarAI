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
import {
  CalendarEvent,
  EVENT_TYPE_CONFIG,
  formatFriendlyDate,
  getTodayISODate,
  getUrgencyInfo,
} from '@eventpulse/shared';

export default function CalendarScreen() {
  const router = useRouter();
  const { events, clashes, removeEvent } = useEvents();

  const [viewMode, setViewMode] = useState<'timeline' | 'month' | 'agenda'>('timeline');
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(new Date());
  const [selectedDayISO, setSelectedDayISO] = useState<string>(getTodayISODate());

  const handleDeleteEvent = (eventId: string, eventTitle: string) => {
    Alert.alert('Delete Event', `Are you sure you want to remove "${eventTitle}" from your calendar?`, [
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

  // Generate days for Month Grid
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

    // Padding for previous month
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

    // Days in current month
    const activeEvents = events.filter((e) => e.status !== 'skipped');

    for (let d = 1; d <= totalDays; d++) {
      const dateObj = new Date(year, month, d);
      const iso = getTodayISODate(dateObj);
      const isToday = iso === getTodayISODate();

      // Events happening on this day (including multi-day events)
      const dayEvents = activeEvents.filter((e) => {
        if (!e.event_start_date) return false;
        if (e.event_start_date === iso) return true;
        // Multi-day event: check if iso falls between start and end
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
          {/* Header Card */}
          <View style={styles.headerCard}>
            <View style={styles.headerLeft}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => router.push('/')}
              >
                <Ionicons name="arrow-back" size={18} color="#64748B" />
              </TouchableOpacity>
              <View>
                <Text style={styles.headerTitle}>Google Calendar View</Text>
                <Text style={styles.headerSubtitle}>
                  Visual schedule, timeline tracks & clash detection
                </Text>
              </View>
            </View>

            {/* View Mode Switcher Pills */}
            <View style={styles.viewModePills}>
              {(['timeline', 'month', 'agenda'] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.viewPill,
                    viewMode === mode && styles.viewPillActive,
                  ]}
                  onPress={() => setViewMode(mode)}
                >
                  <Text
                    style={[
                      styles.viewPillText,
                      viewMode === mode && styles.viewPillTextActive,
                    ]}
                  >
                    {mode === 'timeline'
                      ? 'Timeline'
                      : mode === 'month'
                      ? 'Month Grid'
                      : 'Agenda'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Clash Alert Banner */}
          {clashes.length > 0 && <ClashBanner clashes={clashes} />}

          {/* VIEW MODE 1: TIMELINE GRID */}
          {viewMode === 'timeline' && (
            <TimelineGrid
              events={events}
              onSelectEvent={(event) => router.push(`/event/${event.id}`)}
            />
          )}

          {/* VIEW MODE 2: GOOGLE CALENDAR MONTH GRID */}
          {viewMode === 'month' && (
            <View style={styles.monthCard}>
              {/* Month Navigation Bar */}
              <View style={styles.monthNavRow}>
                <View style={styles.monthTitleGroup}>
                  <Text style={styles.monthTitle}>
                    {currentMonthDate.toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                  <TouchableOpacity
                    style={styles.todayJumpBtn}
                    onPress={() => {
                      setCurrentMonthDate(new Date());
                      setSelectedDayISO(getTodayISODate());
                    }}
                  >
                    <Text style={styles.todayJumpText}>Today</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.monthArrows}>
                  <TouchableOpacity
                    style={styles.arrowBtn}
                    onPress={() => changeMonth(-1)}
                  >
                    <Ionicons name="chevron-back" size={18} color="#64748B" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.arrowBtn}
                    onPress={() => changeMonth(1)}
                  >
                    <Ionicons name="chevron-forward" size={18} color="#64748B" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Day of Week Headers */}
              <View style={styles.weekHeadersRow}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <View key={d} style={styles.weekHeaderCol}>
                    <Text style={styles.weekHeaderText}>{d}</Text>
                  </View>
                ))}
              </View>

              {/* Month Grid Cells */}
              <View style={styles.monthGrid}>
                {monthCalendarData.map((day, idx) => {
                  if (!day.dayNum || !day.iso) {
                    return <View key={`empty_${idx}`} style={styles.emptyDayCell} />;
                  }

                  const isSelected = day.iso === selectedDayISO;
                  const hasActivity =
                    day.events.length > 0 || day.deadlines.length > 0;

                  return (
                    <TouchableOpacity
                      key={day.iso}
                      style={[
                        styles.dayCell,
                        day.isToday && styles.todayCell,
                        isSelected && styles.selectedDayCell,
                      ]}
                      activeOpacity={0.8}
                      onPress={() => setSelectedDayISO(day.iso!)}
                    >
                      <View
                        style={[
                          styles.dayNumberBubble,
                          day.isToday && styles.todayNumberBubble,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayNumberText,
                            day.isToday && styles.todayNumberText,
                          ]}
                        >
                          {day.dayNum}
                        </Text>
                      </View>

                      {/* Event Chips / Dots */}
                      <View style={styles.eventDotsContainer}>
                        {day.deadlines.map((dl) => (
                          <View
                            key={`dl_${dl.id}`}
                            style={styles.deadlineDotPill}
                          >
                            <Text style={styles.deadlineDotText} numberOfLines={1}>
                              ⚠️ {dl.title}
                            </Text>
                          </View>
                        ))}
                        {day.events.map((ev) => {
                          const conf =
                            EVENT_TYPE_CONFIG[ev.type] || EVENT_TYPE_CONFIG.other;
                          return (
                            <View
                              key={`ev_${ev.id}`}
                              style={[
                                styles.eventDotPill,
                                { backgroundColor: conf.badgeBg },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.eventDotText,
                                  { color: conf.badgeText },
                                ]}
                                numberOfLines={1}
                              >
                                {ev.title}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Day Inspector Panel */}
              <View style={styles.inspectorPanel}>
                <View style={styles.inspectorHeaderRow}>
                  <Text style={styles.inspectorTitle}>
                    Schedule for {formatFriendlyDate(selectedDayISO)}
                  </Text>
                  <TouchableOpacity
                    style={styles.inspectorAddBtn}
                    onPress={() => router.push('/extract')}
                  >
                    <Ionicons name="add" size={14} color="#3B82F6" />
                    <Text style={styles.inspectorAddText}>Paste WhatsApp</Text>
                  </TouchableOpacity>
                </View>

                {selectedDayActivity.dayDeadlines.length === 0 &&
                selectedDayActivity.dayEvents.length === 0 ? (
                  <View style={styles.emptyInspectorBox}>
                    <Ionicons name="calendar-outline" size={24} color="#94A3B8" />
                    <Text style={styles.emptyInspectorText}>
                      No events scheduled on this day.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.inspectorList}>
                    {selectedDayActivity.dayDeadlines.map((dl) => (
                      <View key={dl.id} style={styles.inspectorDeadlineCard}>
                        <TouchableOpacity
                          style={styles.inspectorCardMain}
                          onPress={() => router.push(`/event/${dl.id}`)}
                        >
                          <Ionicons name="alarm" size={16} color="#D97706" />
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={styles.inspectorEventTitle} numberOfLines={1}>
                              Registration Deadline: {dl.title}
                            </Text>
                            <Text style={styles.inspectorEventSub}>
                              Event on{' '}
                              {dl.event_start_date
                                ? formatFriendlyDate(dl.event_start_date)
                                : 'TBD'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.inspectorDeleteBtn}
                          onPress={() => handleDeleteEvent(dl.id, dl.title)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="trash-outline" size={16} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    ))}

                    {selectedDayActivity.dayEvents.map((ev) => (
                      <View key={ev.id} style={styles.inspectorEventCard}>
                        <TouchableOpacity
                          style={styles.inspectorCardMain}
                          onPress={() => router.push(`/event/${ev.id}`)}
                        >
                          <Ionicons name="calendar" size={16} color="#3B82F6" />
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={styles.inspectorEventTitle} numberOfLines={1}>
                              {ev.title}
                            </Text>
                            <Text style={styles.inspectorEventSub}>
                              {ev.time || 'All Day'} • {ev.mode.toUpperCase()}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.inspectorDeleteBtn}
                          onPress={() => handleDeleteEvent(ev.id, ev.title)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="trash-outline" size={16} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* VIEW MODE 3: AGENDA LIST */}
          {viewMode === 'agenda' && (
            <View style={styles.agendaCard}>
              <Text style={styles.agendaSectionHeader}>Chronological Feed</Text>
              {[...events]
                .filter((e) => e.status !== 'skipped')
                .sort((a, b) => {
                  const aDate = a.event_start_date || a.registration_deadline || '';
                  const bDate = b.event_start_date || b.registration_deadline || '';
                  return aDate.localeCompare(bDate);
                })
                .map((event) => {
                const urgency = getUrgencyInfo(event);
                const conf = EVENT_TYPE_CONFIG[event.type] || EVENT_TYPE_CONFIG.other;

                return (
                  <View key={event.id} style={styles.agendaItem}>
                    <TouchableOpacity
                      style={styles.agendaMainClickable}
                      activeOpacity={0.8}
                      onPress={() => router.push(`/event/${event.id}`)}
                    >
                      <View
                        style={[
                          styles.agendaIconCircle,
                          { backgroundColor: conf.badgeBg },
                        ]}
                      >
                        <Ionicons
                          name={conf.icon as any}
                          size={18}
                          color={conf.accentColor}
                        />
                      </View>

                      <View style={styles.agendaTextCol}>
                        <Text style={styles.agendaTitle}>{event.title}</Text>
                        <Text style={styles.agendaSub}>
                          {event.event_start_date
                            ? formatFriendlyDate(event.event_start_date)
                            : 'TBD'}{' '}
                          • {event.time || 'All Day'} • {event.mode.charAt(0).toUpperCase() + event.mode.slice(1)}
                        </Text>
                        {event.registration_deadline && (
                          <Text style={styles.agendaDeadlineHighlight}>
                            ⚠️ Register by: {formatFriendlyDate(event.registration_deadline)}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>

                    <View style={styles.agendaActionsCol}>
                      <View
                        style={[
                          styles.agendaUrgencyBadge,
                          urgency.urgencyLevel === 'critical' &&
                            styles.agendaUrgencyCritical,
                        ]}
                      >
                        <Text
                          style={[
                            styles.agendaUrgencyText,
                            urgency.urgencyLevel === 'critical' &&
                              styles.agendaUrgencyTextCritical,
                          ]}
                        >
                          {urgency.daysRemaining === 0
                            ? 'Today'
                            : urgency.daysRemaining > 0
                            ? `${urgency.daysRemaining}d`
                            : 'Past'}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={styles.agendaDeleteBtn}
                        onPress={() => handleDeleteEvent(event.id, event.title)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={16} color="#94A3B8" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EEF2F6',
  },
  layoutWrapper: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#EEF2F6',
  },
  mainScroll: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  viewModePills: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  viewPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  viewPillActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 1,
  },
  viewPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  viewPillTextActive: {
    color: '#3B82F6',
    fontWeight: '700',
  },
  monthCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  monthTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  todayJumpBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  todayJumpText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
  },
  monthArrows: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  arrowBtn: {
    padding: 6,
  },
  weekHeadersRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
    marginBottom: 8,
  },
  weekHeaderCol: {
    flex: 1,
    alignItems: 'center',
  },
  weekHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emptyDayCell: {
    width: '14.28%',
    height: 76,
  },
  dayCell: {
    width: '14.28%',
    minHeight: 76,
    padding: 4,
    borderWidth: 0.5,
    borderColor: '#F1F5F9',
    borderRadius: 8,
  },
  todayCell: {
    backgroundColor: '#EFF6FF20',
  },
  selectedDayCell: {
    borderColor: '#3B82F6',
    borderWidth: 1.5,
    backgroundColor: '#EFF6FF40',
  },
  dayNumberBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  todayNumberBubble: {
    backgroundColor: '#3B82F6',
  },
  dayNumberText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  todayNumberText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  eventDotsContainer: {
    gap: 2,
  },
  deadlineDotPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  deadlineDotText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B45309',
  },
  eventDotPill: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  eventDotText: {
    fontSize: 9,
    fontWeight: '600',
  },
  inspectorPanel: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  inspectorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  inspectorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  inspectorAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 4,
  },
  inspectorAddText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
  },
  emptyInspectorBox: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyInspectorText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  inspectorList: {
    gap: 8,
  },
  inspectorDeadlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    justifyContent: 'space-between',
  },
  inspectorEventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    justifyContent: 'space-between',
  },
  inspectorCardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inspectorDeleteBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    marginLeft: 8,
  },
  inspectorEventTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  inspectorEventSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  agendaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
  agendaSectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 16,
  },
  agendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    justifyContent: 'space-between',
    gap: 10,
  },
  agendaMainClickable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  agendaIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agendaTextCol: {
    flex: 1,
  },
  agendaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  agendaSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  agendaDeadlineHighlight: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
    marginTop: 2,
  },
  agendaActionsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  agendaDeleteBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  agendaUrgencyBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  agendaUrgencyCritical: {
    backgroundColor: '#FEE2E2',
  },
  agendaUrgencyText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  agendaUrgencyTextCritical: {
    color: '#DC2626',
    fontWeight: '700',
  },
});
