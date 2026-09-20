import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  RefreshControl,
  Platform,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { GlassCard } from './ui/GlassCard';
import { GlassButton } from './ui/GlassButton';
import { colors, radii } from '../theme/tokens';
import { FeedbackCategory } from './FeedbackModal';

export interface FeedbackItem {
  id: string;
  category: FeedbackCategory;
  message: string;
  uid?: string;
  email?: string;
  attachmentUrl?: string;
  platform?: string;
  appVersion?: string;
  createdAt?: string;
  adminReply?: string | null;
  adminRepliedAt?: string | null;
  adminRepliedBy?: string | null;
}

interface AdminFeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

const WORKER_BASE_URL =
  process.env.EXPO_PUBLIC_WORKER_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  'https://vanko-api.vanko-app.workers.dev';

const FILTER_TABS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'bug', label: 'Bugs' },
  { id: 'suggestion', label: 'Suggestions' },
  { id: 'complaint', label: 'Complaints' },
  { id: 'other', label: 'Other' },
];

export function AdminFeedbackModal({ visible, onClose }: AdminFeedbackModalProps) {
  const { getIdToken, isAdmin } = useAuth();
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Private reply state
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replySuccessId, setReplySuccessId] = useState<string | null>(null);
  const [replyActionError, setReplyActionError] = useState<string | null>(null);

  const handleOpenReply = (item: FeedbackItem) => {
    setReplyingToId(item.id);
    setReplyText(item.adminReply || '');
    setReplyActionError(null);
    setReplySuccessId(null);
  };

  const handleCancelReply = () => {
    setReplyingToId(null);
    setReplyText('');
    setReplyActionError(null);
  };

  const handleSendReply = async (item: FeedbackItem) => {
    const trimmed = replyText.trim();
    if (trimmed.length < 2) {
      setReplyActionError('Please enter a response message.');
      return;
    }

    setIsSendingReply(true);
    setReplyActionError(null);

    try {
      const idToken = await getIdToken();
      if (!idToken) {
        setReplyActionError('Authentication token expired. Please re-sign in.');
        setIsSendingReply(false);
        return;
      }

      const res = await fetch(`${WORKER_BASE_URL}/api/admin/feedback/reply`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          feedbackId: item.id,
          replyMessage: trimmed,
          recipientUid: item.uid,
        }),
      });

      const data = (await res.json()) as any;

      if (!res.ok) {
        setReplyActionError(data.message || 'Failed to deliver private reply.');
        setIsSendingReply(false);
        return;
      }

      const nowIso = new Date().toISOString();
      setFeedbacks((prev) =>
        prev.map((f) =>
          f.id === item.id
            ? {
                ...f,
                adminReply: trimmed,
                adminRepliedAt: nowIso,
                adminRepliedBy: 'Platform Admin',
              }
            : f
        )
      );

      setReplySuccessId(item.id);
      setReplyingToId(null);
      setReplyText('');
      setTimeout(() => {
        setReplySuccessId((cur) => (cur === item.id ? null : cur));
      }, 4000);
    } catch {
      setReplyActionError('Network connection error sending reply.');
    } finally {
      setIsSendingReply(false);
    }
  };

  const fetchFeedbacks = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMsg(null);

    try {
      const idToken = await getIdToken();
      if (!idToken) {
        setErrorMsg('Authentication required. Please sign in as an administrator.');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const res = await fetch(`${WORKER_BASE_URL}/api/admin/feedback`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!res.ok) {
        if (res.status === 403) {
          setErrorMsg('Access Denied: Platform administrator credentials required.');
        } else if (res.status === 401) {
          setErrorMsg('Session expired. Please re-authenticate.');
        } else {
          setErrorMsg('Unable to fetch feedback reports at this time.');
        }
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const data = (await res.json()) as any;
      const list: FeedbackItem[] = data.feedback || [];
      // Sort newest first
      list.sort((a, b) => {
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tB - tA;
      });
      setFeedbacks(list);
    } catch {
      setErrorMsg('Network error connecting to platform administrative service.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (visible) {
      fetchFeedbacks();
    }
  }, [visible, fetchFeedbacks]);

  const filteredList = feedbacks.filter((item) => {
    if (selectedFilter === 'all') return true;
    return item.category === selectedFilter;
  });

  const getCategoryBadge = (cat: FeedbackCategory) => {
    switch (cat) {
      case 'bug':
        return { bg: colors.dangerLight, text: colors.danger, icon: 'bug-outline', label: 'Bug' };
      case 'suggestion':
        return { bg: 'rgba(99, 102, 241, 0.15)', text: colors.primary, icon: 'bulb-outline', label: 'Suggestion' };
      case 'complaint':
        return { bg: colors.warningLight, text: colors.warning, icon: 'alert-circle-outline', label: 'Complaint' };
      default:
        return { bg: colors.canvasSubtle, text: colors.textSecondary, icon: 'chatbox-ellipses-outline', label: 'General' };
    }
  };

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return 'Recently';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <GlassCard contentStyle={styles.card}>
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIconCircle}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
                </View>
                <View>
                  <View style={styles.titleBadgeRow}>
                    <Text style={styles.headerTitle}>User Feedback Inbox</Text>
                    <View style={styles.adminBadge}>
                      <Text style={styles.adminBadgeText}>ADMIN ONLY</Text>
                    </View>
                  </View>
                  <Text style={styles.headerSubtitle}>Direct Submissions • End-to-End Encrypted</Text>
                </View>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  onPress={() => fetchFeedbacks(true)}
                  style={styles.refreshBtn}
                  disabled={loading || refreshing}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="reload-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Filter Tabs */}
            <View style={styles.filterRow}>
              {FILTER_TABS.map((tab) => {
                const isSelected = selectedFilter === tab.id;
                const count = tab.id === 'all'
                  ? feedbacks.length
                  : feedbacks.filter((f) => f.category === tab.id).length;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    onPress={() => setSelectedFilter(tab.id)}
                    style={[styles.filterPill, isSelected && styles.filterPillSelected]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.filterPillText, isSelected && styles.filterPillTextSelected]}>
                      {tab.label} {count > 0 ? `(${count})` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Error Banner */}
            {errorMsg && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {/* Main List */}
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Fetching authenticated submissions...</Text>
              </View>
            ) : filteredList.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="mail-open-outline" size={42} color={colors.textTertiary} />
                <Text style={styles.emptyTitle}>No Submissions Found</Text>
                <Text style={styles.emptySubtitle}>
                  {selectedFilter === 'all'
                    ? 'No users have submitted feedback yet.'
                    : `No feedback in category "${selectedFilter}".`}
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.listScroll}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => fetchFeedbacks(true)}
                    colors={[colors.primary]}
                    tintColor={colors.primary}
                  />
                }
              >
                {filteredList.map((item) => {
                  const badge = getCategoryBadge(item.category);
                  return (
                    <View key={item.id} style={styles.itemCard}>
                      {/* Meta header */}
                      <View style={styles.itemHeader}>
                        <View style={[styles.badgePill, { backgroundColor: badge.bg }]}>
                          <Ionicons name={badge.icon as any} size={11} color={badge.text} />
                          <Text style={[styles.badgeText, { color: badge.text }]}>
                            {badge.label}
                          </Text>
                        </View>
                        <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
                      </View>

                      {/* Submitter Info */}
                      <View style={styles.submitterRow}>
                        <Ionicons name="person-circle-outline" size={14} color={colors.textTertiary} />
                        <Text style={styles.submitterText} numberOfLines={1}>
                          {item.email || (item.uid ? `UID: ${item.uid.substring(0, 10)}...` : 'Anonymous')}
                        </Text>
                        {item.platform && (
                          <View style={styles.platformBadge}>
                            <Text style={styles.platformText}>
                              {item.platform.toUpperCase()}{item.appVersion ? ` v${item.appVersion}` : ''}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Message body */}
                      <Text style={styles.messageText}>{item.message}</Text>

                      {/* Attachment thumbnail if present */}
                      {item.attachmentUrl && (
                        <TouchableOpacity
                          style={styles.attachmentThumbnailWrap}
                          onPress={() => setPreviewImage(item.attachmentUrl || null)}
                          activeOpacity={0.8}
                        >
                          <Image
                            source={{ uri: item.attachmentUrl }}
                            style={styles.attachmentThumbnail}
                            resizeMode="cover"
                          />
                          <View style={styles.attachmentCaption}>
                            <Ionicons name="expand-outline" size={12} color="#FFF" />
                            <Text style={styles.attachmentCaptionText}>View Screenshot</Text>
                          </View>
                        </TouchableOpacity>
                      )}

                      {/* Existing Admin Reply */}
                      {item.adminReply && (
                        <View style={styles.existingReplyCard}>
                          <View style={styles.existingReplyHeader}>
                            <View style={styles.devBadge}>
                              <Ionicons name="shield-checkmark" size={11} color="#FFFFFF" />
                              <Text style={styles.devBadgeText}>Admin Private Reply</Text>
                            </View>
                            <Text style={styles.replyTimestamp}>{formatDate(item.adminRepliedAt || undefined)}</Text>
                          </View>
                          <Text style={styles.existingReplyText}>{item.adminReply}</Text>
                          {item.adminRepliedBy && (
                            <Text style={styles.repliedByAuthor}>Sent by: {item.adminRepliedBy}</Text>
                          )}
                        </View>
                      )}

                      {/* Temporary Success Indicator */}
                      {replySuccessId === item.id && (
                        <View style={styles.replySuccessBanner}>
                          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                          <Text style={styles.replySuccessText}>
                            Private reply delivered to user&apos;s device inbox!
                          </Text>
                        </View>
                      )}

                      {/* Reply Composer or Reply Trigger */}
                      {replyingToId === item.id ? (
                        <View style={styles.replyComposer}>
                          <View style={styles.composerHeader}>
                            <Ionicons name="return-down-forward-outline" size={14} color={colors.primary} />
                            <Text style={styles.composerTitle}>
                              Private Reply to {item.email || (item.uid ? `User ${item.uid.substring(0, 8)}` : 'User')}
                            </Text>
                          </View>
                          <TextInput
                            style={styles.replyInput}
                            placeholder="Type your private response to this user..."
                            placeholderTextColor="#64748B"
                            multiline
                            numberOfLines={3}
                            textAlignVertical="top"
                            maxLength={1000}
                            value={replyText}
                            onChangeText={setReplyText}
                            editable={!isSendingReply}
                          />
                          <View style={styles.composerCharRow}>
                            <Text style={styles.composerNotice}>
                              Delivered securely to user&apos;s device inbox & push notification
                            </Text>
                            <Text style={styles.composerCounter}>{replyText.length}/1000</Text>
                          </View>
                          {replyActionError && (
                            <View style={styles.composerError}>
                              <Ionicons name="alert-circle-outline" size={13} color={colors.danger} />
                              <Text style={styles.composerErrorText}>{replyActionError}</Text>
                            </View>
                          )}
                          <View style={styles.composerBtnRow}>
                            <TouchableOpacity
                              style={styles.composerCancelBtn}
                              onPress={handleCancelReply}
                              disabled={isSendingReply}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.composerCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.composerSendBtn,
                                (!replyText.trim() || isSendingReply) && styles.composerSendBtnDisabled,
                              ]}
                              onPress={() => handleSendReply(item)}
                              disabled={!replyText.trim() || isSendingReply}
                              activeOpacity={0.8}
                            >
                              {isSendingReply ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <>
                                  <Ionicons name="paper-plane" size={13} color="#FFFFFF" />
                                  <Text style={styles.composerSendText}>
                                    {item.adminReply ? 'Update Reply' : 'Send Private Reply'}
                                  </Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.itemActionRow}>
                          <TouchableOpacity
                            style={[
                              styles.replyActionBtn,
                              item.adminReply ? styles.replyActionBtnReplied : null,
                            ]}
                            onPress={() => handleOpenReply(item)}
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name={item.adminReply ? 'pencil-outline' : 'chatbubble-ellipses-outline'}
                              size={14}
                              color={item.adminReply ? colors.textSecondary : colors.primary}
                            />
                            <Text
                              style={[
                                styles.replyActionBtnText,
                                item.adminReply ? styles.replyActionBtnTextReplied : null,
                              ]}
                            >
                              {item.adminReply ? 'Edit Private Reply' : 'Reply Privately'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {/* Footer */}
            <View style={styles.footerRow}>
              <Text style={styles.footerSecurityText}>
                🔒 Only authorized admins can view this stream. Firestore rules strictly block client reads.
              </Text>
              <GlassButton
                title="Close"
                variant="glass"
                onPress={onClose}
                style={styles.closeFooterBtn}
              />
            </View>
          </GlassCard>
        </View>

        {/* Screenshot Fullscreen Viewer Modal */}
        {previewImage && (
          <Modal
            visible={!!previewImage}
            transparent
            animationType="fade"
            onRequestClose={() => setPreviewImage(null)}
          >
            <View style={styles.imageModalOverlay}>
              <TouchableOpacity
                style={styles.imageModalCloseBtn}
                onPress={() => setPreviewImage(null)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close-circle" size={32} color="#FFFFFF" />
              </TouchableOpacity>
              <Image
                source={{ uri: previewImage }}
                style={styles.fullImage}
                resizeMode="contain"
              />
            </View>
          </Modal>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '92%',
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
    fontSize: 10,
    color: colors.textTertiary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshBtn: {
    padding: 4,
  },
  closeBtn: {
    padding: 4,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingVertical: 6,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  filterPillSelected: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderColor: colors.primary,
  },
  filterPillText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterPillTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.dangerLight,
    padding: 8,
    borderRadius: radii.control,
    marginVertical: 4,
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    color: colors.danger,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  listScroll: {
    flexShrink: 1,
  },
  listContent: {
    paddingVertical: 6,
    gap: 10,
  },
  itemCard: {
    backgroundColor: colors.canvasSubtle,
    borderRadius: radii.control,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    gap: 6,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  dateText: {
    fontSize: 10,
    color: colors.textTertiary,
  },
  submitterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  submitterText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
    flex: 1,
  },
  platformBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  platformText: {
    fontSize: 9,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  messageText: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  attachmentThumbnailWrap: {
    position: 'relative',
    marginTop: 4,
    width: 140,
    height: 90,
    borderRadius: radii.control - 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  attachmentThumbnail: {
    width: '100%',
    height: '100%',
  },
  attachmentCaption: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 3,
  },
  attachmentCaptionText: {
    fontSize: 9,
    color: '#FFF',
    fontWeight: '600',
  },
  existingReplyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radii.control,
    padding: 10,
    marginTop: 4,
    gap: 6,
  },
  existingReplyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  devBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  devBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  replyTimestamp: {
    fontSize: 10,
    color: colors.textTertiary,
  },
  existingReplyText: {
    fontSize: 12,
    color: '#0F172A',
    lineHeight: 17,
    fontWeight: '500',
  },
  repliedByAuthor: {
    fontSize: 10,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  replySuccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.successLight,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radii.control - 4,
    marginTop: 4,
  },
  replySuccessText: {
    fontSize: 11,
    color: colors.success,
    fontWeight: '600',
  },
  replyComposer: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.control,
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginTop: 6,
    gap: 8,
  },
  composerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  composerTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  replyInput: {
    minHeight: 70,
    maxHeight: 120,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radii.control - 4,
    padding: 10,
    color: '#0F172A',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  composerCharRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  composerNotice: {
    fontSize: 9,
    color: colors.textTertiary,
    flex: 1,
  },
  composerCounter: {
    fontSize: 10,
    color: colors.textTertiary,
  },
  composerError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.dangerLight,
    padding: 6,
    borderRadius: 4,
  },
  composerErrorText: {
    fontSize: 11,
    color: colors.danger,
    fontWeight: '500',
  },
  composerBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 2,
  },
  composerCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.control - 4,
    backgroundColor: colors.canvasSubtle,
  },
  composerCancelText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  composerSendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.control - 4,
    backgroundColor: colors.primary,
    minHeight: 32,
  },
  composerSendBtnDisabled: {
    opacity: 0.5,
  },
  composerSendText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  itemActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  replyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  replyActionBtnReplied: {
    backgroundColor: colors.canvasSubtle,
    borderColor: colors.glassBorder,
  },
  replyActionBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  replyActionBtnTextReplied: {
    color: colors.textSecondary,
    fontWeight: '500',
  },
  footerRow: {
    paddingTop: 10,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
    gap: 8,
  },
  footerSecurityText: {
    fontSize: 9,
    color: colors.textTertiary,
    lineHeight: 12,
  },
  closeFooterBtn: {
    minHeight: 38,
  },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  imageModalCloseBtn: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
  },
  fullImage: {
    width: '100%',
    height: '80%',
  },
});
