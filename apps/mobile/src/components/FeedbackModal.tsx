import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { GlassCard } from './ui/GlassCard';
import { GlassButton } from './ui/GlassButton';
import { colors, radii } from '../theme/tokens';

export type FeedbackCategory = 'bug' | 'suggestion' | 'complaint' | 'other';

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
  initialTab?: 'compose' | 'replies';
}

const CATEGORIES: { id: FeedbackCategory; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'bug', label: 'Bug Report', icon: 'bug-outline' },
  { id: 'suggestion', label: 'Suggestion', icon: 'bulb-outline' },
  { id: 'complaint', label: 'Complaint', icon: 'alert-circle-outline' },
  { id: 'other', label: 'General / Other', icon: 'chatbox-ellipses-outline' },
];

const WORKER_BASE_URL =
  process.env.EXPO_PUBLIC_WORKER_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  'https://vanko-api.vanko-app.workers.dev';

export function FeedbackModal({ visible, onClose, initialTab = 'compose' }: FeedbackModalProps) {
  const { getIdToken } = useAuth();

  const [category, setCategory] = useState<FeedbackCategory>('suggestion');
  const [message, setMessage] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // User's previous feedback submissions with developer replies
  const [replies, setReplies] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'compose' | 'replies'>(initialTab);

  React.useEffect(() => {
    if (visible && initialTab) {
      setActiveTab(initialTab);
    }
  }, [visible, initialTab]);

  const fetchReplies = async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;
      const res = await fetch(`${WORKER_BASE_URL}/api/feedback/my-replies`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        const list = (data.submissions || []).filter((s: any) => !!s.adminReply);
        setReplies(list);
      }
    } catch {
      // Ignored (best-effort)
    }
  };

  React.useEffect(() => {
    if (visible) {
      fetchReplies();
    }
  }, [visible]);

  const resetForm = () => {
    setMessage('');
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    setErrorMsg(null);
    const cleanMessage = message.trim();

    if (cleanMessage.length < 10) {
      setErrorMsg('Please enter at least 10 characters describing your feedback.');
      return;
    }

    if (cleanMessage.length > 2000) {
      setErrorMsg('Feedback message exceeds the 2000 character limit.');
      return;
    }

    setIsSubmitting(true);

    try {
      const idToken = await getIdToken();
      if (!idToken) {
        setErrorMsg('Please log in again before sending feedback.');
        setIsSubmitting(false);
        return;
      }

      const res = await fetch(`${WORKER_BASE_URL}/api/feedback`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category,
          message: cleanMessage,
          platform: Platform.OS,
          appVersion: '1.0.0',
        }),
      });

      const data = (await res.json()) as any;

      if (!res.ok) {
        setErrorMsg(data.message || 'Unable to submit feedback. Please try again later.');
        setIsSubmitting(false);
        return;
      }

      setSuccessMsg('Thanks — your feedback has been sent to the team.');
      setTimeout(() => {
        handleClose();
      }, 1800);
    } catch {
      setErrorMsg('Network connection error. Please check your connection.');
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          <View style={styles.modalContainer}>
            <GlassCard contentStyle={styles.card}>
              {/* Fixed Header */}
              <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                  <View style={styles.headerIconCircle}>
                    <Ionicons name="chatbubbles-outline" size={18} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.headerTitle}>Send Feedback</Text>
                    <Text style={styles.headerSubtitle}>Direct to Platform Developers (Admin-Only)</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={handleClose}
                  style={styles.closeBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Sub-tab Bar if developer replies exist */}
              {replies.length > 0 && (
                <View style={styles.tabHeaderRow}>
                  <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'compose' && styles.tabButtonActive]}
                    onPress={() => setActiveTab('compose')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tabButtonText, activeTab === 'compose' && styles.tabButtonTextActive]}>
                      New Feedback
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'replies' && styles.tabButtonActive]}
                    onPress={() => setActiveTab('replies')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.replyBadgeRow}>
                      <Text style={[styles.tabButtonText, activeTab === 'replies' && styles.tabButtonTextActive]}>
                        Developer Replies
                      </Text>
                      <View style={styles.replyCountBadge}>
                        <Text style={styles.replyCountText}>{replies.length}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              )}

              {/* Success View */}
              {successMsg ? (
                <View style={styles.successState}>
                  <Ionicons name="checkmark-circle" size={44} color={colors.success} />
                  <Text style={styles.successTitle}>Feedback Received!</Text>
                  <Text style={styles.successDesc}>{successMsg}</Text>
                </View>
              ) : activeTab === 'replies' ? (
                /* Developer Replies View */
                <ScrollView
                  style={styles.bodyScroll}
                  contentContainerStyle={styles.bodyScrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.sectionLabel}>Private Responses From Platform Developers</Text>
                  {replies.map((rep) => (
                    <View key={rep.id} style={styles.replyCard}>
                      <View style={styles.replyCardHeader}>
                        <View style={styles.devBadge}>
                          <Ionicons name="shield-checkmark" size={12} color="#FFFFFF" />
                          <Text style={styles.devBadgeText}>{rep.adminRepliedBy || 'Developer Team'}</Text>
                        </View>
                        <Text style={styles.replyDateText}>
                          {rep.adminRepliedAt ? new Date(rep.adminRepliedAt).toLocaleDateString() : 'Recently'}
                        </Text>
                      </View>

                      {/* Admin's message */}
                      <Text style={styles.replyAdminText}>{rep.adminReply}</Text>

                      {/* Original user query */}
                      <View style={styles.originalQueryBox}>
                        <Text style={styles.originalQueryLabel}>In response to your {rep.category}:</Text>
                        <Text style={styles.originalQueryText} numberOfLines={2}>
                          &quot;{rep.message}&quot;
                        </Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <>
                  {/* Scrollable Form Body */}
                  <ScrollView
                    style={styles.bodyScroll}
                    contentContainerStyle={styles.bodyScrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    {/* Category Picker */}
                    <Text style={styles.sectionLabel}>Category</Text>
                    <View style={styles.categoryGrid}>
                      {CATEGORIES.map((cat) => {
                        const isSelected = category === cat.id;
                        return (
                          <TouchableOpacity
                            key={cat.id}
                            style={[
                              styles.categoryPill,
                              isSelected && styles.categoryPillSelected,
                            ]}
                            onPress={() => setCategory(cat.id)}
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name={cat.icon}
                              size={13}
                              color={isSelected ? colors.primary : colors.textSecondary}
                            />
                            <Text
                              style={[
                                styles.categoryLabel,
                                isSelected && styles.categoryLabelSelected,
                              ]}
                            >
                              {cat.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Message Input - Clean White Background */}
                    <View style={styles.messageBlock}>
                      <View style={styles.inputHeader}>
                        <Text style={styles.sectionLabel}>Your Message</Text>
                        <Text style={styles.counterText}>{message.length}/2000</Text>
                      </View>
                      <TextInput
                        style={styles.textInput}
                        placeholder="Tell us what happened or what features you'd like to see..."
                        placeholderTextColor="#64748B"
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                        maxLength={2000}
                        value={message}
                        onChangeText={setMessage}
                        editable={!isSubmitting}
                      />
                    </View>

                    {/* Error Banner */}
                    {errorMsg && (
                      <View style={styles.errorBanner}>
                        <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
                        <Text style={styles.errorText}>{errorMsg}</Text>
                      </View>
                    )}

                    {/* Notice */}
                    <Text style={styles.privacyNotice}>
                      🔒 Submissions are delivered securely to platform administrators only. No regular user can view your feedback.
                    </Text>
                  </ScrollView>

                  {/* Fixed Footer Action Buttons */}
                  <View style={styles.btnRow}>
                    <GlassButton
                      title="Cancel"
                      variant="glass"
                      onPress={handleClose}
                      style={styles.cancelBtn}
                      disabled={isSubmitting}
                    />
                    <GlassButton
                      title="Submit Feedback"
                      variant="primary"
                      onPress={handleSubmit}
                      loading={isSubmitting}
                      style={styles.submitBtn}
                    />
                  </View>
                </>
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
    maxWidth: 460,
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
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 10,
    color: colors.textTertiary,
  },
  closeBtn: {
    padding: 4,
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
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  categoryPillSelected: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderColor: colors.primary,
  },
  categoryLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  categoryLabelSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  messageBlock: {
    gap: 4,
  },
  inputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counterText: {
    fontSize: 10,
    color: colors.textTertiary,
  },
  tabHeaderRow: {
    flexDirection: 'row',
    backgroundColor: colors.canvasSubtle,
    borderRadius: radii.control,
    padding: 3,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.control - 2,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.primary,
  },
  tabButtonText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabButtonTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  replyBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  replyCountBadge: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  replyCountText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  replyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.control,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  replyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  devBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  devBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  replyDateText: {
    fontSize: 10,
    color: colors.textTertiary,
  },
  replyAdminText: {
    fontSize: 13,
    color: '#0F172A',
    lineHeight: 19,
    fontWeight: '500',
  },
  originalQueryBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  originalQueryLabel: {
    fontSize: 10,
    color: colors.textTertiary,
    fontWeight: '600',
    marginBottom: 2,
  },
  originalQueryText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  textInput: {
    minHeight: 88,
    maxHeight: 125,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: radii.control,
    padding: 12,
    color: '#0F172A',
    fontSize: 14,
    lineHeight: 20,
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
  privacyNotice: {
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
  submitBtn: {
    flex: 2,
    minHeight: 40,
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

