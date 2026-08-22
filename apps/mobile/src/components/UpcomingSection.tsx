import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CalendarEvent, formatFriendlyDate, getUrgencyInfo } from '@eventpulse/shared';
import { TypeBadge } from './TypeBadge';

interface UpcomingSectionProps {
  events: CalendarEvent[];
}

export const UpcomingSection: React.FC<UpcomingSectionProps> = ({ events }) => {
  const router = useRouter();

  if (!events || events.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Ionicons name="sparkles" size={20} color="#6366F1" style={{ marginBottom: 6 }} />
        <Text style={styles.emptyTitle}>No events or deadlines this week</Text>
        <Text style={styles.emptySubtitle}>
          Paste any tech event WhatsApp message to extract and track deadlines.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.pulseDot} />
          <Text style={styles.sectionTitle}>Upcoming This Week</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{events.length}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalScroll}
      >
        {events.map((event) => {
          const urgency = getUrgencyInfo(event);
          const isCritical = urgency.urgencyLevel === 'critical' || urgency.urgencyLevel === 'high';

          return (
            <TouchableOpacity
              key={event.id}
              style={[styles.upcomingCard, isCritical && styles.upcomingCardUrgent]}
              activeOpacity={0.85}
              onPress={() => router.push(`/event/${event.id}`)}
            >
              <View style={styles.cardTop}>
                <TypeBadge type={event.type} size="sm" />
                <View
                  style={[
                    styles.urgencyPill,
                    urgency.urgencyLevel === 'critical'
                      ? styles.pillCritical
                      : urgency.urgencyLevel === 'high'
                      ? styles.pillHigh
                      : styles.pillNormal,
                  ]}
                >
                  <Text style={styles.urgencyPillText}>{urgency.label}</Text>
                </View>
              </View>

              <Text style={styles.cardTitle} numberOfLines={2}>
                {event.title}
              </Text>

              <View style={styles.cardBottom}>
                {event.registration_deadline ? (
                  <View style={styles.dateRow}>
                    <Ionicons name="alarm" size={11} color="#F59E0B" />
                    <Text style={styles.dateText}>
                      Reg: {formatFriendlyDate(event.registration_deadline, false)}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.dateRow}>
                    <Ionicons name="calendar" size={11} color="#38BDF8" />
                    <Text style={styles.dateText}>
                      {formatFriendlyDate(event.event_start_date, false)}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6366F1',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: -0.2,
  },
  countBadge: {
    backgroundColor: '#1E1B4B',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4338CA',
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A5B4FC',
  },
  horizontalScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  upcomingCard: {
    width: 210,
    backgroundColor: '#131C31',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'space-between',
  },
  upcomingCardUrgent: {
    borderColor: '#F59E0B70',
    backgroundColor: '#1A1828',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  urgencyPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pillCritical: {
    backgroundColor: '#991B1B',
  },
  pillHigh: {
    backgroundColor: '#854D0E',
  },
  pillNormal: {
    backgroundColor: '#1E293B',
  },
  urgencyPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F1F5F9',
    lineHeight: 18,
    marginBottom: 8,
  },
  cardBottom: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: 6,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  emptyCard: {
    marginHorizontal: 16,
    marginVertical: 10,
    padding: 16,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 2,
  },
  emptySubtitle: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
  },
});
