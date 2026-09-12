import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadows } from '../../theme/tokens';
import { formatTime12Hour } from '@eventpulse/shared';

interface TimePickerModalProps {
  visible: boolean;
  initialTime?: string | null;
  title?: string;
  onSelect: (timeStr: string | null) => void;
  onClose: () => void;
}

const HOURS = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export const TimePickerModal: React.FC<TimePickerModalProps> = ({
  visible,
  initialTime,
  title = 'Select Time',
  onSelect,
  onClose,
}) => {
  const [selectedHour, setSelectedHour] = useState<string>('10');
  const [selectedMinute, setSelectedMinute] = useState<string>('00');
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>('AM');

  useEffect(() => {
    if (initialTime) {
      const formatted = formatTime12Hour(initialTime);
      const match = formatted.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (match) {
        setSelectedHour(match[1]);
        setSelectedMinute(match[2]);
        setSelectedPeriod(match[3].toUpperCase() as 'AM' | 'PM');
      }
    } else {
      setSelectedHour('10');
      setSelectedMinute('00');
      setSelectedPeriod('AM');
    }
  }, [initialTime, visible]);

  const currentTimePreview = `${selectedHour}:${selectedMinute} ${selectedPeriod}`;

  const handleQuickPreset = (timeStr: string) => {
    const formatted = formatTime12Hour(timeStr);
    const match = formatted.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
      setSelectedHour(match[1]);
      setSelectedMinute(match[2]);
      setSelectedPeriod(match[3].toUpperCase() as 'AM' | 'PM');
    }
  };

  const handleConfirm = () => {
    onSelect(currentTimePreview);
    onClose();
  };

  const handleClear = () => {
    onSelect(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              {/* Header */}
              <View style={styles.headerRow}>
                <View style={styles.headerTitleGroup}>
                  <Ionicons name="time-outline" size={18} color={colors.textPrimary} />
                  <Text style={styles.headerTitle}>{title}</Text>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Live Digital Display */}
              <View style={styles.displayCard}>
                <Text style={styles.displayTimeText}>{currentTimePreview}</Text>
                <View style={styles.periodSwitcher}>
                  <TouchableOpacity
                    style={[styles.periodBtn, selectedPeriod === 'AM' && styles.periodBtnActive]}
                    onPress={() => setSelectedPeriod('AM')}
                  >
                    <Text style={[styles.periodBtnText, selectedPeriod === 'AM' && styles.periodBtnTextActive]}>
                      AM
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.periodBtn, selectedPeriod === 'PM' && styles.periodBtnActive]}
                    onPress={() => setSelectedPeriod('PM')}
                  >
                    <Text style={[styles.periodBtnText, selectedPeriod === 'PM' && styles.periodBtnTextActive]}>
                      PM
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Quick Presets */}
              <View style={styles.presetRow}>
                <TouchableOpacity style={styles.presetChip} onPress={() => handleQuickPreset('9:00 AM')}>
                  <Text style={styles.presetText}>9:00 AM</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.presetChip} onPress={() => handleQuickPreset('12:00 PM')}>
                  <Text style={styles.presetText}>12:00 PM</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.presetChip} onPress={() => handleQuickPreset('6:00 PM')}>
                  <Text style={styles.presetText}>6:00 PM</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.presetChip} onPress={() => handleQuickPreset('11:59 PM')}>
                  <Text style={styles.presetText}>11:59 PM</Text>
                </TouchableOpacity>
              </View>

              {/* Hours Grid */}
              <View style={styles.pickerSection}>
                <Text style={styles.sectionHeader}>HOUR</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
                  {HOURS.map((h) => {
                    const isSelected = selectedHour === h;
                    return (
                      <TouchableOpacity
                        key={h}
                        style={[styles.pillBtn, isSelected && styles.pillBtnActive]}
                        onPress={() => setSelectedHour(h)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{h}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Minutes Grid */}
              <View style={styles.pickerSection}>
                <Text style={styles.sectionHeader}>MINUTE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
                  {MINUTES.map((m) => {
                    const isSelected = selectedMinute === m;
                    return (
                      <TouchableOpacity
                        key={m}
                        style={[styles.pillBtn, isSelected && styles.pillBtnActive]}
                        onPress={() => setSelectedMinute(m)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{m}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Footer Actions */}
              <View style={styles.footerRow}>
                <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
                  <Text style={styles.clearBtnText}>Clear</Text>
                </TouchableOpacity>

                <View style={styles.footerRightBtns}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
                    <Text style={styles.confirmBtnText}>Set Time</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    padding: 18,
    ...shadows.overlay,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  displayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: radii.control,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  displayTimeText: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  periodSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  periodBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  periodBtnActive: {
    backgroundColor: colors.primary,
  },
  periodBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  periodBtnTextActive: {
    color: '#FFFFFF',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  presetChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: radii.control,
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  presetText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  pickerSection: {
    marginBottom: 14,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textTertiary,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  scrollRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  pillBtn: {
    minWidth: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  pillBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.06)',
    marginTop: 6,
  },
  clearBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.danger,
  },
  footerRightBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.control,
    backgroundColor: colors.canvasSubtle,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  confirmBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radii.control,
    backgroundColor: colors.primary,
  },
  confirmBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
