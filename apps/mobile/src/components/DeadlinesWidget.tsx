import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  CalendarEvent,
  formatFriendlyDate,
  getDaysDifference,
  EVENT_TYPE_CONFIG,
  THEME_DESIGN,
} from '@eventpulse/shared';

interface DeadlinesWidgetProps {
  events: CalendarEvent[];
}

export const DeadlinesWidget: React.FC<DeadlinesWidgetProps> = ({ events }) => {
  const router = useRouter();

  const deadlineItems = useMemo(() => {
    return events
      .filter((e) => {
        if (e.status === 'skipped') return false;
        if (!e.registration_deadline) return false;
        return getDaysDifference(e.registration_deadline) >= 0;
      })
      .sort((a, b) => {
        return (a.registration_deadline || '').localeCompare(b.registration_deadline || '');
      })
      .slice(0, 4);
  }, [events]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleGroup}>
          <View style={styles.iconCircle}>
            <Ionicons name="alarm-outline" size={15} color="#F59E0B" />
          </View>
          <Text style={styles.title}>Active Deadlines</Text>
        </View>

        <TouchableOpacity
          style={styles.viewAllBtn}
          onPress={() => router.push('/calendar')}
          activeOpacity={0.75}
        >
          <Text style={styles.viewAllText}>View all</Text>
          <Ionicons name="chevron-forward" size={13} color="#F59E0B" />
        </TouchableOpacity>
      </View>

      {/* Grid of Deadline Cards */}
      {deadlineItems.length > 0 ? (
        <View style={styles.grid}>
          {deadlineItems.map((event) => {
            const daysLeft = getDaysDifference(event.registration_deadline!);
            const isCritical = daysLeft <= 1;
            const isHigh = daysLeft <= 3;
            const conf = EVENT_TYPE_CONFIG[event.type] || EVENT_TYPE_CONFIG.other;

            return (
              <TouchableOpacity
                key={event.id}
                style={[
                  styles.deadlineCard,
                  isCritical && styles.criticalBorder,
                ]}
                activeOpacity={0.88}
                onPress={() => router.push(`/event/${event.id}`)}
              >
                <View style={styles.cardHeader}>
                  <View
                    style={[
                      styles.avatarCircle,
                      { backgroundColor: conf.badgeBg },
                    ]}
                  >
                    <Ionicons
                      name={conf.icon as any}
                      size={14}
                      color={conf.accentColor}
                    />
                  </View>

                  <View
                    style={[
                      styles.urgencyPill,
                      isCritical && styles.urgencyPillCritical,
                      !isCritical && isHigh && styles.urgencyPillHigh,
                    ]}
                  >
                    <Text
                      style={[
                        styles.urgencyText,
                        isCritical && styles.urgencyTextCritical,
                        !isCritical && isHigh && styles.urgencyTextHigh,
                      ]}
                    >
                      {daysLeft === 0
                        ? 'DUE TODAY 🚨'
                        : daysLeft === 1
                        ? 'TOMORROW ⚠️'
                        : `IN ${daysLeft} DAYS`}
                    </Text>
                  </View>
                </View>

                <Text style={styles.cardTitle} numberOfLines={1}>
                  {event.title}
                </Text>

                <View style={styles.dateRow}>
                  <Ionicons name="calendar-outline" size={11} color="#94A3B8" />
                  <Text style={styles.cardSubtitle} numberOfLines={1}>
                    Deadline: {formatFriendlyDate(event.registration_deadline, false)}
                  </Text>
                </View>

                {event.registration_link && (
                  <TouchableOpacity
                    style={styles.applyBtn}
                    onPress={() => Linking.openURL(event.registration_link!)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.applyBtnText}>Register Now</Text>
                    <Ionicons name="arrow-forward" size={11} color="#4F46E5" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="shield-checkmark-outline" size={32} color="#10B981" />
          <Text style={styles.emptyTitle}>All Caught Up!</Text>
          <Text style={styles.emptySubtitle}>
            No urgent registration deadlines due in the next 7 days.
          </Text>
        </View>
      )}
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
    backgroundColor: '#FFFBEB',
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
    color: '#D97706',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  deadlineCard: {
    flex: 1,
    minWidth: 130,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  criticalBorder: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  avatarCircle: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgencyPill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  urgencyPillCritical: {
    backgroundColor: '#FEE2E2',
  },
  urgencyPillHigh: {
    backgroundColor: '#FEF3C7',
  },
  urgencyText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  urgencyTextCritical: {
    color: '#DC2626',
  },
  urgencyTextHigh: {
    color: '#B45309',
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 16,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardSubtitle: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 4,
    gap: 4,
  },
  applyBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4F46E5',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 16,
  },
});
