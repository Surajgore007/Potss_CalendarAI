import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { GlassCard } from './ui/GlassCard';
import { GlassButton } from './ui/GlassButton';
import { colors, radii, shadows } from '../theme/tokens';
import { COLLEGE_SIES_GST, COLLEGE_OTHER } from '@eventpulse/shared';

interface CampusAffiliationModalProps {
  visible: boolean;
  onClose: () => void;
  currentCollege?: string;
  isEditing?: boolean;
  onSaved?: (college: string) => void;
}

const COLLEGE_ANSWERED_KEY_PREFIX = '@vanko_college_prompt_answered_';

export function CampusAffiliationModal({
  visible,
  onClose,
  currentCollege,
  isEditing = false,
  onSaved,
}: CampusAffiliationModalProps) {
  const { user, updateCollege } = useAuth();
  const [selected, setSelected] = useState<string>(
    currentCollege === COLLEGE_OTHER ? COLLEGE_OTHER : COLLEGE_SIES_GST
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (visible) {
      const initial = currentCollege || user?.college || COLLEGE_SIES_GST;
      setSelected(initial === COLLEGE_OTHER ? COLLEGE_OTHER : COLLEGE_SIES_GST);
      setSaveSuccess(false);
      setIsSaving(false);
    }
  }, [visible, currentCollege, user?.college]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateCollege(selected);

      if (user?.uid) {
        await AsyncStorage.setItem(`${COLLEGE_ANSWERED_KEY_PREFIX}${user.uid}`, 'true').catch(() => {});
      }

      setSaveSuccess(true);
      if (onSaved) {
        onSaved(selected);
      }

      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      console.warn('Failed to save campus affiliation:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <GlassCard contentStyle={styles.card}>
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.iconCircle}>
                <Ionicons name="school" size={22} color={colors.primary} />
              </View>
              <View style={styles.headerTextWrap}>
                <Text style={styles.title} numberOfLines={1}>
                  {isEditing ? 'Campus Affiliation' : 'Are you from SIES GST?'}
                </Text>
                <Text style={styles.subtitle} numberOfLines={2}>
                  {isEditing
                    ? 'Update your campus to control which event broadcasts you receive.'
                    : 'Personalize your campus updates, hackathons, and announcements.'}
                </Text>
              </View>
              {isEditing && (
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Options */}
            <View style={styles.optionsWrap}>
              {/* Option 1: SIES GST */}
              <TouchableOpacity
                style={[
                  styles.optionCard,
                  selected === COLLEGE_SIES_GST && styles.optionCardActive,
                ]}
                onPress={() => setSelected(COLLEGE_SIES_GST)}
                activeOpacity={0.8}
              >
                <View style={styles.optionHeader}>
                  <View style={[styles.badge, styles.siesBadge]}>
                    <Ionicons name="shield-checkmark" size={10} color={colors.primary} />
                    <Text style={styles.siesBadgeText}>SIES GST CAMPUS</Text>
                  </View>
                  <View
                    style={[
                      styles.radioCircle,
                      selected === COLLEGE_SIES_GST && styles.radioCircleActive,
                    ]}
                  >
                    {selected === COLLEGE_SIES_GST && (
                      <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                    )}
                  </View>
                </View>
                <Text style={styles.optionTitle}>Yes, I&apos;m from SIES GST</Text>
                <Text style={styles.optionDesc}>
                  SIES Graduate School of Technology, Navi Mumbai. Receive all official campus event
                  broadcasts, committee updates &amp; deadline reminders.
                </Text>
              </TouchableOpacity>

              {/* Option 2: Other College */}
              <TouchableOpacity
                style={[
                  styles.optionCard,
                  selected === COLLEGE_OTHER && styles.optionCardActive,
                ]}
                onPress={() => setSelected(COLLEGE_OTHER)}
                activeOpacity={0.8}
              >
                <View style={styles.optionHeader}>
                  <View style={[styles.badge, styles.otherBadge]}>
                    <Ionicons name="globe-outline" size={10} color={colors.textSecondary} />
                    <Text style={styles.otherBadgeText}>GENERAL</Text>
                  </View>
                  <View
                    style={[
                      styles.radioCircle,
                      selected === COLLEGE_OTHER && styles.radioCircleActive,
                    ]}
                  >
                    {selected === COLLEGE_OTHER && (
                      <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                    )}
                  </View>
                </View>
                <Text style={styles.optionTitle}>Other College / General Student</Text>
                <Text style={styles.optionDesc}>
                  Explore public hackathons &amp; tech community events. You will only receive
                  notifications for events you specifically save to your calendar.
                </Text>
              </TouchableOpacity>
            </View>

            {/* Footnote */}
            <View style={styles.footnoteRow}>
              <Ionicons name="information-circle-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.footnoteText}>
                You can change this choice anytime from Settings.
              </Text>
            </View>

            {/* Actions */}
            <View style={styles.actionRow}>
              {isEditing && (
                <GlassButton
                  title="Cancel"
                  variant="glass"
                  onPress={onClose}
                  disabled={isSaving}
                  style={styles.cancelBtn}
                />
              )}
              <GlassButton
                title={saveSuccess ? 'Saved!' : 'Confirm Affiliation'}
                variant="primary"
                onPress={handleSave}
                loading={isSaving}
                icon={
                  saveSuccess ? (
                    <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                  ) : (
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                  )
                }
                style={[styles.confirmBtn, !isEditing && styles.confirmBtnFull]}
              />
            </View>
          </GlassCard>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 440,
  },
  card: {
    padding: 20,
    borderRadius: radii.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  closeBtn: {
    padding: 4,
  },
  optionsWrap: {
    gap: 10,
    marginBottom: 14,
  },
  optionCard: {
    padding: 14,
    borderRadius: radii.control,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderWidth: 1.5,
    borderColor: 'rgba(226, 232, 240, 0.9)',
  },
  optionCardActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.06)',
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  siesBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  },
  siesBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.2,
  },
  otherBadge: {
    backgroundColor: 'rgba(148, 163, 184, 0.16)',
  },
  otherBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  optionDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  footnoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  footnoteText: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
  },
  confirmBtn: {
    flex: 2,
  },
  confirmBtnFull: {
    flex: 1,
  },
});
