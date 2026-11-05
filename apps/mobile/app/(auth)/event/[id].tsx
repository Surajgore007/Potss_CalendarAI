import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { useAuth } from '../../../src/context/AuthContext';
import { useEvents } from '../../../src/context/EventsContext';
import { colors, radii, shadows } from '../../../src/theme/tokens';
import { DatePickerModal } from '../../../src/components/ui/DatePickerModal';
import { TimePickerModal } from '../../../src/components/ui/TimePickerModal';
import {
  canScheduleExactAlarms,
  isIgnoringBatteryOptimizations,
  openBatteryOptimizationSettings,
  openExactAlarmSettings,
  openAlarmChannelSettings,
  getAlarmVolumeInfo,
  computeAlarmSchedule,
  AlarmVolumeInfo,
} from '../../../src/services/alarmService';
import { AlarmReliabilityModal } from '../../../src/components/AlarmReliabilityModal';
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
  getEventById,
  getCommunityEventById,
} from '@eventpulse/shared';

const EVENT_TYPES: EventType[] = ['hackathon', 'ctf', 'meetup', 'workshop', 'deadline', 'other'];
const EVENT_MODES: EventMode[] = ['online', 'offline', 'hybrid'];
const STATUSES: EventStatus[] = ['upcoming', 'registered', 'skipped'];

