import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadows } from '../theme/tokens';
import {
  openBatteryOptimizationSettings,
  openAlarmChannelSettings,
} from '../services/alarmService';
import { Alert } from 'react-native';

interface AlarmReliabilityModalProps {
  visible: boolean;
  onClose: () => void;
}

type OEMTab = 'xiaomi' | 'samsung' | 'oppo' | 'vivo';

export const AlarmReliabilityModal: React.FC<AlarmReliabilityModalProps> = ({
  visible,
  onClose,
}) => {
  const [selectedOem, setSelectedOem] = useState<OEMTab>('xiaomi');

  if (Platform.OS !== 'android') return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="notifications-outline" size={18} color={colors.textPrimary} />
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title} numberOfLines={1}>Alarm Reliability Guide</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                Ensure critical alarms fire on Android
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Core Golden Rule Box */}
            <View style={styles.criticalNotice}>
              <View style={styles.criticalNoticeIconWrap}>
                <Ionicons name="warning-outline" size={17} color="#D97706" />
              </View>
              <View style={styles.criticalNoticeTextWrap}>
                <Text style={styles.criticalNoticeTitle}>Avoid Force-Stopping Vanko</Text>
                <Text style={styles.criticalNoticeDesc}>
                  Android cancels all pending alarms if an app is force-stopped or swiped away from recent apps on aggressive OEM battery managers. Keep Vanko active in recents.
                </Text>
              </View>
            </View>

            {/* Quick Actions */}
            <Text style={styles.sectionTitle}>SYSTEM SETTINGS</Text>
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={openBatteryOptimizationSettings}
                activeOpacity={0.7}
              >
                <View style={styles.actionIconCircle}>
                  <Ionicons name="battery-charging-outline" size={17} color={colors.textPrimary} />
                </View>
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionCardTitle} numberOfLines={1}>Battery Saver Settings</Text>
                  <Text style={styles.actionCardSub} numberOfLines={2}>Allow unrestricted background activity</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCard}
                onPress={openAlarmChannelSettings}
                activeOpacity={0.7}
              >
                <View style={styles.actionIconCircle}>
                  <Ionicons name="volume-high-outline" size={17} color={colors.textPrimary} />
                </View>
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionCardTitle} numberOfLines={1}>Alarm Audio Channel</Text>
                  <Text style={styles.actionCardSub} numberOfLines={2}>Verify ringtone, vibration & DND override</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            {/* OEM Tabs */}
            <Text style={styles.sectionTitle}>DEVICE-SPECIFIC FIXES</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabScrollContainer}
              style={styles.tabScroll}
            >
              <TouchableOpacity
                style={[styles.tabBtn, selectedOem === 'xiaomi' && styles.tabBtnActive]}
                onPress={() => setSelectedOem('xiaomi')}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabBtnText, selectedOem === 'xiaomi' && styles.tabBtnTextActive]}>
                  Xiaomi / POCO
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, selectedOem === 'samsung' && styles.tabBtnActive]}
                onPress={() => setSelectedOem('samsung')}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabBtnText, selectedOem === 'samsung' && styles.tabBtnTextActive]}>
                  Samsung
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, selectedOem === 'oppo' && styles.tabBtnActive]}
                onPress={() => setSelectedOem('oppo')}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabBtnText, selectedOem === 'oppo' && styles.tabBtnTextActive]}>
                  OnePlus / Oppo
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, selectedOem === 'vivo' && styles.tabBtnActive]}
                onPress={() => setSelectedOem('vivo')}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabBtnText, selectedOem === 'vivo' && styles.tabBtnTextActive]}>
                  Vivo / iQOO
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Tab Instructions */}
            <View style={styles.instructionsBox}>
              {selectedOem === 'xiaomi' && (
                <>
                  <Text style={styles.instructionsHeading}>Xiaomi, Redmi & POCO (MIUI / HyperOS)</Text>
                  <View style={styles.stepRow}>
                    <Text style={styles.stepNum}>1</Text>
                    <Text style={styles.stepText}>Open <Text style={styles.stepBold}>Settings → Apps → Manage Apps → Vanko</Text>.</Text>
                  </View>
                  <View style={styles.stepRow}>
                    <Text style={styles.stepNum}>2</Text>
                    <Text style={styles.stepText}>Turn on <Text style={styles.stepBold}>Autostart</Text>.</Text>
                  </View>
                  <View style={styles.stepRow}>
                    <Text style={styles.stepNum}>3</Text>
                    <Text style={styles.stepText}>Tap <Text style={styles.stepBold}>Battery saver</Text> and choose <Text style={styles.stepBold}>No restrictions</Text>.</Text>
                  </View>
                  <View style={styles.stepRow}>
                    <Text style={styles.stepNum}>4</Text>
                    <Text style={styles.stepText}>In the Recent Apps tray, hold Vanko and tap the <Text style={styles.stepBold}>Lock icon</Text>.</Text>
                  </View>
                  <View style={styles.stepRow}>
                    <Text style={styles.stepNum}>5</Text>
                    <Text style={styles.stepText}>Tap <Text style={styles.stepBold}>Other permissions</Text> → enable <Text style={styles.stepBold}>Show on Lock screen</Text> and <Text style={styles.stepBold}>Display pop-up windows</Text>.</Text>
                  </View>
                </>
              )}

              {selectedOem === 'samsung' && (
                <>
                  <Text style={styles.instructionsHeading}>Samsung Galaxy (One UI)</Text>
                  <View style={styles.stepRow}>
                    <Text style={styles.stepNum}>1</Text>
                    <Text style={styles.stepText}>Open <Text style={styles.stepBold}>Settings → Apps → Vanko → Battery</Text>.</Text>
                  </View>
                  <View style={styles.stepRow}>
                    <Text style={styles.stepNum}>2</Text>
                    <Text style={styles.stepText}>Select <Text style={styles.stepBold}>Unrestricted</Text>.</Text>
                  </View>
                  <View style={styles.stepRow}>
                    <Text style={styles.stepNum}>3</Text>
                    <Text style={styles.stepText}>Go to <Text style={styles.stepBold}>Device care → Battery → Background usage</Text> and add Vanko to <Text style={styles.stepBold}>Never sleeping apps</Text>.</Text>
                  </View>
                </>
              )}

              {selectedOem === 'oppo' && (
                <>
                  <Text style={styles.instructionsHeading}>OnePlus, Oppo & Realme (ColorOS / OxygenOS)</Text>
                  <View style={styles.stepRow}>
                    <Text style={styles.stepNum}>1</Text>
                    <Text style={styles.stepText}>Open <Text style={styles.stepBold}>Settings → Apps → App Management → Vanko</Text>.</Text>
                  </View>
                  <View style={styles.stepRow}>
                    <Text style={styles.stepNum}>2</Text>
                    <Text style={styles.stepText}>Tap <Text style={styles.stepBold}>Battery usage</Text> and enable <Text style={styles.stepBold}>Allow background activity</Text> and <Text style={styles.stepBold}>Allow auto-launch</Text>.</Text>
                  </View>
                </>
              )}

              {selectedOem === 'vivo' && (
                <>
                  <Text style={styles.instructionsHeading}>Vivo & iQOO (Funtouch OS)</Text>
                  <View style={styles.stepRow}>
                    <Text style={styles.stepNum}>1</Text>
                    <Text style={styles.stepText}>Open <Text style={styles.stepBold}>Settings → Battery → Background power consumption</Text>.</Text>
                  </View>
                  <View style={styles.stepRow}>
                    <Text style={styles.stepNum}>2</Text>
                    <Text style={styles.stepText}>Locate Vanko and select <Text style={styles.stepBold}>High background power consumption</Text>.</Text>
                  </View>
                </>
              )}
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    overflow: 'hidden',
    ...shadows.overlay,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F5',
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.canvasSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 14,
    backgroundColor: colors.canvasSubtle,
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  criticalNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FAFAFA',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    padding: 12,
    marginBottom: 16,
    gap: 12,
  },
  criticalNoticeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginTop: 1,
  },
  criticalNoticeTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  criticalNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  criticalNoticeDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 17,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textTertiary,
    letterSpacing: 0.8,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  actionsRow: {
    gap: 8,
    marginBottom: 18,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    padding: 12,
  },
  actionIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  actionCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  actionCardSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  tabScroll: {
    marginBottom: 12,
  },
  tabScrollContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
    ...shadows.subtle,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  instructionsBox: {
  backgroundColor: '#FAFAFA',
  borderRadius: 12,
  borderWidth: 1,
  borderColor: '#E4E4E7',
  padding: 14,
  gap: 10,
  marginBottom: 8,
},
  instructionsHeading: {
  fontSize: 12,
  fontWeight: '700',
  color: colors.textPrimary,
  marginBottom: 2,
},
  stepRow: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: 8,
},
  stepNum: {
  width: 18,
  height: 18,
  borderRadius: 9,
  backgroundColor: '#E4E4E7',
  textAlign: 'center',
  lineHeight: 18,
  fontSize: 10,
  fontWeight: '700',
  color: colors.textPrimary,
},
  stepText: {
  flex: 1,
  fontSize: 12,
  color: colors.textSecondary,
  lineHeight: 18,
},
  stepBold: {
  fontWeight: '700',
  color: colors.textPrimary,
},
  footer: {
  paddingHorizontal: 20,
  paddingVertical: 14,
  borderTopWidth: 1,
  borderTopColor: '#F4F4F5',
  backgroundColor: '#FFFFFF',
},
  doneBtn: {
  backgroundColor: colors.textPrimary,
  borderRadius: 12,
  paddingVertical: 12,
  alignItems: 'center',
  justifyContent: 'center',
},
  doneBtnText: {
  fontSize: 14,
  fontWeight: '600',
  color: '#FFFFFF',
},
});
