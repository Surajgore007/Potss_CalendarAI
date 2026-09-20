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
import { colors, radii } from '../theme/tokens';

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
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            {/* Close Button */}
            {!isProcessing && !isDone && (
              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            )}

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
              /* Main Confirmation Dialog */
              <View style={styles.contentWrap}>
                {/* Danger Icon Badge */}
                <View style={styles.dangerIconBadge}>
                  <Ionicons name="trash-outline" size={24} color="#DC2626" />
                </View>

                {/* Header Titles */}
                <View style={styles.headerTitles}>
                  <Text style={styles.modalTitle}>Delete Account Permanently?</Text>
                  <Text style={styles.modalSubtitle}>
                    This action is immediate and cannot be undone. All your data will be permanently removed.
                  </Text>
                </View>

                {/* Target Account Pill */}
                <View style={styles.accountPill}>
                  <Ionicons name="person-circle-outline" size={18} color="#64748B" />
                  <Text style={styles.accountPillText} numberOfLines={1}>
                    {user?.email || 'Current Account'}
                  </Text>
                </View>

                {/* Deletion Summary Checklist */}
                <View style={styles.checklistCard}>
                  <Text style={styles.checklistTitle}>The following data will be erased:</Text>
                  <View style={styles.checklistItem}>
                    <Ionicons name="remove-circle-outline" size={15} color="#DC2626" />
                    <Text style={styles.checklistItemText}>Personal profile & authentication credentials</Text>
                  </View>
                  <View style={styles.checklistItem}>
                    <Ionicons name="remove-circle-outline" size={15} color="#DC2626" />
                    <Text style={styles.checklistItemText}>All synced calendar events, notes & schedules</Text>
                  </View>
                  <View style={styles.checklistItem}>
                    <Ionicons name="remove-circle-outline" size={15} color="#DC2626" />
                    <Text style={styles.checklistItemText}>Push notification tokens & attendance history</Text>
                  </View>
                  <View style={styles.checklistItem}>
                    <Ionicons name="remove-circle-outline" size={15} color="#DC2626" />
                    <Text style={styles.checklistItemText}>Platform registered user count decrements</Text>
                  </View>
                </View>

                {/* Confirmation Input Field */}
                <View style={styles.inputSection}>
                  <Text style={styles.inputLabel}>
                    To confirm, please type <Text style={styles.codeHighlight}>DELETE</Text> below:
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

                {/* Action Buttons */}
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={handleClose}
                    activeOpacity={0.7}
                    disabled={isProcessing}
                  >
                    <Text style={styles.cancelButtonText}>Keep Account</Text>
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
                    <Ionicons name="trash" size={16} color="#FFFFFF" />
                    <Text style={styles.deleteButtonText}>Delete Forever</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentWrap: {
    gap: 16,
    alignItems: 'center',
  },
  dangerIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  headerTitles: {
    alignItems: 'center',
    gap: 6,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  accountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    maxWidth: '100%',
  },
  accountPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  checklistCard: {
    width: '100%',
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  checklistTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#991B1B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checklistItemText: {
    fontSize: 12.5,
    color: '#475569',
    flex: 1,
    lineHeight: 17,
  },
  inputSection: {
    width: '100%',
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  codeHighlight: {
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.5,
  },
  confirmInput: {
    width: '100%',
    height: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 1.5,
  },
  confirmInputValid: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  errorCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    padding: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#DC2626',
  },
  buttonRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  deleteButton: {
    flex: 1.3,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  deleteButtonDisabled: {
    opacity: 0.45,
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statusState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  successIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  statusDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  redirectingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16A34A',
    marginTop: 4,
  },
});
