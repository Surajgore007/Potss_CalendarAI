import React, { useState, useEffect } from 'react';
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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../../src/components/Header';
import { TypeBadge } from '../../../src/components/TypeBadge';
import { ConfidenceBadge } from '../../../src/components/ConfidenceBadge';
import { useEvents } from '../../../src/context/EventsContext';
import {
  CalendarEvent,
  EventType,
  EventMode,
  EventStatus,
  EVENT_TYPE_CONFIG,
  EVENT_MODE_CONFIG,
  EVENT_STATUS_CONFIG,
  formatFriendlyDate,
  getUrgencyInfo,
} from '@eventpulse/shared';

const EVENT_TYPES: EventType[] = ['hackathon', 'ctf', 'meetup', 'workshop', 'deadline', 'other'];
const EVENT_MODES: EventMode[] = ['online', 'offline', 'hybrid'];
const STATUSES: EventStatus[] = ['upcoming', 'registered', 'skipped'];

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getEvent, editEvent, removeEvent } = useEvents();

  const event = getEvent(id as string);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showRawText, setShowRawText] = useState(false);

  const [formData, setFormData] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    if (event) {
      setFormData(event);
    }
  }, [event]);

  if (!event || !formData) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Header title="Event Details" showBack />
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#64748B" />
          <Text style={styles.emptyTitle}>Event not found</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const urgency = getUrgencyInfo(formData);
  const modeConfig = EVENT_MODE_CONFIG[formData.mode] || EVENT_MODE_CONFIG.online;

  const handleFieldChange = (field: keyof CalendarEvent, value: any) => {
    setFormData((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  const handleSave = async () => {
    if (!formData) return;
    setIsSaving(true);
    try {
      await editEvent(formData.id, formData);
      setIsEditing(false);
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Header
        title={isEditing ? 'Edit Event' : 'Event Details'}
        showBack
        rightAction={
          <View style={styles.headerBtns}>
            {isEditing ? (
              <TouchableOpacity style={styles.saveHeaderBtn} onPress={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveHeaderBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={styles.headerIconBtn} onPress={() => setIsEditing(true)}>
                  <Ionicons name="pencil" size={16} color="#A78BFA" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.headerIconBtn, styles.deleteHeaderBtn]} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={16} color="#F87171" />
                </TouchableOpacity>
              </>
            )}
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Status Switcher Row */}
        <View style={styles.statusSection}>
          <Text style={styles.sectionLabel}>MY STATUS:</Text>
          <View style={styles.statusButtonsRow}>
            {STATUSES.map((st) => {
              const selected = formData.status === st;
              const config = EVENT_STATUS_CONFIG[st];
              return (
                <TouchableOpacity
                  key={st}
                  style={[styles.statusBtn, selected && { backgroundColor: `${config.color}25`, borderColor: config.color }]}
                  onPress={() => handleStatusChange(st)}
                >
                  <Text style={[styles.statusBtnText, selected && { color: config.color, fontWeight: '700' }]}>
                    {config.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {isEditing ? (
          /* EDIT FORM */
          <View style={styles.editCard}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>TITLE</Text>
              <TextInput
                style={styles.textInput}
                value={formData.title}
                onChangeText={(t) => handleFieldChange('title', t)}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>TYPE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {EVENT_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, formData.type === t && styles.chipSelected]}
                    onPress={() => handleFieldChange('type', t)}
                  >
                    <Text style={[styles.chipText, formData.type === t && styles.chipTextSelected]}>
                      {EVENT_TYPE_CONFIG[t].label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.rowTwoCols}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={[styles.fieldLabel, { color: '#FCD34D' }]}>REG. DEADLINE (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.registration_deadline || ''}
                  onChangeText={(t) => handleFieldChange('registration_deadline', t || null)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#475569"
                />
              </View>

              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={[styles.fieldLabel, { color: '#7DD3FC' }]}>EVENT START (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.event_start_date || ''}
                  onChangeText={(t) => handleFieldChange('event_start_date', t || null)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#475569"
                />
              </View>
            </View>

            <View style={styles.rowTwoCols}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>END DATE (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.event_end_date || ''}
                  onChangeText={(t) => handleFieldChange('event_end_date', t || null)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#475569"
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>TIME (24H)</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.time || ''}
                  onChangeText={(t) => handleFieldChange('time', t || null)}
                  placeholder="10:00"
                  placeholderTextColor="#475569"
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>LOCATION</Text>
              <TextInput
                style={styles.textInput}
                value={formData.location || ''}
                onChangeText={(t) => handleFieldChange('location', t || null)}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>REGISTRATION LINK (URL)</Text>
              <TextInput
                style={styles.textInput}
                value={formData.registration_link || ''}
                onChangeText={(t) => handleFieldChange('registration_link', t || null)}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>WHATSAPP GROUP / SOURCE</Text>
              <TextInput
                style={styles.textInput}
                value={formData.source_group || ''}
                onChangeText={(t) => handleFieldChange('source_group', t || null)}
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
                <Ionicons name={modeConfig.icon as any} size={12} color={modeConfig.badgeText} style={{ marginRight: 4 }} />
                <Text style={[styles.modePillText, { color: modeConfig.badgeText }]}>{modeConfig.label}</Text>
              </View>
              <ConfidenceBadge score={formData.confidence_score} />
            </View>

            {/* Title */}
            <Text style={styles.viewTitle}>{formData.title}</Text>

            {/* Urgency Highlight Banner */}
            <View style={styles.urgencyBanner}>
              <Ionicons name="time" size={16} color="#818CF8" />
              <Text style={styles.urgencyBannerText}>{urgency.label}</Text>
            </View>

            {/* Dates Grid */}
            <View style={styles.datesGrid}>
              {formData.registration_deadline && (
                <View style={styles.dateBlockHighlight}>
                  <View style={styles.dateIconWrap}>
                    <Ionicons name="alarm" size={16} color="#F59E0B" />
                  </View>
                  <View>
                    <Text style={styles.dateSub}>REGISTRATION DEADLINE</Text>
                    <Text style={styles.deadlineVal}>{formatFriendlyDate(formData.registration_deadline)}</Text>
                    {formData.time && <Text style={styles.timeVal}>Time: {formData.time}</Text>}
                  </View>
                </View>
              )}

              {formData.event_start_date && (
                <View style={styles.dateBlock}>
                  <View style={styles.dateIconWrapBlue}>
                    <Ionicons name="calendar" size={16} color="#38BDF8" />
                  </View>
                  <View>
                    <Text style={styles.dateSub}>EVENT DATE</Text>
                    <Text style={styles.eventVal}>
                      {formatFriendlyDate(formData.event_start_date)}
                      {formData.event_end_date ? ` - ${formatFriendlyDate(formData.event_end_date, false)}` : ''}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Location & Source info */}
            <View style={styles.infoSection}>
              {formData.location && (
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={16} color="#94A3B8" />
                  <Text style={styles.infoText}>{formData.location}</Text>
                </View>
              )}

              {formData.source_group && (
                <View style={styles.infoRow}>
                  <Ionicons name="chatbubbles-outline" size={16} color="#94A3B8" />
                  <Text style={styles.infoText}>Source: {formData.source_group}</Text>
                </View>
              )}
            </View>

            {/* Registration Link Button */}
            {formData.registration_link && (
              <TouchableOpacity
                style={styles.openLinkBtn}
                onPress={() => Linking.openURL(formData.registration_link!)}
              >
                <Text style={styles.openLinkText}>Open Registration Page</Text>
                <Ionicons name="open-outline" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            )}

            {/* Reminder Offsets Preview */}
            <View style={styles.reminderCard}>
              <View style={styles.reminderHeader}>
                <Ionicons name="notifications" size={16} color="#3B82F6" />
                <Text style={styles.reminderTitle}>Scheduled Local Alerts</Text>
              </View>
              <Text style={styles.reminderDesc}>
                Automated alert notifications before deadline and event day.
              </Text>
            </View>

            {/* Prominent Delete Event Action Button */}
            <TouchableOpacity
              style={styles.deleteFullBtn}
              onPress={handleDelete}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
              <Text style={styles.deleteFullBtnText}>Delete Event from Calendar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Collapsible Raw WhatsApp Message */}
        <View style={styles.rawSection}>
          <TouchableOpacity
            style={styles.rawHeader}
            activeOpacity={0.8}
            onPress={() => setShowRawText((prev) => !prev)}
          >
            <View style={styles.rawHeaderLeft}>
              <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
              <Text style={styles.rawHeaderTitle}>Original WhatsApp Message</Text>
            </View>
            <Ionicons name={showRawText ? 'chevron-up' : 'chevron-down'} size={18} color="#94A3B8" />
          </TouchableOpacity>

          {showRawText && (
            <View style={styles.rawBody}>
              <Text style={styles.rawContentText}>{formData.raw_text}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EEF2F6',
  },
  container: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  headerBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
  },
  saveHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
  },
  saveHeaderBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  deleteHeaderBtn: {
    padding: 8,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
  },
  statusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  statusButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  statusBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  statusBtnText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  viewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
    gap: 14,
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
    fontWeight: '600',
  },
  viewTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 26,
  },
  urgencyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  urgencyBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E40AF',
  },
  datesGrid: {
    gap: 10,
  },
  dateBlockHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FEF3C7',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  dateBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#EFF6FF',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  dateIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FDE68A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateIconWrapBlue: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#BFDBFE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateSub: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  deadlineVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B45309',
    marginTop: 2,
  },
  eventVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E40AF',
    marginTop: 2,
  },
  timeVal: {
    fontSize: 12,
    color: '#B45309',
  },
  infoSection: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#475569',
    flex: 1,
  },
  openLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  openLinkText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  reminderCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reminderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  reminderDesc: {
    fontSize: 11,
    color: '#64748B',
  },
  deleteFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 8,
    marginTop: 6,
  },
  deleteFullBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  editCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
    gap: 14,
  },
  fieldGroup: {
    gap: 5,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#64748B',
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  chipText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#3B82F6',
    fontWeight: '700',
  },
  rowTwoCols: {
    flexDirection: 'row',
    gap: 12,
  },
  rawSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    overflow: 'hidden',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  rawHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: '#F8FAFC',
  },
  rawHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rawHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  rawBody: {
    padding: 14,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  rawContentText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginVertical: 12,
  },
  backBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 14,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
