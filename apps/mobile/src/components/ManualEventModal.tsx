import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEvents } from '../context/EventsContext';
import {
  EventType,
  EventMode,
  EVENT_TYPE_CONFIG,
  formatFriendlyDate,
} from '@eventpulse/shared';
import { colors, radii } from '../theme/tokens';
import { DatePickerModal } from './ui/DatePickerModal';
import { TimePickerModal } from './ui/TimePickerModal';

interface ManualEventModalProps {
  visible: boolean;
  onClose: () => void;
  onEventCreated?: (eventId: string) => void;
  initialDate?: string | null;
}

const EVENT_TYPES: EventType[] = [
  'hackathon',
  'workshop',
  'meetup',
  'ctf',
  'deadline',
  'other',
];

const EVENT_MODES: { mode: EventMode; label: string; icon: string }[] = [
  { mode: 'online', label: 'Online', icon: 'globe-outline' },
  { mode: 'offline', label: 'In-Person', icon: 'location-outline' },
  { mode: 'hybrid', label: 'Hybrid', icon: 'shuffle-outline' },
];

export function ManualEventModal({
  visible,
  onClose,
  onEventCreated,
  initialDate,
}: ManualEventModalProps) {
  const { addEvent } = useEvents();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<EventType>('hackathon');
  const [mode, setMode] = useState<EventMode>('offline');
  const [startDate, setStartDate] = useState<string | null>(initialDate || null);

  useEffect(() => {
    if (visible && initialDate) {
      setStartDate(initialDate);
    }
  }, [visible, initialDate]);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [registrationLink, setRegistrationLink] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Active pickers
  const [activeDatePicker, setActiveDatePicker] = useState<{
    field: 'start' | 'end' | 'deadline';
    title: string;
  } | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const resetForm = () => {
    setTitle('');
    setType('hackathon');
    setMode('offline');
    setStartDate(initialDate || null);
    setEndDate(null);
    setDeadline(null);
    setTime(null);
    setLocation('');
    setRegistrationLink('');
    setTagsText('');
    setIsSaving(false);
  };

  const handleClose = () => {
    if (isSaving) return;
    resetForm();
    onClose();
  };

  const handleSave = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      Alert.alert('Title Required', 'Please enter an event title.');
      return;
    }

    if (!startDate && !deadline) {
      Alert.alert(
        'Date Required',
        'Please select at least an Event Start Date or a Registration Deadline.'
      );
      return;
    }

    setIsSaving(true);
    try {
      const parsedTags = tagsText
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);

      const created = await addEvent({
        title: cleanTitle,
        type,
        mode,
        event_start_date: startDate,
        event_end_date: endDate || null,
        registration_deadline: deadline || null,
        time: time || null,
        location: location.trim() || null,
        registration_link: registrationLink.trim() || null,
        tags: parsedTags,
        confidence_score: 1.0,
        source_group: 'manual_entry',
        raw_text: `Manual event: ${cleanTitle}`,
        reminder_offsets: [4320, 1440, 0],
        status: 'upcoming',
      });

      resetForm();
      onClose();
      if (onEventCreated && created?.id) {
        onEventCreated(created.id);
      }
    } catch (err: any) {
      Alert.alert(
        'Could Not Save Event',
        err?.message || 'An unexpected error occurred. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleGroup}>
              <View style={styles.iconCircle}>
                <Ionicons name="calendar" size={18} color="#4F46E5" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Add Event Manually</Text>
                <Text style={styles.headerSubtitle}>
                  Create schedule & deadline reminder
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Form Body */}
          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Title Input */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>EVENT TITLE *</Text>
              <TextInput
                style={styles.textInput}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Hackathon 2026, AI Workshop, Project Deadline"
                placeholderTextColor="#94A3B8"
                maxLength={200}
                autoFocus={Platform.OS !== 'web'}
              />
            </View>

            {/* Category / Type Chips */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>CATEGORY</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
              >
                {EVENT_TYPES.map((t) => {
                  const conf = EVENT_TYPE_CONFIG[t];
                  const isSel = type === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.chip,
                        isSel && {
                          backgroundColor: conf.badgeBg,
                          borderColor: conf.badgeText,
                        },
                      ]}
                      onPress={() => setType(t)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={conf.icon as any}
                        size={13}
                        color={isSel ? conf.badgeText : colors.textSecondary}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.chipText,
                          isSel && { color: conf.badgeText, fontWeight: '700' },
                        ]}
                      >
                        {conf.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Mode Selector */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>MODE</Text>
              <View style={styles.modeRow}>
                {EVENT_MODES.map((m) => {
                  const isSel = mode === m.mode;
                  return (
                    <TouchableOpacity
                      key={m.mode}
                      style={[styles.modeTab, isSel && styles.modeTabActive]}
                      onPress={() => setMode(m.mode)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={m.icon as any}
                        size={14}
                        color={isSel ? colors.primary : colors.textSecondary}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.modeTabText,
                          isSel && styles.modeTabTextActive,
                        ]}
                      >
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Dates & Deadlines */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>DATES & SCHEDULE</Text>

              {/* Event Start Date */}
              <TouchableOpacity
                style={styles.pickerTrigger}
                onPress={() =>
                  setActiveDatePicker({
                    field: 'start',
                    title: 'Event Start Date',
                  })
                }
                activeOpacity={0.7}
              >
                <View style={styles.pickerLeft}>
                  <Ionicons
                    name="calendar-outline"
                    size={16}
                    color="#4F46E5"
                  />
                  <Text style={styles.pickerLabel}>Event Start Date</Text>
                </View>
                <View style={styles.pickerRight}>
                  <Text
                    style={[
                      styles.pickerValue,
                      !startDate && styles.pickerPlaceholder,
                    ]}
                  >
                    {startDate ? formatFriendlyDate(startDate) : 'Select date'}
                  </Text>
                  {startDate && (
                    <TouchableOpacity
                      onPress={() => setStartDate(null)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="close-circle"
                        size={16}
                        color={colors.textTertiary}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>

              {/* Event End Date (Optional) */}
              <TouchableOpacity
                style={styles.pickerTrigger}
                onPress={() =>
                  setActiveDatePicker({
                    field: 'end',
                    title: 'Event End Date (Optional)',
                  })
                }
                activeOpacity={0.7}
              >
                <View style={styles.pickerLeft}>
                  <Ionicons
                    name="calendar-outline"
                    size={16}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.pickerLabel}>Event End Date</Text>
                </View>
                <View style={styles.pickerRight}>
                  <Text
                    style={[
                      styles.pickerValue,
                      !endDate && styles.pickerPlaceholder,
                    ]}
                  >
                    {endDate ? formatFriendlyDate(endDate) : 'Optional'}
                  </Text>
                  {endDate && (
                    <TouchableOpacity
                      onPress={() => setEndDate(null)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="close-circle"
                        size={16}
                        color={colors.textTertiary}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>

              {/* Registration Deadline (Optional) */}
              <TouchableOpacity
                style={styles.pickerTrigger}
                onPress={() =>
                  setActiveDatePicker({
                    field: 'deadline',
                    title: 'Registration Deadline',
                  })
                }
                activeOpacity={0.7}
              >
                <View style={styles.pickerLeft}>
                  <Ionicons
                    name="alarm-outline"
                    size={16}
                    color={colors.danger}
                  />
                  <Text style={styles.pickerLabel}>Registration Deadline</Text>
                </View>
                <View style={styles.pickerRight}>
                  <Text
                    style={[
                      styles.pickerValue,
                      !deadline && styles.pickerPlaceholder,
                    ]}
                  >
                    {deadline ? formatFriendlyDate(deadline) : 'Optional'}
                  </Text>
                  {deadline && (
                    <TouchableOpacity
                      onPress={() => setDeadline(null)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="close-circle"
                        size={16}
                        color={colors.textTertiary}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>

              {/* Event Time (Optional) */}
              <TouchableOpacity
                style={styles.pickerTrigger}
                onPress={() => setShowTimePicker(true)}
                activeOpacity={0.7}
              >
                <View style={styles.pickerLeft}>
                  <Ionicons
                    name="time-outline"
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={styles.pickerLabel}>Event Time</Text>
                </View>
                <View style={styles.pickerRight}>
                  <Text
                    style={[
                      styles.pickerValue,
                      !time && styles.pickerPlaceholder,
                    ]}
                  >
                    {time || 'e.g. 10:00 AM (Optional)'}
                  </Text>
                  {time && (
                    <TouchableOpacity
                      onPress={() => setTime(null)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="close-circle"
                        size={16}
                        color={colors.textTertiary}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            </View>

            {/* Location */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>LOCATION (OPTIONAL)</Text>
              <TextInput
                style={styles.textInput}
                value={location}
                onChangeText={setLocation}
                placeholder={
                  mode === 'online'
                    ? 'e.g. Zoom / Google Meet / Discord'
                    : 'e.g. Auditorium / Lab 301'
                }
                placeholderTextColor="#94A3B8"
                maxLength={200}
              />
            </View>

            {/* Registration Link */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>REGISTRATION URL (OPTIONAL)</Text>
              <TextInput
                style={styles.textInput}
                value={registrationLink}
                onChangeText={setRegistrationLink}
                placeholder="https://..."
                placeholderTextColor="#94A3B8"
                keyboardType="url"
                autoCapitalize="none"
                maxLength={500}
              />
            </View>

            {/* Tags */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>TAGS (COMMA SEPARATED)</Text>
              <TextInput
                style={styles.textInput}
                value={tagsText}
                onChangeText={setTagsText}
                placeholder="e.g. ai, web3, coding"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
              />
            </View>
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleClose}
              disabled={isSaving}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={isSaving}
              activeOpacity={0.85}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  <Text style={styles.saveBtnText}>Save Event</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Date Picker Modal */}
      {activeDatePicker && (
        <DatePickerModal
          visible={!!activeDatePicker}
          title={activeDatePicker.title}
          initialDate={
            activeDatePicker.field === 'start'
              ? startDate
              : activeDatePicker.field === 'end'
              ? endDate
              : deadline
          }
          onSelect={(selected) => {
            if (activeDatePicker.field === 'start') setStartDate(selected);
            else if (activeDatePicker.field === 'end') setEndDate(selected);
            else if (activeDatePicker.field === 'deadline') setDeadline(selected);
            setActiveDatePicker(null);
          }}
          onClose={() => setActiveDatePicker(null)}
        />
      )}

      {/* Time Picker Modal */}
      <TimePickerModal
        visible={showTimePicker}
        initialTime={time}
        onSelect={(selected) => {
          setTime(selected);
          setShowTimePicker(false);
        }}
        onClose={() => setShowTimePicker(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 32 : 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F5',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#18181B',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#71717A',
  },
  closeBtn: {
    padding: 4,
  },
  formScroll: {
    flexShrink: 1,
  },
  formContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#71717A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: radii.control,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#18181B',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#52525B',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: radii.control,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  modeTabActive: {
    backgroundColor: '#F4F4F5',
    borderColor: colors.primary,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#71717A',
  },
  modeTabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  pickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: radii.control,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    marginBottom: 8,
  },
  pickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickerLabel: {
    fontSize: 13,
    color: '#18181B',
    fontWeight: '500',
  },
  pickerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pickerValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  pickerPlaceholder: {
    color: '#A1A1AA',
    fontWeight: '400',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: radii.control,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#52525B',
  },
  saveBtn: {
    flex: 1.6,
    height: 46,
    borderRadius: radii.control,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
