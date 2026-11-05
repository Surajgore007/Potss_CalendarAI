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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { decrementUserRegistration } from '@eventpulse/shared';
import { useAuth } from '../context/AuthContext';
import { unregisterPushTokenAsync } from '../services/pushNotificationService';
import { colors, radii, shadows } from '../theme/tokens';

interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
}

const WORKER_BASE_URL =
  process.env.EXPO_PUBLIC_WORKER_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  'https://vanko-api.vanko-app.workers.dev';

export function DeleteAccountModal({ visible, onClose }: DeleteAccountModalProps) {
  const router = useRouter();
  const { user, firebaseUser, getIdToken, signOutUser } = useAuth();

  const [confirmText, setConfirmText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const isConfirmed = confirmText.trim().toUpperCase() === 'DELETE';

  const handleReset = () => {
    setConfirmText('');
    setErrorMsg(null);
    setIsProcessing(false);
    setIsDone(false);
  };

  const handleClose = () => {
    if (isProcessing) return; // Prevent cancelling mid-deletion
    handleReset();
    onClose();
  };

  const handleExecuteDeletion = async () => {
    if (!isConfirmed) {
      setErrorMsg('Please type DELETE in all caps to confirm deletion.');
      return;
    }

    setErrorMsg(null);
    setIsProcessing(true);

    try {
      // 1. Obtain verified Firebase ID token
      let token = await getIdToken(true);
      if (!token && firebaseUser) {
        token = await firebaseUser.getIdToken(true);
      }

      if (!token) {
        throw new Error('Your login session has expired. Please sign in again before deleting your account.');
      }

      // 2. Decrement platform registered users count in Firestore
      if (user?.uid) {
        await decrementUserRegistration(user.uid).catch((err) => {
          console.warn('Could not decrement live user count:', err);
        });
      }

      // 3. Dispatch DELETE request to Cloudflare Worker
      // Worker deletes events, notifications, profile doc, decrements platform users, and purges Firebase Auth record
      const res = await fetch(`${WORKER_BASE_URL}/api/account`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = (await res.json().catch(() => ({}))) as any;

      if (!res.ok) {
        throw new Error(data.message || 'Server encountered an error while deleting account data.');
      }

      // 4. Client-side push token deregistration
      if (user?.uid) {
        await unregisterPushTokenAsync(user.uid).catch(() => {});
      }

      // 5. Purge all stored local app keys from AsyncStorage
      const allKeys = await AsyncStorage.getAllKeys();
      const appKeys = allKeys.filter(
        (k) => k.startsWith('@eventpulse') || k.startsWith('@vanko') || k.startsWith('@calendar')
      );
      if (appKeys.length > 0) {
        await AsyncStorage.multiRemove(appKeys).catch(() => {});
      }

      // 6. Clean up client-side Firebase Auth instance
      if (firebaseUser) {
        await firebaseUser.delete().catch(() => {
          // Server service account already deleted the user in Identity Toolkit
        });
      }

      setIsDone(true);

      // 7. Route cleanly to login after confirmation animation
      setTimeout(async () => {
        handleReset();
        onClose();
        await signOutUser().catch(() => {});
        router.replace('/(public)/login');
      }, 2000);
    } catch (err: any) {
      console.warn('Account deletion error:', err);
      setErrorMsg(err.message || 'Could not complete account deletion. Please check your connection and try again.');
      setIsProcessing(false);
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
            <View style={styles.card}>
              {/* Header */}
              <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                  <View style={styles.dangerIconBadge}>
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </View>
                  <View style={styles.headerTextWrap}>
                    <Text style={styles.modalTitle} numberOfLines={1}>Delete Account</Text>
                    <Text style={styles.modalSubtitle} numberOfLines={1}>Permanent & irreversible</Text>
                  </View>
                </View>
                {!isProcessing && !isDone && (
                  <TouchableOpacity
                    onPress={handleClose}
                    style={styles.closeBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              {isDone ? (
                /* Success / Deleted State */
                <View style={styles.statusState}>
                  <View style={styles.successIconCircle}>
                    <Ionicons name="checkmark" size={32} color="#16A34A" />
                  </View>
                  <Text style={styles.statusTitle}>Account Permanently Deleted</Text>
                  <Text style={styles.statusDesc}>
                    All your personal data, calendar events, and credentials have been erased from the platform.
                  </Text>
                  <Text style={styles.redirectingText}>Redirecting to login...</Text>
                </View>
              ) : isProcessing ? (
                /* Processing State */
                <View style={styles.statusState}>
                  <ActivityIndicator size="large" color="#DC2626" />
                  <Text style={styles.statusTitle}>Permanently Deleting Data...</Text>
                  <Text style={styles.statusDesc}>
                    Erasing events, notifications, cloud profile, and platform registration.
                  </Text>
                </View>
              ) : (
                /* Content Body + Footer */
                <>
                  <ScrollView
                    style={styles.bodyScroll}
                    contentContainerStyle={styles.bodyScrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    bounces={false}
                  >
                    {/* Target Account Pill */}
                    <View style={styles.accountPill}>
                      <Ionicons name="person-circle-outline" size={16} color="#64748B" />
                      <Text style={styles.accountPillText} numberOfLines={1}>
                        {user?.email || 'Current Account'}
                      </Text>
                    </View>

                    {/* Warning Card */}
                    <View style={styles.warningCard}>
                      <View style={styles.warningHeader}>
                        <Ionicons name="alert-circle-outline" size={15} color="#DC2626" />
                        <Text style={styles.warningTitle}>The following data will be wiped:</Text>
                      </View>
                      <View style={styles.bulletRow}>
                        <View style={styles.bulletDot} />
                        <Text style={styles.bulletText}>Personal profile & authentication credentials</Text>
                      </View>
                      <View style={styles.bulletRow}>
                        <View style={styles.bulletDot} />
                        <Text style={styles.bulletText}>All synced calendar events, notes & schedules</Text>
                      </View>
                      <View style={styles.bulletRow}>
                        <View style={styles.bulletDot} />
                        <Text style={styles.bulletText}>Push notification tokens & session keys</Text>
                      </View>
                    </View>

                    {/* Confirmation Input Field */}
                    <View style={styles.inputSection}>
                      <Text style={styles.inputLabel}>
                        To confirm, type <Text style={styles.codeHighlight}>DELETE</Text> below:
                      </Text>
                      <TextInput
                        style={[
                          styles.confirmInput,
                          isConfirmed && styles.confirmInputValid,
                        ]}
                        placeholder="Type DELETE"
                        placeholderTextColor="#94A3B8"
                        autoCapitalize="characters"
                        autoCorrect={false}
                        value={confirmText}
                        onChangeText={setConfirmText}
                        editable={!isProcessing}
                      />
                    </View>

                    {/* Error Banner */}
                    {errorMsg && (
                      <View style={styles.errorCard}>
                        <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
                        <Text style={styles.errorText}>{errorMsg}</Text>
                      </View>
                    )}
                  </ScrollView>

                  {/* Fixed Bottom Action Buttons */}
                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={handleClose}
                      activeOpacity={0.7}
                      disabled={isProcessing}
                    >
                      <Text style={styles.cancelButtonText} numberOfLines={1}>Keep Account</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.deleteButton,
                        !isConfirmed && styles.deleteButtonDisabled,
                      ]}
                      onPress={handleExecuteDeletion}
                      activeOpacity={0.8}
                      disabled={!isConfirmed || isProcessing}
                    >
                      <Ionicons name="trash" size={15} color="#FFFFFF" />
                      <Text style={styles.deleteButtonText} numberOfLines={1}>Delete Forever</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  keyboardView: {
    width: '100%',
    maxWidth: 420,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '100%',
    maxHeight: '90%',
  },
  card: {
    width: '100%',
    maxHeight: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.card,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.overlay,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
    paddingBottom: 12,
    marginBottom: 10,
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
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 11.5,
    color: colors.danger,
    fontWeight: '500',
    marginTop: 1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.canvasSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dangerIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.2)',
    flexShrink: 0,
  },
  bodyScroll: {
    flexShrink: 1,
  },
  bodyScrollContent: {
    gap: 12,
    paddingVertical: 2,
  },
  accountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  accountPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    flexShrink: 1,
  },
  warningCard: {
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.2)',
    borderRadius: radii.control,
    padding: 10,
    gap: 6,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  warningTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.danger,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 4,
  },
  bulletDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.danger,
  },
  bulletText: {
    fontSize: 11.5,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 16,
  },
  inputSection: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  codeHighlight: {
    fontWeight: '800',
    color: colors.danger,
    letterSpacing: 0.5,
  },
  confirmInput: {
    width: '100%',
    height: 44,
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  confirmInputValid: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerLight,
  },
  errorCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.3)',
    borderRadius: radii.control,
    padding: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: colors.danger,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  cancelButton: {
    flex: 1,
    height: 42,
    borderRadius: radii.control,
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  cancelButtonText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  deleteButton: {
    flex: 1.2,
    height: 42,
    borderRadius: radii.control,
    backgroundColor: colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  deleteButtonDisabled: {
    opacity: 0.45,
    backgroundColor: colors.textTertiary,
  },
  deleteButtonText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statusState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 12,
  },
  successIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.25)',
  },
  statusTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  statusDesc: {
    fontSize: 12.5,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  redirectingText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.success,
    marginTop: 4,
  },
});
