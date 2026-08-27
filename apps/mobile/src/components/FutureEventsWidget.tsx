import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  CalendarEvent,
  formatFriendlyDate,
  getDaysDifference,
  EVENT_TYPE_CONFIG,
  EVENT_MODE_CONFIG,
  THEME_DESIGN,
} from '@eventpulse/shared';

interface FutureEventsWidgetProps {
  events: CalendarEvent[];
}

export const FutureEventsWidget: React.FC<FutureEventsWidgetProps> = ({ events }) => {
  const router = useRouter();

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
    if (diff === 0) return 'TODAY';
    if (diff === 1) return 'TOMORROW';
    return `IN ${diff} DAYS`;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleGroup}>
          <View style={styles.iconCircle}>
            <Ionicons name="calendar-outline" size={15} color="#4F46E5" />
          </View>
          <Text style={styles.title}>Upcoming Events</Text>
        </View>

        <TouchableOpacity
          style={styles.viewAllBtn}
          onPress={() => router.push('/calendar')}
          activeOpacity={0.75}
        >
          <Text style={styles.viewAllText}>View all</Text>
          <Ionicons name="chevron-forward" size={13} color="#4F46E5" />
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
              <View style={styles.featuredBadgeRow}>
                <View
                  style={[
                    styles.typeBadge,
                    {
                      backgroundColor:
                        EVENT_TYPE_CONFIG[featured.type]?.badgeBg || '#EEF2FF',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.typeBadgeText,
                      {
                        color:
                          EVENT_TYPE_CONFIG[featured.type]?.badgeText || '#4F46E5',
                      },
                    ]}
                  >
                    {EVENT_TYPE_CONFIG[featured.type]?.label.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.featuredTitle} numberOfLines={2}>
                {featured.title}
              </Text>
            </View>

            <View style={styles.featuredCountdownBadge}>
              <Text style={styles.featuredCountdownText}>
                {getDaysLabel(featured)}
              </Text>
            </View>
          </View>

          <View style={styles.featuredBottomRow}>
            <View style={styles.pillItem}>
              <Ionicons name="time-outline" size={12} color="#475569" />
              <Text style={styles.pillText}>{formatTime(featured.time)}</Text>
            </View>

            <View style={styles.pillItem}>
              <Ionicons name="calendar-clear-outline" size={12} color="#475569" />
              <Text style={styles.pillText}>
                {formatFriendlyDate(featured.event_start_date, false)}
              </Text>
            </View>

            <View style={styles.pillItem}>
              <Ionicons
                name={
                  featured.mode === 'online'
                    ? 'globe-outline'
                    : 'location-outline'
                }
                size={12}
                color="#475569"
              />
              <Text style={styles.pillText}>
                {featured.location || (featured.mode === 'online' ? 'Online' : 'In-Person')}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.emptyFeatured}>
          <Ionicons name="calendar-outline" size={28} color="#94A3B8" />
          <Text style={styles.emptyText}>No upcoming events scheduled</Text>
          <TouchableOpacity
            style={styles.emptyAddBtn}
            onPress={() => router.push('/extract')}
            activeOpacity={0.8}
          >
            <Text style={styles.emptyAddBtnText}>+ Add via WhatsApp</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Secondary Items List */}
      {rest.map((evt) => {
        const typeConfig = EVENT_TYPE_CONFIG[evt.type] || EVENT_TYPE_CONFIG.other;
        return (
          <TouchableOpacity
            key={evt.id}
            style={styles.secondaryCard}
            onPress={() => router.push(`/event/${evt.id}`)}
            activeOpacity={0.85}
          >
            <View
              style={[
                styles.secondaryIconWrap,
                { backgroundColor: typeConfig.badgeBg },
              ]}
            >
              <Ionicons
                name={typeConfig.icon as any}
                size={16}
                color={typeConfig.accentColor}
              />
            </View>

            <View style={styles.secondaryContent}>
              <Text style={styles.secondaryTitle} numberOfLines={1}>
                {evt.title}
              </Text>
              <Text style={styles.secondaryDate}>
                {formatFriendlyDate(evt.event_start_date, false)} • {formatTime(evt.time)}
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 280,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.85)',
    ...THEME_DESIGN.shadows.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  featuredCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    gap: 12,
  },
  featuredTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  featuredTitleGroup: {
    flex: 1,
    gap: 5,
  },
  featuredBadgeRow: {
    flexDirection: 'row',
  },
  typeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  featuredTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 19,
  },
  featuredCountdownBadge: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    ...THEME_DESIGN.shadows.glow,
  },
  featuredCountdownText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  featuredBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  pillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  emptyFeatured: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  emptyAddBtn: {
    marginTop: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  emptyAddBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  secondaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginTop: 6,
    gap: 10,
  },
  secondaryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryContent: {
    flex: 1,
  },
  secondaryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  secondaryDate: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
});
