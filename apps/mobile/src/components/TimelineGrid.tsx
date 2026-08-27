import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  CalendarEvent,
  EventType,
  EVENT_TYPE_CONFIG,
  getTodayISODate,
  THEME_DESIGN,
} from '@eventpulse/shared';

interface TimelineGridProps {
  events: CalendarEvent[];
  selectedDate?: string;
  onSelectEvent?: (event: CalendarEvent) => void;
  onViewAllPress?: () => void;
}

interface SwimlaneCategory {
  type: EventType;
  title: string;
  icon: string;
  color: string;
  bgColor: string;
}

const CATEGORIES: SwimlaneCategory[] = [
  {
    type: 'hackathon',
    title: 'Hackathons',
    icon: 'code-slash',
    color: '#6366F1',
    bgColor: '#EEF2FF',
  },
  {
    type: 'ctf',
    title: 'CTFs',
    icon: 'shield-checkmark',
    color: '#F43F5E',
    bgColor: '#FFF1F2',
  },
  {
    type: 'meetup',
    title: 'Meetups',
    icon: 'people',
    color: '#10B981',
    bgColor: '#ECFDF5',
  },
  {
    type: 'workshop',
    title: 'Workshops',
    icon: 'school',
    color: '#0EA5E9',
    bgColor: '#F0F9FF',
  },
  {
    type: 'deadline',
    title: 'Deadlines',
    icon: 'alarm',
    color: '#F59E0B',
    bgColor: '#FFFBEB',
  },
  {
    type: 'other',
    title: 'Other',
    icon: 'calendar',
    color: '#64748B',
    bgColor: '#F8FAFC',
  },
];

