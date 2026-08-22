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

interface DeadlinesWidgetProps {
  events: CalendarEvent[];
}

export const DeadlinesWidget: React.FC<DeadlinesWidgetProps> = ({ events }) => {
  const router = useRouter();

  // Find events with upcoming (today or future) registration deadlines
  const deadlineItems = useMemo(() => {
    return events
      .filter((e) => {
        if (e.status === 'skipped') return false;
        // Must have a registration deadline that is today or in the future
        if (!e.registration_deadline) return false;
        return getDaysDifference(e.registration_deadline) >= 0;
      })
      .sort((a, b) => {
        // Sort by soonest deadline first
        return (a.registration_deadline || '').localeCompare(b.registration_deadline || '');
      })
      .slice(0, 4);
  }, [events]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>Active Deadlines</Text>
        <TouchableOpacity
          style={styles.viewAllBtn}
          onPress={() => router.push('/calendar')}
        >
          <Ionicons name="open-outline" size={14} color="#64748B" />
          <Text style={styles.viewAllText}>View all</Text>
        </TouchableOpacity>
      </View>

      {/* 2x2 Grid of Deadline Cards */}
      <View style={styles.grid}>
        {deadlineItems.length > 0 ? (
          deadlineItems.map((event) => {
            const daysLeft = getDaysDifference(event.registration_deadline!);
            const isCritical = daysLeft <= 1;
            const isHigh = daysLeft <= 3;
            const conf = EVENT_TYPE_CONFIG[event.type] || EVENT_TYPE_CONFIG.other;

            return (
              <TouchableOpacity
                key={event.id}
                style={styles.deadlineCard}
                activeOpacity={0.8}
                onPress={() => router.push(`/event/${event.id}`)}
              >
                {/* Avatar Icon */}
                <View style={[styles.avatarCircle, { backgroundColor: conf.accentColor }]}>
                  <Ionicons name={conf.icon as any} size={16} color="#FFFFFF" />
                </View>

                <Text style={styles.cardTitle} numberOfLines={1}>
                  {event.title}
                </Text>
                <Text style={styles.cardSubtitle} numberOfLines={1}>
                  {formatFriendlyDate(event.registration_deadline, false)}
                </Text>

                {/* Urgency Pill */}
                <View
                  style={[
                    styles.urgencyPill,
                    isCritical && styles.urgencyPillCritical,
                    !isCritical && isHigh && styles.urgencyPillHigh,
                  ]}
                >
                  <Ionicons
                    name={isCritical ? 'flame' : isHigh ? 'warning-outline' : 'time-outline'}
                    size={11}
                    color={isCritical ? '#DC2626' : isHigh ? '#D97706' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.urgencyText,
                      isCritical && styles.urgencyTextCritical,
                      !isCritical && isHigh && styles.urgencyTextHigh,
                    ]}
                  >
                    {daysLeft === 0
                      ? 'Due Today!'
                      : daysLeft === 1
                      ? 'Due Tomorrow'
                      : `${daysLeft}d left`}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-circle-outline" size={32} color="#10B981" />
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptySubtitle}>No upcoming deadlines</Text>
          </View>
        )}
      </View>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  deadlineCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 14,
    width: '47%',
    minWidth: 120,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 10,
  },
  urgencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  urgencyPillCritical: {
    backgroundColor: '#FEE2E2',
  },
  urgencyPillHigh: {
    backgroundColor: '#FEF3C7',
  },
  urgencyText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  urgencyTextCritical: {
    color: '#DC2626',
    fontWeight: '700',
  },
  urgencyTextHigh: {
    color: '#D97706',
    fontWeight: '700',
  },
  emptyCard: {
    width: '100%',
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
});
