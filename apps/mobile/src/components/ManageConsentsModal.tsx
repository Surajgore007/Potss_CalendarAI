import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { unregisterPushTokenAsync, registerForPushNotificationsAsync } from '../services/pushNotificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlassCard } from './ui/GlassCard';
import { GlassButton } from './ui/GlassButton';
import { colors, radii } from '../theme/tokens';

interface ManageConsentsModalProps {
  visible: boolean;
  onClose: () => void;
  onOpenDeleteAccount: () => void;
}

export function ManageConsentsModal({
  visible,
  onClose,
  onOpenDeleteAccount,
}: ManageConsentsModalProps) {
  const { user } = useAuth();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [isUpdatingPush, setIsUpdatingPush] = useState(false);

  // Sync toggle state with the actually saved push token on every modal open.
  // The storage key mirrors what registerForPushNotificationsAsync writes.
  useEffect(() => {
    if (!visible || !user?.uid) return;
    const PUSH_TOKEN_KEY = `@vanko_cached_push_token_${user.uid}`;
    AsyncStorage.getItem(PUSH_TOKEN_KEY)
      .then((stored) => {
        // Token present and non-empty means pushes are currently enabled.
        setPushEnabled(typeof stored === 'string' && stored.length > 0);
      })
      .catch(() => {
        // On read error keep the optimistic default (true) so the UX doesn't
        // silently break — the real state will correct on next successful read.
        setPushEnabled(true);
      });
  }, [visible, user?.uid]);

  const handleTogglePush = async (newValue: boolean) => {
    setPushEnabled(newValue);
    if (!user?.uid) return;

    setIsUpdatingPush(true);
    try {
      if (newValue) {
        await registerForPushNotificationsAsync(user.uid, user.college || 'General');
      } else {
        await unregisterPushTokenAsync(user.uid);
      }
    } catch (e) {
      console.warn('Error updating push consent:', e);
    } finally {
      setIsUpdatingPush(false);
    }
  };

  const handleWithdrawCoreConsent = () => {
    onClose();
    // Transition to verified deletion flow
    setTimeout(() => {
      onOpenDeleteAccount();
    }, 200);
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
            {/* Header - Fixed */}
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.textPrimary} />
                </View>
                <View style={styles.headerTextWrap}>
                  <Text style={styles.headerTitle} numberOfLines={1}>Manage Data Consents</Text>
                  <Text style={styles.headerSubtitle} numberOfLines={1}>Privacy Choices & Permissions</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Scrollable Body */}
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.bodyScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.introText}>
                You have complete control over how your data is processed. You can review or adjust your permissions below at any time.
              </Text>

              {/* Section 1: Optional Consents */}
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>Optional Data Consents</Text>

                <View style={styles.consentItem}>
                  <View style={styles.consentTextCol}>
                    <Text style={styles.consentTitle}>Push Notifications & Reminders</Text>
                    <Text style={styles.consentDesc}>
                      Delivers on-device deadline notifications 24 hours prior to registration dates. You may disable this at any time without affecting your stored calendar schedule.
                    </Text>
                  </View>
                  <Switch
                    value={pushEnabled}
                    onValueChange={handleTogglePush}
                    disabled={isUpdatingPush}
                    trackColor={{ false: colors.canvasSubtle, true: colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>

              {/* Section 2: Essential Service Consent */}
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>Essential Service Consent</Text>

                <View style={styles.essentialBox}>
                  <View style={styles.essentialHeader}>
                    <Ionicons name="calendar-outline" size={16} color={colors.textPrimary} />
                    <Text style={styles.essentialTitle}>Core Calendar Processing & Extraction</Text>
                  </View>
                  <Text style={styles.essentialDesc}>
                    Stores your timetable entries and processes unstructured text for AI event extraction.
                  </Text>
                  <View style={styles.essentialNoticeBox}>
                    <Text style={styles.essentialNotice}>
                      <Text style={styles.boldNotice}>Account Closure Notice: </Text>
                      Vanko requires schedule data to operate. Withdrawing core processing consent will permanently close your account and delete your stored data.
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.withdrawBtn}
                    onPress={handleWithdrawCoreConsent}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash-outline" size={14} color={colors.danger} />
                    <Text style={styles.withdrawBtnText}>Withdraw Core Consent & Delete Account</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            {/* Footer - Fixed */}
            <GlassButton
              title="Done"
              variant="primary"
              onPress={onClose}
              style={styles.doneBtn}
            />
          </GlassCard>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '86%',
  },
  card: {
    padding: 20,
    borderRadius: radii.card,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    maxHeight: '100%',
    display: 'flex',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
    paddingBottom: 12,
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  closeBtn: {
    padding: 4,
    flexShrink: 0,
  },
  bodyScroll: {
    flexShrink: 1,
  },
  bodyScrollContent: {
    gap: 14,
    paddingBottom: 8,
  },
  introText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  consentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    backgroundColor: colors.canvasSubtle,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  consentTextCol: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  consentTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  consentDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  essentialBox: {
    padding: 14,
    backgroundColor: colors.canvasSubtle,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    gap: 10,
  },
  essentialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  essentialTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  essentialDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  essentialNoticeBox: {
    backgroundColor: colors.dangerLight,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
    padding: 10,
    borderRadius: 6,
  },
  essentialNotice: {
    fontSize: 11,
    color: colors.danger,
    lineHeight: 16,
  },
  boldNotice: {
    fontWeight: '700',
    color: colors.danger,
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.2)',
    backgroundColor: colors.dangerLight,
    marginTop: 4,
  },
  withdrawBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.danger,
  },
  doneBtn: {
    minHeight: 44,
    marginTop: 10,
  },
});