export const TimelineGrid: React.FC<TimelineGridProps> = ({
  events,
  onSelectEvent,
  onViewAllPress,
}) => {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [currentOffset, setCurrentOffset] = useState<number>(0);

  const isMobile = screenWidth < 768;
  const CELL_WIDTH = isMobile ? 54 : 64;
  const HEADER_LABEL_WIDTH = isMobile ? 95 : 170;
  const DAY_COUNT = isMobile ? 12 : 18;

  // Generate consecutive days for the timeline
  const timelineDays = useMemo(() => {
    const list: {
      date: Date;
      iso: string;
      dayNum: number;
      dayName: string;
      isWeekend: boolean;
      isToday: boolean;
    }[] = [];

    const base = new Date();
    base.setDate(base.getDate() - 1 + currentOffset * 7);

    for (let i = 0; i < DAY_COUNT; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const iso = getTodayISODate(d);
      const dayOfWeek = d.getDay();

      list.push({
        date: d,
        iso,
        dayNum: d.getDate(),
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isToday: iso === getTodayISODate(),
      });
    }

    return list;
  }, [currentOffset, DAY_COUNT]);

  const getEventPosition = (
    startDateStr: string | null,
    endDateStr: string | null,
  ) => {
    if (!startDateStr) return null;

    const startIndex = timelineDays.findIndex((d) => d.iso === startDateStr);
    if (startIndex === -1) return null;

    let spanDays = 1;
    if (endDateStr) {
      const endIndex = timelineDays.findIndex((d) => d.iso === endDateStr);
      if (endIndex >= startIndex) {
        spanDays = Math.max(1, endIndex - startIndex + 1);
      }
    }

    return {
      left: startIndex * CELL_WIDTH,
      width: Math.min(spanDays * CELL_WIDTH - 4, CELL_WIDTH * 4),
    };
  };

  const visibleCategories = useMemo(() => {
    const cats = CATEGORIES.filter((category) => {
      return events.some((e) => {
        if (e.status === 'skipped') return false;
        if (category.type === 'deadline') {
          return e.type === 'deadline' || !!e.registration_deadline;
        }
        return e.type === category.type;
      });
    });
    return cats.length > 0 ? cats : CATEGORIES.slice(0, 3);
  }, [events]);

  return (
    <View style={styles.cardContainer}>
      {/* Header Bar */}
      <View style={styles.topHeader}>
        <View style={styles.titleGroup}>
          <Text style={styles.sectionTitle}>Timeline Matrix</Text>
          <Text style={styles.sectionSubtitle}>Tap any event bar to view details</Text>
        </View>

        <View style={styles.controlsRow}>
          <View style={styles.navArrowGroup}>
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={() => setCurrentOffset((prev) => prev - 1)}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={14} color="#475569" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.arrowBtn, styles.todayBtn]}
              onPress={() => setCurrentOffset(0)}
              activeOpacity={0.7}
            >
              <Text style={styles.todayBtnText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={() => setCurrentOffset((prev) => prev + 1)}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-forward" size={14} color="#475569" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Gantt Scroll Container */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.timelineScrollContent}
      >
        <View style={styles.gridContainer}>
          {/* Day Headers Row */}
          <View style={styles.gridHeaderRow}>
            <View style={[styles.headerCategorySpacer, { width: HEADER_LABEL_WIDTH }]} />

            {timelineDays.map((day) => (
              <View
                key={day.iso}
                style={[
                  styles.dayColumnHeader,
                  { width: CELL_WIDTH },
                  day.isWeekend && styles.weekendHeader,
                  day.isToday && styles.todayColumnHeader,
                ]}
              >
                <Text
                  style={[
                    styles.dayNameText,
                    day.isToday && styles.todayDayName,
                    day.isWeekend && styles.weekendText,
                  ]}
                >
                  {day.dayName}
                </Text>

                <View
                  style={[
                    styles.dayNumBubble,
                    day.isToday && styles.todayDayNumBubble,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumText,
                      day.isToday && styles.todayDayNumText,
                    ]}
                  >
                    {day.dayNum}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Category Swimlanes */}
          {visibleCategories.map((category) => {
            const categoryEvents = events.filter((e) => {
              if (e.status === 'skipped') return false;
              if (category.type === 'deadline') {
                return e.type === 'deadline' || !!e.registration_deadline;
              }
              return e.type === category.type;
            });

            return (
              <View key={category.type} style={styles.swimlaneRow}>
                {/* Left Category Label */}
                <View style={[styles.swimlaneLabel, { width: HEADER_LABEL_WIDTH }]}>
                  <View
                    style={[
                      styles.categoryIconWrap,
                      { backgroundColor: category.bgColor },
                    ]}
                  >
                    <Ionicons
                      name={category.icon as any}
                      size={13}
                      color={category.color}
                    />
                  </View>
                  <Text style={styles.swimlaneTitle} numberOfLines={1}>
                    {category.title}
                  </Text>
                </View>

                {/* Day Track Cells */}
                <View style={styles.trackCellsWrapper}>
                  {timelineDays.map((day) => (
                    <View
                      key={day.iso}
                      style={[
                        styles.trackCell,
                        { width: CELL_WIDTH },
                        day.isWeekend && styles.weekendCell,
                        day.isToday && styles.todayTrackCell,
                      ]}
                    />
                  ))}

                  {/* Render Event Pills */}
                  {categoryEvents.map((evt) => {
                    const targetStart =
                      category.type === 'deadline'
                        ? evt.registration_deadline || evt.event_start_date
                        : evt.event_start_date;
                    const targetEnd =
                      category.type === 'deadline'
                        ? evt.registration_deadline
                        : evt.event_end_date || evt.event_start_date;

                    const pos = getEventPosition(targetStart, targetEnd);
                    if (!pos) return null;

                    const typeConfig = EVENT_TYPE_CONFIG[evt.type] || EVENT_TYPE_CONFIG.other;

                    return (
                      <TouchableOpacity
                        key={evt.id}
                        style={[
                          styles.eventPill,
                          {
                            left: pos.left + 2,
                            width: pos.width,
                            backgroundColor: typeConfig.badgeBg,
                            borderColor: typeConfig.accentColor,
                          },
                        ]}
                        onPress={() =>
                          onSelectEvent
                            ? onSelectEvent(evt)
                            : router.push(`/event/${evt.id}` as any)
                        }
                        activeOpacity={0.88}
                      >
                        <View
                          style={[
                            styles.eventPillDot,
                            { backgroundColor: typeConfig.accentColor },
                          ]}
                        />
                        <Text
                          style={[
                            styles.eventPillText,
                            { color: typeConfig.badgeText },
                          ]}
                          numberOfLines={1}
                        >
                          {evt.title}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {/* Empty State */}
          {events.filter((e) => e.status !== 'skipped').length === 0 && (
            <View style={styles.emptyGridState}>
              <Ionicons name="sparkles" size={24} color="#6366F1" />
              <Text style={styles.emptyGridTitle}>No Events On Timeline</Text>
              <Text style={styles.emptyGridSub}>
                Paste any WhatsApp text to see real-time timeline tracks.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.85)',
    ...THEME_DESIGN.shadows.card,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleGroup: {
    gap: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navArrowGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  arrowBtn: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 8,
  },
  todayBtn: {
    backgroundColor: '#FFFFFF',
  },
  todayBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  timelineScrollContent: {
    paddingBottom: 4,
  },
  gridContainer: {
    flexDirection: 'column',
  },
  gridHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  headerCategorySpacer: {
    paddingRight: 6,
  },
  dayColumnHeader: {
    alignItems: 'center',
    gap: 3,
  },
  todayColumnHeader: {},
  weekendHeader: {
    opacity: 0.6,
  },
  dayNameText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  todayDayName: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  weekendText: {
    color: '#CBD5E1',
  },
  dayNumBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayDayNumBubble: {
    backgroundColor: '#4F46E5',
  },
  dayNumText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  todayDayNumText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  swimlaneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#F8FAFC',
    minHeight: 44,
  },
  swimlaneLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 6,
  },
  categoryIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swimlaneTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  trackCellsWrapper: {
    flexDirection: 'row',
    position: 'relative',
    alignItems: 'center',
  },
  trackCell: {
    height: 32,
    borderRightWidth: 1,
    borderColor: '#F8FAFC',
  },
  weekendCell: {
    backgroundColor: 'rgba(248, 250, 252, 0.6)',
  },
  todayTrackCell: {
    backgroundColor: 'rgba(238, 242, 255, 0.4)',
  },
  eventPill: {
    position: 'absolute',
    height: 26,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 4,
    borderWidth: 1,
    zIndex: 2,
    ...THEME_DESIGN.shadows.card,
  },
  eventPillDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  eventPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  emptyGridState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 6,
  },
  emptyGridTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  emptyGridSub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 260,
  },
});