export default function EventDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(rawId) ? rawId[0] : (rawId || '');
  const router = useRouter();
  const { user } = useAuth();
  const { events, editEvent, addEvent, removeEvent, toggleEventAlarm, isLoading: isEventsLoading } = useEvents();

  const currentEvent = useMemo(() => events.find((e) => e.id === id), [events, id]);
  const [directEvent, setDirectEvent] = useState<CalendarEvent | null>(null);
  const [isFetchingDirect, setIsFetchingDirect] = useState(false);
  const [directFetchAttempted, setDirectFetchAttempted] = useState(false);

  const activeEvent = currentEvent || directEvent;

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasExactAlarmPerm, setHasExactAlarmPerm] = useState(true);
  const [isBatteryIgnored, setIsBatteryIgnored] = useState<boolean | null>(null);
  const [alarmVolume, setAlarmVolume] = useState<AlarmVolumeInfo | null>(null);
  const [showReliabilityModal, setShowReliabilityModal] = useState(false);

  // Check alarm permissions, battery optimizations & volume whenever screen gains focus
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      canScheduleExactAlarms().then((can) => {
        if (isMounted) setHasExactAlarmPerm(can);
      });
      isIgnoringBatteryOptimizations().then((ignoring) => {
        if (isMounted) setIsBatteryIgnored(ignoring);
      });
      getAlarmVolumeInfo().then((vol) => {
        if (isMounted) setAlarmVolume(vol);
      });
      return () => {
        isMounted = false;
      };
    }, [])
  );
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
      setDirectEvent(null);
      setIsFetchingDirect(false);
      setDirectFetchAttempted(false);
      setIsEditing(false);
      setIsSaving(false);
      setActiveDatePicker(null);
      setShowTimePicker(false);
      setShowRawText(false);
    }
  }, [id]);

  // Fallback direct fetch: If not in local events cache, query Firestore directly
  useEffect(() => {
    if (currentEvent) return;
    if (!id || directFetchAttempted) return;
    if (isEventsLoading) return;

    let isMounted = true;
    setIsFetchingDirect(true);

    const tryFetch = async () => {
      try {
        // 1. Try personal user events
        if (user?.uid) {
          const userEvt = await getEventById(user.uid, id);
          if (userEvt && isMounted) {
            setDirectEvent(userEvt);
            setIsFetchingDirect(false);
            setDirectFetchAttempted(true);
            return;
          }
        }

        // 2. Try community events
        const commEvt = await getCommunityEventById(id);
        if (commEvt && isMounted) {
          const mapped: CalendarEvent = {
            id: commEvt.id,
            title: commEvt.title || 'Community Event',
            type: commEvt.type || 'other',
            event_start_date: commEvt.event_start_date || null,
            event_end_date: commEvt.event_end_date || null,
            registration_deadline: commEvt.registration_deadline || null,
            time: commEvt.time || null,
            mode: commEvt.mode || 'offline',
            location: commEvt.location || null,
            registration_link: commEvt.registration_link || null,
            source_group: commEvt.source_group || commEvt.college || null,
            raw_text: commEvt.description || '',
            confidence_score: 1.0,
            tags: commEvt.tags || [],
            reminder_offsets: [4320, 1440, 0],
            status: 'upcoming',
            created_at: commEvt.created_at || new Date().toISOString(),
            updated_at: commEvt.updated_at || new Date().toISOString(),
          };
          setDirectEvent(mapped);
          setIsFetchingDirect(false);
          setDirectFetchAttempted(true);
          return;
        }
      } catch (err) {
        console.warn('Error fetching event directly:', err);
      } finally {
        if (isMounted) {
          setIsFetchingDirect(false);
          setDirectFetchAttempted(true);
        }
      }
    };

    tryFetch();

    return () => {
      isMounted = false;
    };
  }, [id, currentEvent, isEventsLoading, directFetchAttempted, user?.uid]);

  // Sync form data whenever the active event snapshot updates (only when not actively editing)
  useEffect(() => {
    if (activeEvent && !isEditing) {
      setFormData({ ...activeEvent });
    }
  }, [activeEvent, isEditing]);

  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;
  const activeEventRef = useRef(activeEvent);
  activeEventRef.current = activeEvent;

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
                  if (activeEventRef.current) setFormData({ ...activeEventRef.current });
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
              if (activeEvent) setFormData({ ...activeEvent });
              router.back();
            },
          },
        ]
      );
    } else {
      router.back();
    }
  }, [isEditing, activeEvent, router]);

  // Loading state while hydrating cache or checking Firestore directly
  if ((isEventsLoading || isFetchingDirect || (!activeEvent && !directFetchAttempted)) && !formData.title) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Header title="Event Details" showBack />
        <View style={[styles.emptyContainer, { justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={colors.textPrimary} />
          <Text style={[styles.emptyTitle, { fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginTop: 12 }]}>
            Loading event details...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!activeEvent && !formData.title) {
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
      const existsLocally = events.some((e) => e.id === formData.id);
      const payload: Partial<CalendarEvent> = {
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
        has_critical_alarm: Boolean(formData.has_critical_alarm),
        alarm_offsets: formData.alarm_offsets || [120, 15],
        alarm_time_assumed: !formData.time,
      };

      if (existsLocally) {
        await editEvent(formData.id, payload);
      } else {
        await addEvent({ ...formData, ...payload });
      }

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
  const alarmPreview = useMemo(() => computeAlarmSchedule(formData), [formData]);

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

        {/* Critical Deadline Alarm Section */}
        <View style={styles.alarmSectionCard}>
          <View style={styles.alarmHeaderRow}>
            <View style={styles.alarmTitleGroup}>
              <View style={[styles.alarmIconBadge, formData.has_critical_alarm ? styles.alarmIconBadgeActive : styles.alarmIconBadgeInactive]}>
                <Ionicons
                  name={formData.has_critical_alarm ? "alarm" : "alarm-outline"}
                  size={18}
                  color={formData.has_critical_alarm ? "#FFFFFF" : colors.textTertiary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.alarmSectionHeading}>CRITICAL DEADLINE ALARM</Text>
                <Text style={styles.alarmSectionSub}>
                  {formData.has_critical_alarm
                    ? "Insistent repeating alarm armed"
                    : "Ring a loud repeating alarm so you never miss this cutoff"}
                </Text>
              </View>
            </View>

            {/* 1-Tap Toggle Switch */}
            <TouchableOpacity
              style={[styles.alarmToggleSwitch, formData.has_critical_alarm ? styles.alarmToggleSwitchOn : styles.alarmToggleSwitchOff]}
              onPress={async () => {
                const nextVal = !formData.has_critical_alarm;
                handleFieldChange('has_critical_alarm', nextVal);
                if (!isEditing && activeEvent) {
                  await toggleEventAlarm(activeEvent.id, nextVal);
                }
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.alarmToggleThumb, formData.has_critical_alarm && styles.alarmToggleThumbOn]} />
            </TouchableOpacity>
          </View>

          {formData.has_critical_alarm && (
            <View style={styles.alarmDetailsWrap}>
              {/* Trigger timing info */}
              {alarmPreview?.triggers && alarmPreview.triggers.length > 0 ? (
                <View style={styles.alarmTimelineRow}>
                  {alarmPreview.triggers.map((t: { stage: number; offsetMinutes: number; triggerTimeMs: number }, idx: number) => (
                    <View key={idx} style={styles.alarmPill}>
                      <Ionicons name="time-outline" size={12} color="#D97706" />
                      <Text style={styles.alarmPillText}>
                        Stage {t.stage}: {new Date(t.triggerTimeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({t.offsetMinutes}m before)
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.alarmWarningText}>
                  ⚠️ Event dates are in the past. Alarms will not ring.
                </Text>
              )}

              {alarmPreview?.isTimeAssumed && (
                <Text style={styles.alarmAssumptionText}>
                  ℹ️ End of day (11:59 PM) assumed. Tap Edit if the actual deadline is earlier.
                </Text>
              )}

              {/* Warnings */}
              {!hasExactAlarmPerm && (
                <TouchableOpacity
                  style={styles.alarmPermissionAlert}
                  onPress={openExactAlarmSettings}
                  activeOpacity={0.8}
                >
                  <Ionicons name="alert-circle" size={14} color="#EF4444" />
                  <Text style={styles.alarmPermissionAlertText}>
                    Exact alarms restricted by system. Tap to allow in Settings.
                  </Text>
                </TouchableOpacity>
              )}

              {alarmVolume?.isMuted && (
                <View style={styles.alarmVolumeAlert}>
                  <Ionicons name="volume-mute" size={14} color="#F59E0B" />
                  <Text style={styles.alarmVolumeAlertText}>
                    Your phone's Alarm Volume is muted. Increase volume slider to hear alarms.
                  </Text>
                </View>
              )}

              {isBatteryIgnored === false && (
                <TouchableOpacity
                  style={styles.alarmBatteryAlert}
                  onPress={() => setShowReliabilityModal(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="battery-charging-outline" size={14} color="#F59E0B" />
                  <Text style={styles.alarmBatteryAlertText}>
                    Battery Saver may silence background alarms. Tap for device guide.
                  </Text>
                </TouchableOpacity>
              )}

              {/* Action: Mark as Submitted */}
              {formData.status !== 'registered' && !isEditing && (
                <TouchableOpacity
                  style={styles.markSubmittedBtn}
                  onPress={async () => {
                    handleFieldChange('status', 'registered');
                    handleFieldChange('has_critical_alarm', false);
                    await editEvent(formData.id, {
                      status: 'registered',
                      has_critical_alarm: false,
                    });
                    Alert.alert('Marked as Submitted', 'Alarms disarmed and event marked as registered.');
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="checkmark-done-circle" size={18} color="#10B981" />
                  <Text style={styles.markSubmittedBtnText}>Mark as Submitted (Disarms Alarm)</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Edit Mode Custom Offsets */}
          {isEditing && formData.has_critical_alarm && (
            <View style={styles.editOffsetSection}>
              <Text style={styles.editOffsetLabel}>ALARM ESCALATION STAGES:</Text>
              <View style={styles.offsetChipsRow}>
                {[
                  { label: '2h & 15m (Default)', offsets: [120, 15] },
                  { label: '1h & 15m', offsets: [60, 15] },
                  { label: 'At Deadline Only', offsets: [0] },
                ].map((preset, idx) => {
                  const currentOffsets = formData.alarm_offsets || [120, 15];
                  const isSelected = JSON.stringify(currentOffsets) === JSON.stringify(preset.offsets);
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.offsetChip, isSelected && styles.offsetChipActive]}
                      onPress={() => handleFieldChange('alarm_offsets', preset.offsets)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.offsetChipText, isSelected && styles.offsetChipTextActive]}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
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

      {/* Alarm Reliability & OEM Battery Modal */}
      <AlarmReliabilityModal
        visible={showReliabilityModal}
        onClose={() => setShowReliabilityModal(false)}
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
  alarmSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
    ...THEME_DESIGN.shadows.card,
  },
  alarmHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  alarmTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  alarmIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alarmIconBadgeActive: {
    backgroundColor: '#D97706',
  },
  alarmIconBadgeInactive: {
    backgroundColor: '#F1F5F9',
  },
  alarmSectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: '#0F172A',
  },
  alarmSectionSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  alarmToggleSwitch: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 2,
    justifyContent: 'center',
  },
  alarmToggleSwitchOn: {
    backgroundColor: '#D97706',
  },
  alarmToggleSwitchOff: {
    backgroundColor: '#CBD5E1',
  },
  alarmToggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
  alarmToggleThumbOn: {
    alignSelf: 'flex-end',
  },
  alarmDetailsWrap: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    gap: 10,
  },
  alarmTimelineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  alarmPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  alarmPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  alarmWarningText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '600',
  },
  alarmAssumptionText: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },
  alarmPermissionAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  alarmPermissionAlertText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
    flex: 1,
  },
  alarmVolumeAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  alarmVolumeAlertText: {
    fontSize: 11,
    color: '#B45309',
    fontWeight: '600',
    flex: 1,
  },
  alarmBatteryAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginTop: 6,
  },
  alarmBatteryAlertText: {
    flex: 1,
    fontSize: 11,
    color: '#B45309',
    fontWeight: '600',
    lineHeight: 16,
  },
  markSubmittedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: 4,
  },
  markSubmittedBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
  },
  editOffsetSection: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    gap: 6,
  },
  editOffsetLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  offsetChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  offsetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  offsetChipActive: {
    backgroundColor: '#D97706',
    borderColor: '#B45309',
  },
  offsetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  offsetChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
