import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  CalendarEvent,
  formatFriendlyDate,
  getUrgencyInfo,
  EVENT_MODE_CONFIG,
} from '@eventpulse/shared';
import { TypeBadge } from './TypeBadge';

interface EventCardProps {
  event: CalendarEvent;
  onPress?: () => void;
  hasClash?: boolean;
}

export const EventCard: React.FC<EventCardProps> = ({ event, onPress, hasClash }) => {
  const router = useRouter();
  const urgency = getUrgencyInfo(event);
  const modeConfig = EVENT_MODE_CONFIG[event.mode] || EVENT_MODE_CONFIG.online;

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push(`/event/${event.id}`);
    }
  };

  const handleOpenLink = (e: any) => {
    e.stopPropagation();
    if (event.registration_link) {
      Linking.openURL(event.registration_link).catch((err) =>
        console.warn('Cannot open URL:', err)
      );
    }
  };

  const isUrgent =
    urgency.urgencyLevel === 'critical' || urgency.urgencyLevel === 'high';

  return (
    <TouchableOpacity
      style={[
        styles.card,
        hasClash && styles.clashBorder,
        isUrgent && styles.urgentCardBorder,
      ]}
      activeOpacity={0.85}
      onPress={handlePress}
    >
      {/* Top Meta Row */}
      <View style={styles.topRow}>
        <View style={styles.badgeRow}>
          <TypeBadge type={event.type} size="sm" />
          <View style={[styles.modeBadge, { backgroundColor: modeConfig.badgeBg }]}>
            <Ionicons
              name={modeConfig.icon as any}
              size={11}
              color={modeConfig.badgeText}
              style={{ marginRight: 3 }}
            />
            <Text style={[styles.modeText, { color: modeConfig.badgeText }]}>
              {modeConfig.label}
            </Text>
          </View>
        </View>

        {/* Urgency Pill */}
        <View
          style={[
            styles.urgencyPill,
            urgency.urgencyLevel === 'critical' && styles.urgencyCritical,
            urgency.urgencyLevel === 'high' && styles.urgencyHigh,
            urgency.urgencyLevel === 'passed' && styles.urgencyPassed,
          ]}
        >
          <Text
            style={[
              styles.urgencyText,
              (urgency.urgencyLevel === 'critical' ||
                urgency.urgencyLevel === 'high') &&
                styles.urgencyTextBright,
            ]}
          >
            {urgency.label}
          </Text>
        </View>
      </View>

      {/* Title */}
      <Text style={styles.title} numberOfLines={2}>
        {event.title}
      </Text>

      {/* Date & Deadline Breakdown */}
      <View style={styles.dateSection}>
        {event.registration_deadline && (
          <View style={styles.deadlineRow}>
            <View style={styles.deadlineIndicator}>
              <Ionicons name="alarm" size={13} color="#D97706" />
            </View>
            <View>
              <Text style={styles.dateLabel}>REGISTRATION DEADLINE</Text>
              <Text style={styles.deadlineDateText}>
                {formatFriendlyDate(event.registration_deadline)}
              </Text>
            </View>
          </View>
        )}

        {event.event_start_date && (
          <View style={styles.eventDateRow}>
            <View style={styles.eventDateIndicator}>
              <Ionicons name="calendar" size={13} color="#2563EB" />
            </View>
            <View>
              <Text style={styles.dateLabel}>EVENT DATE</Text>
              <Text style={styles.eventDateText}>
                {formatFriendlyDate(event.event_start_date)}
                {event.event_end_date
                  ? ` - ${formatFriendlyDate(event.event_end_date, false)}`
                  : ''}
                {event.time ? ` • ${event.time}` : ''}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Location / Source Group / Quick Link */}
      <View style={styles.footerRow}>
        <View style={styles.metaCol}>
          {event.location ? (
            <View style={styles.iconMeta}>
              <Ionicons name="location-outline" size={13} color="#64748B" />
              <Text style={styles.metaText} numberOfLines={1}>
                {event.location}
              </Text>
            </View>
          ) : event.source_group ? (
            <View style={styles.iconMeta}>
              <Ionicons name="chatbubbles-outline" size={13} color="#64748B" />
              <Text style={styles.metaText} numberOfLines={1}>
                {event.source_group}
              </Text>
            </View>
          ) : null}
        </View>

        {event.registration_link && (
          <TouchableOpacity
            style={styles.linkButton}
            onPress={handleOpenLink}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.linkButtonText}>Register</Text>
            <Ionicons name="open-outline" size={12} color="#3B82F6" />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  clashBorder: {
    borderColor: '#EF4444',
    borderWidth: 1.5,
  },
  urgentCardBorder: {
    borderColor: '#F59E0B',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  modeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  urgencyPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  urgencyCritical: {
    backgroundColor: '#FEE2E2',
  },
  urgencyHigh: {
    backgroundColor: '#FEF3C7',
  },
  urgencyPassed: {
    backgroundColor: '#F3F4F6',
  },
  urgencyText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  urgencyTextBright: {
    color: '#B91C1C',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 20,
    marginBottom: 10,
  },
  dateSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 10,
    gap: 8,
    marginBottom: 10,
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deadlineIndicator: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: '#64748B',
  },
  deadlineDateText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B45309',
  },
  eventDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventDateIndicator: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventDateText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E40AF',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaCol: {
    flex: 1,
    marginRight: 8,
  },
  iconMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#64748B',
    flexShrink: 1,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  linkButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
});
