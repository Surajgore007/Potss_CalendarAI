import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Linking,
  Alert,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../../src/components/Header';
import { TypeBadge } from '../../../src/components/TypeBadge';
import { ConfidenceBadge } from '../../../src/components/ConfidenceBadge';
import { useEvents } from '../../../src/context/EventsContext';
import { colors, radii, shadows } from '../../../src/theme/tokens';
import { DatePickerModal } from '../../../src/components/ui/DatePickerModal';
import { TimePickerModal } from '../../../src/components/ui/TimePickerModal';
import {
  CalendarEvent,
  EventType,
  EventMode,
  EventStatus,
  EVENT_TYPE_CONFIG,
  EVENT_MODE_CONFIG,
  EVENT_STATUS_CONFIG,
  formatFriendlyDate,
  formatTime12Hour,
  getUrgencyInfo,
  THEME_DESIGN,
  isValidTimeFormat,
  sanitizeUrl,
} from '@eventpulse/shared';

const EVENT_TYPES: EventType[] = ['hackathon', 'ctf', 'meetup', 'workshop', 'deadline', 'other'];
const EVENT_MODES: EventMode[] = ['online', 'offline', 'hybrid'];
const STATUSES: EventStatus[] = ['upcoming', 'registered', 'skipped'];

export default function EventDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(rawId) ? rawId[0] : (rawId || '');
  const router = useRouter();
  const { events, editEvent, removeEvent } = useEvents();

  const currentEvent = events.find((e) => e.id === id);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeDatePicker, setActiveDatePicker] = useState<{
    field: 'registration_deadline' | 'event_start_date' | 'event_end_date';
    title: string;
  } | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showRawText, setShowRawText] = useState(false);

  const [formData, setFormData] = useState<CalendarEvent>({
    id: id || '',
    title: '',
    type: 'other',
    event_start_date: null,
    event_end_date: null,
    registration_deadline: null,
    time: null,
    mode: 'online',
    location: null,
    registration_link: null,
    source_group: null,
    raw_text: '',
    confidence_score: 1.0,
    tags: [],
    reminder_offsets: [4320, 1440, 0],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'upcoming',
  });

  // Track the last event ID this screen was initialized for.
  // When expo-router reuses the component for a different event ID,
  // we must atomically reset all local state to avoid state leakage.
  const lastRenderedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (id && id !== lastRenderedIdRef.current) {
      lastRenderedIdRef.current = id;
      // Reset edit mode and pickers for the new event
      setIsEditing(false);
      setIsSaving(false);
      setActiveDatePicker(null);
      setShowTimePicker(false);
      setShowRawText(false);
    }
  }, [id]);

  // Sync form data whenever the Firestore snapshot updates (only when not actively editing)
  useEffect(() => {
    if (currentEvent && !isEditing) {
      setFormData({ ...currentEvent });
    }
  }, [currentEvent, isEditing]);

  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;
  const currentEventRef = useRef(currentEvent);
  currentEventRef.current = currentEvent;

  // Intercept Android hardware back button to show discard dialog when editing
  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        if (isEditingRef.current) {
          Alert.alert(
            'Discard Changes?',
            'You have unsaved edits. Are you sure you want to go back without saving?',
            [
              { text: 'Keep Editing', style: 'cancel' },
              {
                text: 'Discard',
                style: 'destructive',
                onPress: () => {
                  setIsEditing(false);
                  if (currentEventRef.current) setFormData({ ...currentEventRef.current });
                  router.back();
                },
              },
            ]
          );
          return true; // Prevent default back behavior
        }
        return false; // Allow default back behavior
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
      return () => {
        subscription.remove();
      };
    }, [router])
  );

  // Guarantee clean unmount
  useEffect(() => {
    return () => {
      setIsEditing(false);
      setIsSaving(false);
      setActiveDatePicker(null);
      setShowTimePicker(false);
    };
  }, []);

  // Custom back handler for the Header back button — same discard logic
  const handleBack = useCallback(() => {
    if (isEditing) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved edits. Are you sure you want to go back without saving?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setIsEditing(false);
              if (currentEvent) setFormData({ ...currentEvent });
              router.back();
            },
          },
        ]
      );
    } else {
      router.back();
    }
  }, [isEditing, currentEvent, router]);

  if (!currentEvent && !formData.title) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Header title="Event Details" showBack />
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#94A3B8" />
          <Text style={styles.emptyTitle}>Event not found</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Back to Calendar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleFieldChange = (field: keyof CalendarEvent, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      Alert.alert('Validation Error', 'Event title is required.');
      return;
    }
    if (formData.time && !isValidTimeFormat(formData.time)) {
      Alert.alert('Validation Error', 'Time must be in format "6:00 PM" or "18:00".');
      return;
    }
    setIsSaving(true);
    try {
      await editEvent(formData.id, {
        title: formData.title.trim(),
        type: formData.type,
        event_start_date: formData.event_start_date || null,
        event_end_date: formData.event_end_date || null,
        registration_deadline: formData.registration_deadline || null,
        time: formData.time ? formatTime12Hour(formData.time) : null,
        mode: formData.mode,
        location: formData.location ? formData.location.trim() : null,
        registration_link: formData.registration_link ? sanitizeUrl(formData.registration_link) : null,
        source_group: formData.source_group ? formData.source_group.trim() : null,
        status: formData.status,
      });
      setIsEditing(false);
      Alert.alert('Success', 'Event updated successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update event.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Event', 'Are you sure you want to remove this event from your calendar?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await removeEvent(formData.id);
          router.back();
        },
      },
    ]);
  };

  const handleStatusChange = async (status: EventStatus) => {
    handleFieldChange('status', status);
    await editEvent(formData.id, { status });
  };

  const urgency = getUrgencyInfo(formData);
  const modeConfig = EVENT_MODE_CONFIG[formData.mode] || EVENT_MODE_CONFIG.online;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Header
        title={isEditing ? 'Edit Event' : 'Event Details'}
        showBack
        onBack={handleBack}
        rightAction={
          <View style={styles.headerBtns}>
            {isEditing ? (
              <>
                <TouchableOpacity
                  style={[styles.headerIconBtn, styles.cancelHeaderBtn]}
                  onPress={() => {
                    setIsEditing(false);
                    if (currentEvent) setFormData({ ...currentEvent });
                  }}
                  disabled={isSaving}
                >
                  <Text style={styles.cancelHeaderBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveHeaderBtn} onPress={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveHeaderBtnText}>Save</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.headerIconBtn} onPress={() => setIsEditing(true)}>
                  <Ionicons name="pencil" size={15} color="#4F46E5" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.headerIconBtn, styles.deleteHeaderBtn]} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={15} color="#E11D48" />
                </TouchableOpacity>
              </>
            )}
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.statusSection}>
          <Text style={styles.sectionLabel}>CALENDAR STATUS</Text>
          <View style={styles.segmentedContainer}>
            {STATUSES.map((st) => {
              const selected = formData.status === st;
              const config = EVENT_STATUS_CONFIG[st];
              return (
                <TouchableOpacity
                  key={st}
                  style={[
                    styles.segmentTab,
                    selected && styles.segmentTabActive,
                  ]}
                  onPress={() => handleStatusChange(st)}
                >
                  <Ionicons
                    name={config.icon as any}
                    size={13}
                    color={selected ? config.color : colors.textTertiary}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.segmentTabText, selected && { color: config.color, fontWeight: '700' }]}>
                    {config.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {isEditing ? (
          <View style={styles.editCard}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>EVENT TITLE *</Text>
              <TextInput
                style={styles.textInput}
                value={formData.title}
                onChangeText={(t) => handleFieldChange('title', t)}
                placeholder="Event title..."
                placeholderTextColor="#94A3B8"
                maxLength={300}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>CATEGORY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {EVENT_TYPES.map((t) => {
                  const conf = EVENT_TYPE_CONFIG[t];
                  const isSel = formData.type === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.chip, isSel && { backgroundColor: conf.badgeBg, borderColor: conf.badgeText }]}
                      onPress={() => handleFieldChange('type', t)}
                    >
                      <Ionicons
                        name={conf.icon as any}
                        size={12}
                        color={isSel ? conf.badgeText : '#64748B'}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.chipText, isSel && { color: conf.badgeText, fontWeight: '700' }]}>
                        {conf.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Mode selector */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>FORMAT</Text>
              <View style={styles.chipRow}>
                {EVENT_MODES.map((m) => {
                  const conf = EVENT_MODE_CONFIG[m];
                  const isSel = formData.mode === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[styles.chip, isSel && { backgroundColor: conf.badgeBg, borderColor: conf.badgeText }]}
                      onPress={() => handleFieldChange('mode', m)}
                    >
                      <Ionicons
                        name={conf.icon as any}
                        size={12}
                        color={isSel ? conf.badgeText : '#64748B'}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.chipText, isSel && { color: conf.badgeText, fontWeight: '700' }]}>
                        {conf.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Date and Time Fields with Interactive Pickers */}
            <View style={styles.rowTwoCols}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>REG. DEADLINE</Text>
                <View style={styles.inputWithIconRow}>
                  <TextInput
                    style={[styles.textInput, { flex: 1 }]}
                    value={formData.registration_deadline || ''}
                    onChangeText={(t) => handleFieldChange('registration_deadline', t || null)}
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
                    <Ionicons name="calendar-outline" size={17} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>EVENT START</Text>
                <View style={styles.inputWithIconRow}>
                  <TextInput
                    style={[styles.textInput, { flex: 1 }]}
                    value={formData.event_start_date || ''}
                    onChangeText={(t) => handleFieldChange('event_start_date', t || null)}
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
                    <Ionicons name="calendar-outline" size={17} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.rowTwoCols}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>END DATE</Text>
                <View style={styles.inputWithIconRow}>
                  <TextInput
                    style={[styles.textInput, { flex: 1 }]}
                    value={formData.event_end_date || ''}
                    onChangeText={(t) => handleFieldChange('event_end_date', t || null)}
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
                    <Ionicons name="calendar-outline" size={17} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>TIME (12-HOUR)</Text>
                <View style={styles.inputWithIconRow}>
                  <TextInput
                    style={[styles.textInput, { flex: 1 }]}
                    value={formData.time ? formatTime12Hour(formData.time) : ''}
                    onChangeText={(t) => handleFieldChange('time', t || null)}
                    placeholder="10:00 AM"
                    placeholderTextColor="#94A3B8"
                    maxLength={12}
                  />
                  <TouchableOpacity
                    style={styles.inputIconBtn}
                    onPress={() => setShowTimePicker(true)}
                  >
                    <Ionicons name="time-outline" size={17} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>LOCATION</Text>
              <TextInput
                style={styles.textInput}
                value={formData.location || ''}
                onChangeText={(t) => handleFieldChange('location', t || null)}
                maxLength={300}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>REGISTRATION LINK (URL)</Text>
              <TextInput
                style={styles.textInput}
                value={formData.registration_link || ''}
                onChangeText={(t) => handleFieldChange('registration_link', t || null)}
                autoCapitalize="none"
                maxLength={1000}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>SOURCE / GROUP</Text>
              <TextInput
                style={styles.textInput}
                value={formData.source_group || ''}
                onChangeText={(t) => handleFieldChange('source_group', t || null)}
                maxLength={200}
              />
            </View>
          </View>
        ) : (
          /* READ VIEW */
          <View style={styles.viewCard}>
            {/* Badges & Urgency */}
            <View style={styles.badgeRow}>
              <TypeBadge type={formData.type} />
              <View style={[styles.modePill, { backgroundColor: modeConfig.badgeBg }]}>
                <Ionicons name={modeConfig.icon as any} size={11} color={modeConfig.badgeText} style={{ marginRight: 4 }} />
                <Text style={[styles.modePillText, { color: modeConfig.badgeText }]}>{modeConfig.label}</Text>
              </View>
              <ConfidenceBadge score={formData.confidence_score} />
            </View>

            {/* Title */}
            <Text style={styles.viewTitle}>{formData.title}</Text>

            {/* Urgency Highlight Banner */}
            <View style={styles.urgencyBanner}>
              <Ionicons name="time" size={15} color="#4F46E5" />
              <Text style={styles.urgencyBannerText}>{urgency.label}</Text>
            </View>

            {/* Dates Grid */}
            <View style={styles.datesGrid}>
              {formData.registration_deadline && (
                <View style={styles.dateBlockHighlight}>
                  <View style={styles.dateIconWrap}>
                    <Ionicons name="alarm" size={16} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dateSub}>REGISTRATION DEADLINE</Text>
                    <Text style={styles.deadlineVal}>{formatFriendlyDate(formData.registration_deadline)}</Text>
                    {formData.time && <Text style={styles.timeVal}>Time: {formatTime12Hour(formData.time)}</Text>}
                  </View>
                </View>
              )}

              {formData.event_start_date && (
                <View style={styles.dateBlock}>
                  <View style={styles.dateIconWrapBlue}>
                    <Ionicons name="calendar" size={16} color="#4F46E5" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dateSub}>EVENT DATE</Text>
                    <Text style={styles.dateVal}>
                      {formatFriendlyDate(formData.event_start_date)}
                      {formData.event_end_date ? ` - ${formatFriendlyDate(formData.event_end_date)}` : ''}
                      {formData.time && !formData.registration_deadline ? ` • ${formatTime12Hour(formData.time)}` : ''}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Location */}
            {formData.location && (
              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={16} color="#4F46E5" />
                <Text style={styles.detailText}>{formData.location}</Text>
              </View>
            )}

            {/* Registration Link Button */}
            {formData.registration_link && (
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => Linking.openURL(formData.registration_link!)}
                activeOpacity={0.88}
              >
                <Ionicons name="open-outline" size={16} color="#FFFFFF" />
                <Text style={styles.linkButtonText}>Open Registration Page</Text>
              </TouchableOpacity>
            )}

            {/* Source Group */}
            {formData.source_group && (
              <View style={styles.detailRow}>
                <Ionicons name="chatbubble-outline" size={14} color="#94A3B8" />
                <Text style={styles.sourceText}>Extracted from: {formData.source_group}</Text>
              </View>
            )}

            {/* Raw Extracted Text Toggle */}
            {formData.raw_text ? (
              <View style={styles.rawSection}>
                <TouchableOpacity
                  style={styles.rawHeader}
                  onPress={() => setShowRawText(!showRawText)}
                >
                  <Text style={styles.rawTitle}>Original WhatsApp Message</Text>
                  <Ionicons name={showRawText ? 'chevron-up' : 'chevron-down'} size={14} color="#94A3B8" />
                </TouchableOpacity>
                {showRawText && (
                  <Text style={styles.rawBodyText}>{formData.raw_text}</Text>
                )}
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Date Picker Modal */}
      <DatePickerModal
        visible={activeDatePicker !== null}
        title={activeDatePicker?.title || 'Select Date'}
        initialDate={activeDatePicker ? (formData[activeDatePicker.field] as string | null) : null}
        onSelect={(dateStr) => {
          if (activeDatePicker) {
            handleFieldChange(activeDatePicker.field, dateStr);
          }
        }}
        onClose={() => setActiveDatePicker(null)}
      />

      {/* Time Picker Modal (12-Hour Clock) */}
      <TimePickerModal
        visible={showTimePicker}
        title="Select Event Time"
        initialTime={formData.time}
        onSelect={(timeStr) => handleFieldChange('time', timeStr)}
        onClose={() => setShowTimePicker(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  headerBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteHeaderBtn: {
    backgroundColor: '#FFF1F2',
  },
  cancelHeaderBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelHeaderBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  saveHeaderBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    ...THEME_DESIGN.shadows.glow,
  },
  saveHeaderBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statusSection: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: colors.canvasSubtle,
    borderRadius: radii.control,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    gap: 3,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 5,
  },
  segmentTabActive: {
    backgroundColor: '#FFFFFF',
    ...shadows.subtle,
  },
  segmentTabText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  editCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.card,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.card,
    gap: 14,
  },
  viewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.card,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.card,
    gap: 14,
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
  textInput: {
    backgroundColor: colors.canvasSubtle,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.glassBorder,
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
    padding: 7,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  chipRow: {
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.control,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 11,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  rowTwoCols: {
    flexDirection: 'row',
    gap: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  modePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  viewTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 26,
    letterSpacing: -0.4,
  },
  urgencyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  urgencyBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  datesGrid: {
    gap: 10,
  },
  dateBlockHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  dateBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateIconWrapBlue: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateSub: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  deadlineVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D97706',
    marginTop: 1,
  },
  dateVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  timeVal: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    borderRadius: 14,
    gap: 8,
    ...THEME_DESIGN.shadows.glow,
  },
  linkButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sourceText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  rawSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  rawHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rawTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  rawBodyText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
  },
  backBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
