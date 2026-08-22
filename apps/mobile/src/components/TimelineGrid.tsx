import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  CalendarEvent,
  EventType,
  EVENT_TYPE_CONFIG,
  getTodayISODate,
  getDaysDifference,
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
    color: '#8B5CF6',
    bgColor: '#EDE9FE',
  },
  {
    type: 'ctf',
    title: 'CTF Challenges',
    icon: 'shield-checkmark',
    color: '#EF4444',
    bgColor: '#FEE2E2',
  },
  {
    type: 'meetup',
    title: 'Tech Meetups',
    icon: 'people',
    color: '#10B981',
    bgColor: '#D1FAE5',
  },
  {
    type: 'workshop',
    title: 'Workshops',
    icon: 'school',
    color: '#3B82F6',
    bgColor: '#DBEAFE',
  },
  {
    type: 'other',
    title: 'Other Events',
    icon: 'calendar',
    color: '#6B7280',
    bgColor: '#F3F4F6',
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
  const CELL_WIDTH = isMobile ? 48 : 54;
  const HEADER_LABEL_WIDTH = isMobile ? 140 : 210;
  const DAY_COUNT = isMobile ? 10 : 16;

  // Generate consecutive days for the Gantt timeline header
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
    base.setDate(base.getDate() - 2 + currentOffset * 7);

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
      width: Math.min(spanDays * CELL_WIDTH - 6, CELL_WIDTH * 5),
    };
  };

  // Only show categories that have events visible in timeline
  const visibleCategories = useMemo(() => {
    return CATEGORIES.filter((category) => {
      return events.some((e) => {
        if (e.status === 'skipped') return false;
        if (e.type !== category.type && category.type !== 'other') return false;
        if (category.type === 'other' && ['hackathon', 'ctf', 'meetup', 'workshop'].includes(e.type)) return false;
        return true;
      });
    });
  }, [events]);

  const todayIndex = timelineDays.findIndex((d) => d.isToday);

  return (
    <View style={styles.cardContainer}>
      {/* Top Bar */}
      <View style={styles.topHeader}>
        <View style={styles.titleGroup}>
          <Text style={styles.sectionTitle}>Schedule Timeline</Text>
          {!isMobile && (
            <Text style={styles.sectionSubtitle}>
              Your events across hackathons, meetups & deadlines
            </Text>
          )}
        </View>

        <View style={styles.controlsRow}>
          <View style={styles.navArrowGroup}>
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={() => setCurrentOffset((prev) => prev - 1)}
            >
              <Ionicons name="chevron-back" size={16} color="#64748B" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={() => {
                setCurrentOffset(0);
              }}
            >
              <Text style={styles.todayBtnText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={() => setCurrentOffset((prev) => prev + 1)}
            >
              <Ionicons name="chevron-forward" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          {onViewAllPress && (
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={onViewAllPress}
            >
              <Ionicons name="open-outline" size={14} color="#3B82F6" />
              <Text style={styles.viewAllText}>Calendar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Timeline Scroll Area */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.timelineScrollContent}
      >
        <View style={styles.gridContainer}>
          {/* Header Row (Day columns) */}
          <View style={styles.gridHeaderRow}>
            <View style={[styles.headerCategorySpacer, { width: HEADER_LABEL_WIDTH }]} />

            {timelineDays.map((day) => (
              <View
                key={day.iso}
                style={[
                  styles.dayColumnHeader,
                  { width: CELL_WIDTH },
                  day.isWeekend && styles.weekendHeader,
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

          {/* Swimlane Rows */}
          {visibleCategories.map((category) => {
            const categoryEvents = events.filter((e) => {
              if (e.status === 'skipped') return false;
              if (category.type === 'other') {
                return !['hackathon', 'ctf', 'meetup', 'workshop'].includes(e.type);
              }
              return e.type === category.type;
            });

            const activeCount = categoryEvents.filter((e) => {
              const d = e.event_start_date || e.registration_deadline;
              return d && getDaysDifference(d) >= 0;
            }).length;

            return (
              <View key={category.type} style={styles.swimlaneRow}>
                {/* Category Info Left */}
                <View style={[styles.categoryInfoCol, { width: HEADER_LABEL_WIDTH }]}>
                  <View style={[styles.categoryIconCircle, { backgroundColor: category.bgColor }]}>
                    <Ionicons name={category.icon as any} size={isMobile ? 14 : 18} color={category.color} />
                  </View>
                  <View style={styles.categoryTextWrapper}>
                    <Text style={styles.categoryTitle} numberOfLines={1}>{category.title}</Text>
                    <Text style={styles.categorySubtitle} numberOfLines={1}>
                      {activeCount} upcoming
                    </Text>
                  </View>
                </View>

                {/* Grid Cells Background */}
                <View style={styles.swimlaneCellsContainer}>
                  {timelineDays.map((day) => (
                    <View
                      key={day.iso}
                      style={[
                        styles.gridCell,
                        { width: CELL_WIDTH },
                        day.isWeekend && styles.weekendCell,
                        day.isToday && styles.todayCell,
                      ]}
                    />
                  ))}

                  {/* Render Event Pills */}
                  {categoryEvents.map((event) => {
                    const pos = getEventPosition(
                      event.event_start_date,
                      event.event_end_date,
                    );

                    if (!pos) return null;

                    return (
                      <TouchableOpacity
                        key={event.id}
                        style={[
                          styles.eventPill,
                          {
                            left: pos.left + 3,
                            width: Math.max(pos.width, isMobile ? 90 : 110),
                            backgroundColor: category.color,
                          },
                        ]}
                        activeOpacity={0.85}
                        onPress={() => {
                          if (onSelectEvent) onSelectEvent(event);
                          else router.push(`/event/${event.id}`);
                        }}
                      >
                        <Text
                          style={styles.eventPillTitle}
                          numberOfLines={1}
                        >
                          {event.title}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}

                  {/* Render Registration Deadline markers */}
                  {categoryEvents
                    .filter((e) => e.registration_deadline)
                    .map((event) => {
                      const dlIndex = timelineDays.findIndex(
                        (d) => d.iso === event.registration_deadline
                      );
                      if (dlIndex === -1) return null;

                      return (
                        <View
                          key={`dl_${event.id}`}
                          style={[
                            styles.deadlineMarker,
                            { left: dlIndex * CELL_WIDTH + CELL_WIDTH / 2 - 6 },
                          ]}
                        >
                          <Ionicons name="flag" size={12} color="#D97706" />
                        </View>
                      );
                    })}
                </View>
              </View>
            );
          })}

          {/* Empty state */}
          {visibleCategories.length === 0 && (
            <View style={styles.emptyTimeline}>
              <Ionicons name="calendar-outline" size={24} color="#94A3B8" />
              <Text style={styles.emptyTimelineText}>
                No events to display. Paste a WhatsApp message to get started!
              </Text>
            </View>
          )}

          {/* Today Vertical Indicator Line */}
          {todayIndex !== -1 && (
            <View
              style={[
                styles.todayVerticalLine,
                {
                  left: HEADER_LABEL_WIDTH + todayIndex * CELL_WIDTH + CELL_WIDTH / 2,
                },
              ]}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    marginVertical: 12,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    overflow: 'hidden',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  titleGroup: {
    flex: 1,
    minWidth: 150,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navArrowGroup: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  arrowBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 5,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  timelineScrollContent: {
    paddingBottom: 4,
  },
  gridContainer: {
    position: 'relative',
  },
  gridHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
  },
  headerCategorySpacer: {
    paddingLeft: 4,
  },
  dayColumnHeader: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekendHeader: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
  },
  dayNameText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 4,
  },
  todayDayName: {
    color: '#3B82F6',
    fontWeight: '700',
  },
  weekendText: {
    color: '#CBD5E1',
  },
  dayNumBubble: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayDayNumBubble: {
    backgroundColor: '#3B82F6',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  dayNumText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  todayDayNumText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  swimlaneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    minHeight: 60,
  },
  categoryInfoCol: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 8,
  },
  categoryIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  categoryTextWrapper: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  categorySubtitle: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  swimlaneCellsContainer: {
    flexDirection: 'row',
    position: 'relative',
    height: 60,
    alignItems: 'center',
  },
  gridCell: {
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: '#F8FAFC',
  },
  weekendCell: {
    backgroundColor: '#F8FAFC40',
  },
  todayCell: {
    backgroundColor: '#EFF6FF30',
  },
  eventPill: {
    position: 'absolute',
    height: 32,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    zIndex: 10,
  },
  eventPillTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
  },
  deadlineMarker: {
    position: 'absolute',
    top: 2,
    zIndex: 11,
  },
  todayVerticalLine: {
    position: 'absolute',
    top: 45,
    bottom: 0,
    width: 2,
    backgroundColor: '#3B82F6',
    zIndex: 5,
    opacity: 0.5,
  },
  emptyTimeline: {
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyTimelineText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
  },
});
