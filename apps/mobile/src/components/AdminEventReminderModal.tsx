import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  CommunityEvent,
  sendEventAttendeeReminder,
  broadcastCommunityPushNotification,
  saveCollegeAnnouncement,
  formatFriendlyDate,
} from '@eventpulse/shared';
import { useAuth } from '../context/AuthContext';
import { GlassCard } from './ui/GlassCard';
import { GlassButton } from './ui/GlassButton';
import { colors, radii, shadows } from '../theme/tokens';

interface AdminEventReminderModalProps {
  visible: boolean;
  onClose: () => void;
  event: CommunityEvent | null;
  onSuccess?: (notifiedCount: number) => void;
}

const WORKER_BASE_URL =
  process.env.EXPO_PUBLIC_WORKER_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  'https://vanko-api.vanko-app.workers.dev';

export function AdminEventReminderModal({
  visible,
  onClose,
  event,
  onSuccess,
}: AdminEventReminderModalProps) {
  const { user, getIdToken } = useAuth();

  const [targetAudience, setTargetAudience] = useState<'all' | 'attendees'>('all');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [reminderType, setReminderType] = useState<'reminder' | 'update' | 'promo' | 'custom'>('reminder');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const attendeesCount =
    event?.attendees && event.attendees.length > 0
      ? event.attendees.length
      : event?.attendeePreviews && Object.keys(event.attendeePreviews).length > 0
      ? Object.keys(event.attendeePreviews).length
      : event?.attendeesCount || 0;

  // Initialize form when event opens
  useEffect(() => {
    if (visible && event) {
      const eventDateStr = event.event_start_date ? formatFriendlyDate(event.event_start_date) : 'soon';
      setTitle(`Reminder: ${event.title}`);
      setMessage(`"${event.title}" is coming up on ${eventDateStr}! Check your schedule and arrive on time.`);
      setReminderType('reminder');
      setTargetAudience('all');
      setErrorMsg(null);
      setSuccessMsg(null);
      setIsSending(false);
    }
  }, [visible, event]);

  const handleApplyPreset = (type: 'reminder' | 'update' | 'promo') => {
    if (!event) return;
    setReminderType(type);
    const eventDateStr = event.event_start_date ? formatFriendlyDate(event.event_start_date) : 'soon';

    if (type === 'reminder') {
      setTitle(`Reminder: ${event.title}`);
      setMessage(`"${event.title}" is scheduled for ${eventDateStr}${event.time ? ` at ${event.time}` : ''}. Tap for venue & details!`);
    } else if (type === 'update') {
      setTitle(`Important Update: ${event.title}`);
      setMessage(`Important update regarding "${event.title}". Please check the latest instructions in your campus feed.`);
    } else if (type === 'promo') {
      setTitle(`Don't Miss: ${event.title}`);
      setMessage(`Get ready for "${event.title}"! Connect with fellow GSTians and prepare your projects.`);
    }
  };

  const handleSend = async () => {
    if (!event) return;

    const cleanTitle = title.trim();
    const cleanMessage = message.trim();

    if (!cleanTitle) {
      setErrorMsg('Please enter a notification title.');
      return;
    }

    if (!cleanMessage) {
      setErrorMsg('Please enter a notification message.');
      return;
    }

    if (targetAudience === 'attendees' && attendeesCount === 0) {
      setErrorMsg('No students have saved this event yet. Select "All Campus Students" to notify everyone.');
      return;
    }

    setIsSending(true);
    setErrorMsg(null);

    try {
      const idToken = await getIdToken();
      if (!idToken) {
        setErrorMsg('Authentication expired. Please sign in as admin again.');
        setIsSending(false);
        return;
      }

      if (targetAudience === 'all') {
        const broadcastRes = await broadcastCommunityPushNotification(WORKER_BASE_URL, idToken, {
          eventId: event.id,
          title: cleanTitle,
          body: cleanMessage,
          eventType: event.type,
        }).catch(() => null);

        await saveCollegeAnnouncement({
          college: 'SIES_GST',
          title: cleanTitle,
          message: cleanMessage,
          eventId: event.id,
          type: event.type,
          adminUid: user?.uid,
        }).catch(() => {});

        const recipients = broadcastRes?.recipientsCount ?? 0;
        setSuccessMsg(
          recipients > 0
            ? `Broadcast sent to ${recipients} student(s) & saved to Notification Center!`
            : 'Campus announcement published to Notification Center for all students!'
        );
        if (onSuccess) {
          onSuccess(recipients);
        }
        setTimeout(() => {
          onClose();
        }, 1800);
      } else {
        const result = await sendEventAttendeeReminder(WORKER_BASE_URL, idToken, {
          eventId: event.id,
          title: cleanTitle,
          message: cleanMessage,
          reminderType,
        });

        await saveCollegeAnnouncement({
          college: 'SIES_GST',
          title: `🔔 ${cleanTitle}`,
          message: cleanMessage,
          eventId: event.id,
          type: event.type,
          adminUid: user?.uid,
        }).catch(() => {});

        if (result.success) {
          setSuccessMsg(result.message || `Dispatched to ${result.notifiedCount} attendee(s).`);
          if (onSuccess) {
            onSuccess(result.notifiedCount);
          }
          setTimeout(() => {
            onClose();
          }, 1800);
        } else {
          setErrorMsg(result.message || 'Failed to dispatch reminders.');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error sending push notifications.');
    } finally {
      setIsSending(false);
    }
  };

  if (!event) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          <View style={styles.modalContainer}>
            <GlassCard contentStyle={styles.card}>
              {/* Header */}
              <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                  <View style={styles.headerIconCircle}>
                    <Ionicons name="notifications" size={18} color={colors.primary} />
                  </View>
                  <View>
                    <View style={styles.titleBadgeRow}>
                      <Text style={styles.headerTitle}>Notify Event Attendees</Text>
                      <View style={styles.adminBadge}>
                        <Text style={styles.adminBadgeText}>ADMIN ONLY</Text>
                      </View>
                    </View>
                    <Text style={styles.headerSubtitle} numberOfLines={1}>
                      {event.title}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Target Audience Selector */}
              <View style={styles.audienceSelectorWrap}>
                <Text style={styles.sectionLabel}>Target Audience</Text>
                <View style={styles.audienceTabsRow}>
                  <TouchableOpacity
                    style={[
                      styles.audienceTabBtn,
                      targetAudience === 'all' && styles.audienceTabBtnActive,
                    ]}
                    onPress={() => {
                      setTargetAudience('all');
                      setErrorMsg(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="megaphone"
                      size={13}
                      color={targetAudience === 'all' ? '#FFFFFF' : colors.primary}
                    />
                    <Text
                      style={[
                        styles.audienceTabBtnText,
                        targetAudience === 'all' && styles.audienceTabBtnTextActive,
                      ]}
                    >
                      All Campus Students
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.audienceTabBtn,
                      targetAudience === 'attendees' && styles.audienceTabBtnActive,
                    ]}
                    onPress={() => {
                      setTargetAudience('attendees');
                      setErrorMsg(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="people"
                      size={13}
                      color={targetAudience === 'attendees' ? '#FFFFFF' : colors.primary}
                    />
                    <Text
                      style={[
                        styles.audienceTabBtnText,
                        targetAudience === 'attendees' && styles.audienceTabBtnTextActive,
                      ]}
                    >
                      Attendees ({attendeesCount})
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Target Audience Scope Banner */}
                <View
                  style={[
                    styles.targetScopeBox,
                    targetAudience === 'attendees' && attendeesCount === 0 && styles.targetScopeBoxZero,
                  ]}
                >
                  <Ionicons
                    name={
                      targetAudience === 'all'
                        ? 'megaphone'
                        : attendeesCount > 0
                        ? 'people'
                        : 'people-outline'
                    }
                    size={18}
                    color={
                      targetAudience === 'all'
                        ? colors.primary
                        : attendeesCount > 0
                        ? colors.primary
                        : colors.warning
                    }
                  />
                  <View style={styles.targetScopeTextWrap}>
                    <Text style={styles.targetScopeTitle}>
                      {targetAudience === 'all'
                        ? 'Broadcasting to All Campus Students'
                        : attendeesCount > 0
                        ? `Targeting: ${attendeesCount} student${attendeesCount > 1 ? 's' : ''} who saved this event`
                        : '0 students have saved this event yet'}
                    </Text>
                    <Text style={styles.targetScopeSubtitle}>
                      {targetAudience === 'all'
                        ? 'Push notifications sent to campus & announcement added to dashboard Notification Center.'
                        : attendeesCount > 0
                        ? 'Delivered to students who added this event to their schedule.'
                        : 'No attendees yet. Select "All Campus Students" above to broadcast this event to everyone.'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Success View */}
              {successMsg ? (
                <View style={styles.successState}>
                  <Ionicons name="checkmark-circle" size={44} color={colors.success} />
                  <Text style={styles.successTitle}>Push Notification Sent!</Text>
                  <Text style={styles.successDesc}>{successMsg}</Text>
                </View>
              ) : (
                <ScrollView
                  style={styles.bodyScroll}
                  contentContainerStyle={styles.bodyScrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {/* Quick Presets */}
                  <Text style={styles.sectionLabel}>Quick Message Presets</Text>
                  <View style={styles.presetRow}>
                    <TouchableOpacity
                      style={[styles.presetChip, reminderType === 'reminder' && styles.presetChipActive]}
                      onPress={() => handleApplyPreset('reminder')}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="alarm-outline"
                        size={13}
                        color={reminderType === 'reminder' ? colors.primary : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.presetChipText,
                          reminderType === 'reminder' && styles.presetChipTextActive,
                        ]}
                      >
                        Event Reminder
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.presetChip, reminderType === 'update' && styles.presetChipActive]}
                      onPress={() => handleApplyPreset('update')}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="megaphone-outline"
                        size={13}
                        color={reminderType === 'update' ? colors.primary : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.presetChipText,
                          reminderType === 'update' && styles.presetChipTextActive,
                        ]}
                      >
                        Important Update
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.presetChip, reminderType === 'promo' && styles.presetChipActive]}
                      onPress={() => handleApplyPreset('promo')}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="sparkles-outline"
                        size={13}
                        color={reminderType === 'promo' ? colors.primary : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.presetChipText,
                          reminderType === 'promo' && styles.presetChipTextActive,
                        ]}
                      >
                        Campus Hype
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Title Input */}
                  <View style={styles.inputGroup}>
                    <View style={styles.inputHeader}>
                      <Text style={styles.inputLabel}>Notification Title</Text>
                      <Text style={styles.charCounter}>{title.length}/150</Text>
                    </View>
                    <TextInput
                      style={styles.singleTextInput}
                      placeholder="e.g. Reminder: Hackathon Tomorrow at 10 AM"
                      placeholderTextColor="#94A3B8"
                      maxLength={150}
                      value={title}
                      onChangeText={(t) => {
                        setTitle(t);
                        setReminderType('custom');
                      }}
                      editable={!isSending}
                    />
                  </View>

                  {/* Message Input */}
                  <View style={styles.inputGroup}>
                    <View style={styles.inputHeader}>
                      <Text style={styles.inputLabel}>Notification Message</Text>
                      <Text style={styles.charCounter}>{message.length}/500</Text>
                    </View>
                    <TextInput
                      style={styles.multiTextInput}
                      placeholder="Write the reminder or announcement for attendees..."
                      placeholderTextColor="#94A3B8"
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      maxLength={500}
                      value={message}
                      onChangeText={(m) => {
                        setMessage(m);
                        setReminderType('custom');
                      }}
                      editable={!isSending}
                    />
                  </View>

                  {/* Error Banner */}
                  {errorMsg && (
                    <View style={styles.errorBanner}>
                      <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
                      <Text style={styles.errorText}>{errorMsg}</Text>
                    </View>
                  )}

                  {/* Delivery Notice */}
                  <Text style={styles.noticeText}>
                    🔒 Dispatched via high-priority push notification and logged in attendees&apos; private notification inbox.
                  </Text>
                </ScrollView>
              )}

              {/* Footer Buttons */}
              {!successMsg && (
                <View style={styles.btnRow}>
                  <GlassButton
                    title="Cancel"
                    variant="glass"
                    onPress={onClose}
                    style={styles.cancelBtn}
                    disabled={isSending}
                  />
                  <GlassButton
                    title="Send to Attendees"
                    variant="primary"
                    onPress={handleSend}
                    loading={isSending}
                    disabled={attendeesCount === 0 || !title.trim() || !message.trim() || isSending}
                    style={[
                      styles.sendBtn,
                      (attendeesCount === 0 || !title.trim() || !message.trim()) && styles.disabledBtn,
                    ]}
                    icon={<Ionicons name="paper-plane" size={14} color="#FFFFFF" />}
                  />
                </View>
              )}
            </GlassCard>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  keyboardView: {
    width: '100%',
    maxWidth: 480,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContainer: {
    width: '100%',
    maxHeight: '88%',
  },
  card: {
    padding: 16,
    borderRadius: radii.card,
    maxHeight: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
    paddingBottom: 10,
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  adminBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  adminBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.danger,
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
  },
  audienceSelectorWrap: {
    gap: 8,
    marginBottom: 4,
  },
  audienceTabsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  audienceTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: radii.control,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    ...shadows.subtle,
  },
  audienceTabBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  audienceTabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  audienceTabBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  targetScopeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    borderRadius: radii.control,
    padding: 10,
    marginBottom: 8,
  },
  targetScopeBoxZero: {
    backgroundColor: colors.warningLight,
    borderColor: 'rgba(217, 119, 6, 0.25)',
  },
  targetScopeTextWrap: {
    flex: 1,
    gap: 2,
  },
  targetScopeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  targetScopeSubtitle: {
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 14,
  },
  bodyScroll: {
    flexShrink: 1,
  },
  bodyScrollContent: {
    paddingVertical: 6,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    ...shadows.subtle,
  },
  presetChipActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderColor: colors.primary,
  },
  presetChipText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  presetChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  inputGroup: {
    gap: 4,
  },
  inputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  charCounter: {
    fontSize: 10,
    color: colors.textTertiary,
  },
  singleTextInput: {
    height: 44,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: radii.control,
    paddingHorizontal: 12,
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '500',
  },
  multiTextInput: {
    minHeight: 76,
    maxHeight: 120,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: radii.control,
    padding: 12,
    color: '#0F172A',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.dangerLight,
    padding: 8,
    borderRadius: radii.control,
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    color: colors.danger,
  },
  noticeText: {
    fontSize: 10,
    color: colors.textTertiary,
    lineHeight: 14,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 40,
  },
  sendBtn: {
    flex: 2,
    minHeight: 40,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  successState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  successTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  successDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
