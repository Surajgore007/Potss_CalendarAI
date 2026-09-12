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

interface DatePickerModalProps {
  visible: boolean;
  initialDate?: string | null; // YYYY-MM-DD
  title?: string;
  onSelect: (dateStr: string | null) => void;
  onClose: () => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS_HEADER = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const DatePickerModal: React.FC<DatePickerModalProps> = ({
  visible,
  initialDate,
  title = 'Select Date',
  onSelect,
  onClose,
}) => {
  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate || null);

  useEffect(() => {
    if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
      const [y, m, d] = initialDate.split('-').map(Number);
      setViewDate(new Date(y, m - 1, d));
      setSelectedDate(initialDate);
    } else {
      const now = new Date();
      setViewDate(now);
      setSelectedDate(null);
    }
  }, [initialDate, visible]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  // Generate calendar days
  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

  const days: { day: number | null; dateStr: string | null; isToday: boolean }[] = [];
  const todayStr = new Date().toISOString().split('T')[0];

  for (let i = 0; i < firstDayIndex; i++) {
    days.push({ day: null, dateStr: null, isToday: false });
  }

  for (let d = 1; d <= totalDaysInMonth; d++) {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const dateStr = `${year}-${mm}-${dd}`;
    days.push({
      day: d,
      dateStr,
      isToday: dateStr === todayStr,
    });
  }

  const handleQuickPreset = (offsetDays: number) => {
    const target = new Date();
    target.setDate(target.getDate() + offsetDays);
    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    setSelectedDate(dateStr);
    setViewDate(target);
  };

  const handleConfirm = () => {
    onSelect(selectedDate);
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
                  <Ionicons name="calendar-outline" size={18} color={colors.textPrimary} />
                  <Text style={styles.headerTitle}>{title}</Text>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Quick Presets */}
              <View style={styles.presetRow}>
                <TouchableOpacity style={styles.presetChip} onPress={() => handleQuickPreset(0)}>
                  <Text style={styles.presetText}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.presetChip} onPress={() => handleQuickPreset(1)}>
                  <Text style={styles.presetText}>Tomorrow</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.presetChip} onPress={() => handleQuickPreset(7)}>
                  <Text style={styles.presetText}>+1 Week</Text>
                </TouchableOpacity>
              </View>

              {/* Month Navigation */}
              <View style={styles.monthNavRow}>
                <TouchableOpacity style={styles.navBtn} onPress={handlePrevMonth}>
                  <Ionicons name="chevron-back" size={16} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.monthYearText}>
                  {MONTHS[month]} {year}
                </Text>
                <TouchableOpacity style={styles.navBtn} onPress={handleNextMonth}>
                  <Ionicons name="chevron-forward" size={16} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>

              {/* Day Headers */}
              <View style={styles.daysHeaderRow}>
                {DAYS_HEADER.map((dh, idx) => (
                  <Text key={idx} style={styles.dayHeaderCell}>
                    {dh}
                  </Text>
                ))}
              </View>

              {/* Calendar Grid */}
              <View style={styles.gridContainer}>
                {days.map((item, idx) => {
                  if (!item.day || !item.dateStr) {
                    return <View key={idx} style={styles.dayCellEmpty} />;
                  }
                  const isSelected = selectedDate === item.dateStr;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.dayCell,
                        item.isToday && styles.dayCellToday,
                        isSelected && styles.dayCellSelected,
                      ]}
                      onPress={() => setSelectedDate(item.dateStr)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          item.isToday && styles.dayTextToday,
                          isSelected && styles.dayTextSelected,
                        ]}
                      >
                        {item.day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
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
                    <Text style={styles.confirmBtnText}>Select</Text>
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
    marginBottom: 12,
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
  presetRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.control,
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  presetText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.06)',
  },
  navBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  monthYearText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  daysHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  dayHeaderCell: {
    width: 40,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: colors.textTertiary,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 4,
    marginBottom: 16,
  },
  dayCellEmpty: {
    width: 40,
    height: 38,
  },
  dayCell: {
    width: 40,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  dayCellToday: {
    backgroundColor: '#F1F5F9',
  },
  dayCellSelected: {
    backgroundColor: colors.primary,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  dayTextToday: {
    fontWeight: '700',
    color: colors.primary,
  },
  dayTextSelected: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.06)',
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
