import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  CalendarEvent,
  formatFriendlyDate,
  getDaysDifference,
  EVENT_TYPE_CONFIG,
} from '@eventpulse/shared';

interface FutureEventsWidgetProps {
  events: CalendarEvent[];
}

export const FutureEventsWidget: React.FC<FutureEventsWidgetProps> = ({ events }) => {
  const router = useRouter();

  // Sort by soonest upcoming event start date, skip past events
  const upcomingEvents = useMemo(() => {
    return events
      .filter((e) => {
        if (e.status === 'skipped') return false;
        const targetDate = e.event_start_date || e.registration_deadline;
        if (!targetDate) return false;
        return getDaysDifference(targetDate) >= 0;
      })
      .sort((a, b) => {
        const aDate = a.event_start_date || a.registration_deadline || '';
        const bDate = b.event_start_date || b.registration_deadline || '';
        return aDate.localeCompare(bDate);
      })
      .slice(0, 3);
  }, [events]);

  const featured = upcomingEvents[0];
  const rest = upcomingEvents.slice(1);

  const formatTime = (time: string | null): string => {
    if (!time) return 'All Day';
    // Convert 24h "14:00" to "2:00 PM"
    const [h, m] = time.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return time;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const getDaysLabel = (event: CalendarEvent): string => {
    const targetDate = event.event_start_date || event.registration_deadline;
    if (!targetDate) return '';
    const diff = getDaysDifference(targetDate);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return `In ${diff} days`;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>Upcoming Events</Text>
        <TouchableOpacity
          style={styles.viewAllBtn}
          onPress={() => router.push('/calendar')}
        >
          <Ionicons name="open-outline" size={14} color="#64748B" />
          <Text style={styles.viewAllText}>View all</Text>
        </TouchableOpacity>
      </View>

      {/* Featured Highlight Card */}
      {featured ? (
        <TouchableOpacity
          style={styles.featuredCard}
          activeOpacity={0.9}
          onPress={() => router.push(`/event/${featured.id}`)}
        >
          <View style={styles.featuredTopRow}>
            <View style={styles.featuredTitleGroup}>
              <Text style={styles.featuredTitle} numberOfLines={2}>
                {featured.title}
              </Text>
              <Text style={styles.featuredSubtitle} numberOfLines={1}>
                {featured.location || EVENT_TYPE_CONFIG[featured.type]?.label || 'Event'}
                {featured.mode !== 'online' ? '' : ' • Online'}
              </Text>
            </View>

            <View style={styles.featuredCountdownBadge}>
              <Text style={styles.featuredCountdownText}>
                {getDaysLabel(featured)}
              </Text>
            </View>
          </View>

          <View style={styles.featuredBottomRow}>
            <View style={styles.timePill}>
              <Ionicons name="time-outline" size={13} color="#78350F" />
              <Text style={styles.timePillText}>{formatTime(featured.time)}</Text>
            </View>

            <View style={styles.datePill}>
              <Ionicons name="calendar-outline" size={13} color="#78350F" />
              <Text style={styles.datePillText}>
                {featured.event_start_date
                  ? formatFriendlyDate(featured.event_start_date, false)
                  : 'Date TBD'}
              </Text>
            </View>

            {featured.mode && (
              <View style={styles.modePill}>
                <Ionicons
                  name={featured.mode === 'online' ? 'globe-outline' : 'location-outline'}
                  size={12}
                  color="#78350F"
                />
                <Text style={styles.modePillText}>
                  {featured.mode.charAt(0).toUpperCase() + featured.mode.slice(1)}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.emptyFeatured}>
          <Ionicons name="calendar-outline" size={28} color="#94A3B8" />
          <Text style={styles.emptyText}>No upcoming events scheduled</Text>
        </View>
      )}

      {/* Secondary Cards */}
      {rest.map((event) => {
        const conf = EVENT_TYPE_CONFIG[event.type] || EVENT_TYPE_CONFIG.other;
        return (
          <TouchableOpacity
            key={event.id}
            style={styles.secondaryCard}
            activeOpacity={0.8}
            onPress={() => router.push(`/event/${event.id}`)}
          >
            <View style={styles.secondaryTopRow}>
              <View style={[styles.typeIndicator, { backgroundColor: conf.accentColor }]} />
              <View style={styles.secondaryTextGroup}>
                <Text style={styles.secondaryTitle} numberOfLines={1}>
                  {event.title}
                </Text>
                <Text style={styles.secondarySubtitle} numberOfLines={1}>
                  {event.source_group || event.location || conf.label}
                </Text>
              </View>
              <Text style={styles.secondaryDaysLabel}>{getDaysLabel(event)}</Text>
            </View>

            <View style={styles.secondaryBottomRow}>
              {event.time && (
                <View style={styles.secondaryTimePill}>
                  <Ionicons name="time-outline" size={12} color="#64748B" />
                  <Text style={styles.secondaryTimeText}>{formatTime(event.time)}</Text>
                </View>
              )}

              <View style={styles.secondaryDatePill}>
                <Ionicons name="calendar-outline" size={12} color="#64748B" />
                <Text style={styles.secondaryDateText}>
                  {event.event_start_date
                    ? formatFriendlyDate(event.event_start_date, false)
                    : 'Date TBD'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
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
    flex: 1,
    minWidth: 280,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  featuredCard: {
    backgroundColor: '#FDE047',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#CA8A04',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 2,
  },
  featuredTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  featuredTitleGroup: {
    flex: 1,
    marginRight: 8,
  },
  featuredTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#713F12',
  },
  featuredSubtitle: {
    fontSize: 12,
    color: '#854D0E',
    marginTop: 2,
  },
  featuredCountdownBadge: {
    backgroundColor: '#FEF08A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  featuredCountdownText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#854D0E',
  },
  featuredBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF08A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  timePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#713F12',
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF08A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  datePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#713F12',
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF08A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  modePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#713F12',
  },
  emptyFeatured: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  secondaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  secondaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeIndicator: {
    width: 4,
    height: 32,
    borderRadius: 2,
    marginRight: 10,
  },
  secondaryTextGroup: {
    flex: 1,
  },
  secondaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  secondarySubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  secondaryDaysLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  secondaryBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 14,
  },
  secondaryTimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  secondaryTimeText: {
    fontSize: 11,
    color: '#64748B',
  },
  secondaryDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  secondaryDateText: {
    fontSize: 11,
    color: '#64748B',
  },
});
