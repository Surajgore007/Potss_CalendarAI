import React, { useState } from 'react';
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
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.headerTitle}>Manage Data Consents</Text>
                  <Text style={styles.headerSubtitle}>DPDP Act 2023 Section 6(4)</Text>
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
                Under the Digital Personal Data Protection Act, 2023, you have the statutory right to review and withdraw consent for data processing purposes at any time.
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
                      <Text style={styles.boldNotice}>Note on Core Consent Withdrawal: </Text>
                      Because Vanko&apos;s sole function is storing and organizing your schedule, withdrawing this consent means the service cannot operate without your data. Therefore, withdrawing core consent requires closing your account and permanently erasing your personal data.
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
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '86%',
  },
  card: {
    padding: 20,
    borderRadius: radii.card,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    maxHeight: '100%',
    display: 'flex',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F5',
    paddingBottom: 14,
    marginBottom: 12,
  },
  headerLeft: {
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
    fontWeight: '500',
  },
  closeBtn: {
    padding: 4,
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
    color: '#52525B',
    lineHeight: 18,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#18181B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  consentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    backgroundColor: '#FAFAFA',
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  consentTextCol: {
    flex: 1,
    gap: 4,
  },
  consentTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#18181B',
  },
  consentDesc: {
    fontSize: 11,
    color: '#52525B',
    lineHeight: 16,
  },
  essentialBox: {
    padding: 14,
    backgroundColor: '#FAFAFA',
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: '#E4E4E7',
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
    color: '#18181B',
  },
  essentialDesc: {
    fontSize: 12,
    color: '#3F3F46',
    lineHeight: 17,
  },
  essentialNoticeBox: {
    backgroundColor: '#FEF2F2',
    borderLeftWidth: 3,
    borderLeftColor: '#DC2626',
    padding: 10,
    borderRadius: 6,
  },
  essentialNotice: {
    fontSize: 11,
    color: '#991B1B',
    lineHeight: 16,
  },
  boldNotice: {
    fontWeight: '700',
    color: '#DC2626',
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.3)',
    backgroundColor: '#FEF2F2',
    marginTop: 4,
  },
  withdrawBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  doneBtn: {
    minHeight: 44,
    marginTop: 10,
  },
});

