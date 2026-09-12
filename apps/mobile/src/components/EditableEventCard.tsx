import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ExtractedEvent,
  EventType,
  EventMode,
  EVENT_TYPE_CONFIG,
  EVENT_MODE_CONFIG,
  CONFIDENCE_LOW_THRESHOLD,
  validateEventForSave,
  THEME_DESIGN,
} from '@eventpulse/shared';
import { ConfidenceBadge } from './ConfidenceBadge';
import { colors, radii, shadows } from '../theme/tokens';
import { DatePickerModal } from './ui/DatePickerModal';
import { TimePickerModal } from './ui/TimePickerModal';
import { formatTime12Hour } from '@eventpulse/shared';

interface EditableEventCardProps {
  event: ExtractedEvent;
  index: number;
  total: number;
  onUpdate: (updated: ExtractedEvent) => void;
  onDelete: () => void;
  onSaveSingle: () => void;
  isSaving?: boolean;
}

const EVENT_TYPES: EventType[] = ['hackathon', 'ctf', 'meetup', 'workshop', 'deadline', 'other'];
const EVENT_MODES: EventMode[] = ['online', 'offline', 'hybrid'];

export const EditableEventCard: React.FC<EditableEventCardProps> = ({
  event,
  index,
  total,
  onUpdate,
  onDelete,
  onSaveSingle,
  isSaving = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeDatePicker, setActiveDatePicker] = useState<{
    field: 'event_start_date' | 'event_end_date' | 'registration_deadline';
    title: string;
  } | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const issues = validateEventForSave(event);
  const hasErrors = issues.some((i) => i.severity === 'error');
  const isMissingDates = !event.event_start_date && !event.registration_deadline;

  const handleChange = (field: keyof ExtractedEvent, value: any) => {
    onUpdate({
      ...event,
      [field]: value,
    });
  };

  return (
    <View style={[styles.card, hasErrors && styles.cardErrorBorder]}>
      {/* Header Bar */}
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.indexBadge}>
            <Text style={styles.indexText}>#{index + 1}</Text>
          </View>
          <ConfidenceBadge score={event.confidence_score} />
          {event.duplicate_warning?.is_duplicate && (
            <View style={styles.duplicateBadge}>
              <Ionicons name="copy-outline" size={11} color="#D97706" style={{ marginRight: 3 }} />
              <Text style={styles.duplicateText}>Possible Duplicate</Text>
            </View>
          )}
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setIsExpanded((prev) => !prev)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#64748B" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, styles.deleteBtn]}
            onPress={onDelete}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={15} color="#E11D48" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Missing Dates Alert */}
      {isMissingDates && (
        <View style={styles.missingDateBanner}>
          <Ionicons name="alert-circle" size={16} color="#E11D48" />
          <Text style={styles.missingDateText}>
            Dates missing. Please specify the Event Date or Registration Deadline below.
          </Text>
        </View>
      )}

      {isExpanded && (
        <View style={styles.cardBody}>
          {/* Title Input */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>EVENT TITLE *</Text>
            <TextInput
              style={styles.input}
              value={event.title}
              onChangeText={(t) => handleChange('title', t)}
              placeholder="e.g. HackNITR 6.0 Hackathon"
              placeholderTextColor="#94A3B8"
            />
          </View>

          {/* Event Type Selector */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              {EVENT_TYPES.map((type) => {
                const isSelected = event.type === type;
                const conf = EVENT_TYPE_CONFIG[type] || EVENT_TYPE_CONFIG.other;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typePill,
                      isSelected && { backgroundColor: conf.badgeBg, borderColor: conf.accentColor },
                    ]}
                    onPress={() => handleChange('type', type)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={conf.icon as any}
                      size={12}
                      color={isSelected ? conf.badgeText : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.typePillText,
                        isSelected && { color: conf.badgeText, fontWeight: '700' },
                      ]}
                    >
                      {conf.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Event Mode Selector */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>MODE</Text>
            <View style={styles.pillRow}>
              {EVENT_MODES.map((mode) => {
                const isSelected = event.mode === mode;
                const conf = EVENT_MODE_CONFIG[mode];
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.modePill,
                      isSelected && styles.modePillSelected,
                    ]}
                    onPress={() => handleChange('mode', mode)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={conf?.icon as any || 'globe-outline'}
                      size={12}
                      color={isSelected ? '#4F46E5' : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.modePillText,
                        isSelected && styles.modePillTextSelected,
                      ]}
                    >
                      {conf?.label || mode}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Date & Time Grid */}
          <View style={styles.rowTwoCols}>
            <View style={styles.colField}>
              <Text style={styles.fieldLabel}>START DATE</Text>
              <View style={styles.inputWithIconRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={event.event_start_date || ''}
                  onChangeText={(t) => handleChange('event_start_date', t || null)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94A3B8"
                  maxLength={10}
                />
                <TouchableOpacity
                  style={styles.inputIconBtn}
                  onPress={() =>
                    setActiveDatePicker({
                      field: 'event_start_date',
                      title: 'Event Start Date',
                    })
                  }
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.colField}>
              <Text style={styles.fieldLabel}>END DATE</Text>
              <View style={styles.inputWithIconRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={event.event_end_date || ''}
                  onChangeText={(t) => handleChange('event_end_date', t || null)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94A3B8"
                  maxLength={10}
                />
                <TouchableOpacity
                  style={styles.inputIconBtn}
                  onPress={() =>
                    setActiveDatePicker({
                      field: 'event_end_date',
                      title: 'Event End Date',
                    })
                  }
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.rowTwoCols}>
            <View style={styles.colField}>
              <Text style={styles.fieldLabel}>REG. DEADLINE</Text>
              <View style={styles.inputWithIconRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={event.registration_deadline || ''}
                  onChangeText={(t) => handleChange('registration_deadline', t || null)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94A3B8"
                  maxLength={10}
                />
                <TouchableOpacity
                  style={styles.inputIconBtn}
                  onPress={() =>
                    setActiveDatePicker({
                      field: 'registration_deadline',
                      title: 'Registration Deadline',
                    })
                  }
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.colField}>
              <Text style={styles.fieldLabel}>TIME (12-HOUR)</Text>
              <View style={styles.inputWithIconRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={event.time ? formatTime12Hour(event.time) : ''}
                  onChangeText={(t) => handleChange('time', t || null)}
                  placeholder="10:00 AM"
                  placeholderTextColor="#94A3B8"
                  maxLength={12}
                />
                <TouchableOpacity
                  style={styles.inputIconBtn}
                  onPress={() => setShowTimePicker(true)}
                >
                  <Ionicons name="time-outline" size={16} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Location & Link */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>LOCATION / VENUE</Text>
            <TextInput
              style={styles.input}
              value={event.location || ''}
              onChangeText={(t) => handleChange('location', t || null)}
              placeholder="e.g. NIT Rourkela or Discord"
              placeholderTextColor="#94A3B8"
              maxLength={300}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>REGISTRATION / DEVPOST LINK</Text>
            <TextInput
              style={styles.input}
              value={event.registration_link || ''}
              onChangeText={(t) => handleChange('registration_link', t || null)}
              placeholder="https://hacknitr.devfolio.co"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              maxLength={1000}
            />
          </View>

          {/* Save Single Button */}
          {total > 1 && (
            <TouchableOpacity
              style={styles.saveSingleBtn}
              onPress={onSaveSingle}
              disabled={isSaving}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-circle-outline" size={15} color="#4F46E5" />
              <Text style={styles.saveSingleText}>Save this event only</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Date Picker Modal */}
      <DatePickerModal
        visible={activeDatePicker !== null}
        title={activeDatePicker?.title || 'Select Date'}
        initialDate={activeDatePicker ? (event[activeDatePicker.field] as string | null) : null}
        onSelect={(dateStr) => {
          if (activeDatePicker) {
            handleChange(activeDatePicker.field, dateStr);
          }
        }}
        onClose={() => setActiveDatePicker(null)}
      />

      {/* Time Picker Modal (12-Hour Clock) */}
      <TimePickerModal
        visible={showTimePicker}
        title="Select Event Time"
        initialTime={event.time}
        onSelect={(timeStr) => handleChange('time', timeStr)}
        onClose={() => setShowTimePicker(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.card,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.card,
  },
  cardErrorBorder: {
    borderColor: colors.danger,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  indexBadge: {
    backgroundColor: colors.canvasSubtle,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  indexText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  duplicateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  duplicateText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.warning,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.control,
    backgroundColor: colors.canvasSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  deleteBtn: {
    backgroundColor: colors.dangerLight,
    borderColor: 'rgba(220, 38, 38, 0.2)',
  },
  missingDateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerLight,
    borderRadius: radii.control,
    padding: 10,
    gap: 8,
    marginTop: 12,
  },
  missingDateText: {
    fontSize: 11,
    color: colors.danger,
    fontWeight: '600',
    flex: 1,
  },
  cardBody: {
    marginTop: 14,
    gap: 12,
  },
  fieldGroup: {
    gap: 5,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.canvasSubtle,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 6,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.control,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    gap: 5,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.control,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    gap: 5,
  },
  modePillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modePillTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  rowTwoCols: {
    flexDirection: 'row',
    gap: 10,
  },
  colField: {
    flex: 1,
    gap: 5,
  },
  inputWithIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.canvasSubtle,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingRight: 6,
  },
  inputIconBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  saveSingleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvasSubtle,
    paddingVertical: 9,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    gap: 6,
    marginTop: 4,
  },
  saveSingleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
