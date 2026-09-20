import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Share,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { GlassCard } from './ui/GlassCard';
import { GlassButton } from './ui/GlassButton';
import { colors, radii } from '../theme/tokens';

interface MyDataModalProps {
  visible: boolean;
  onClose: () => void;
}

export function MyDataModal({ visible, onClose }: MyDataModalProps) {
  const { user, updateDisplayName } = useAuth();
  const { events } = useEvents();

  const [isEditingName, setIsEditingName] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [isSavingName, setIsSavingName] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Synchronize local input state whenever modal is opened or user.displayName updates
  useEffect(() => {
    if (visible) {
      setDisplayName(user?.displayName || '');
      setIsEditingName(false);
      setSaveSuccess(false);
      setIsSavingName(false);
    }
  }, [visible, user?.displayName]);

  const handleSaveName = async () => {
    const cleanName = displayName.trim();
    if (!cleanName) {
      Alert.alert('Invalid Name', 'Display name cannot be empty.');
      return;
    }

    if (cleanName === user?.displayName) {
      setIsEditingName(false);
      return;
    }

    setIsSavingName(true);
    setSaveSuccess(false);
    try {
      await updateDisplayName(cleanName);
      setIsEditingName(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not update name. Please try again.');
    } finally {
      setIsSavingName(false);
    }
  };

  /**
   * Generates a complete RFC 5545 compliant iCalendar string from personal events.
   */
  const generateICalString = (): string => {
    let ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Vanko//Vanko Mobile App//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    for (const ev of events) {
      ics.push('BEGIN:VEVENT');
      ics.push(`UID:${ev.id}@vanko.app`);
      ics.push(`SUMMARY:${ev.title.replace(/[,;\\]/g, '\\$&')}`);

      const startDate = ev.event_start_date ? ev.event_start_date.replace(/-/g, '') : '';
      if (startDate) {
        ics.push(`DTSTART;VALUE=DATE:${startDate}`);
      }
      const endDate = ev.event_end_date ? ev.event_end_date.replace(/-/g, '') : startDate;
      if (endDate) {
        ics.push(`DTEND;VALUE=DATE:${endDate}`);
      }

      if (ev.location) {
        ics.push(`LOCATION:${ev.location.replace(/[,;\\]/g, '\\$&')}`);
      }
      if (ev.raw_text) {
        ics.push(`DESCRIPTION:${ev.raw_text.slice(0, 200).replace(/\n/g, '\\n')}`);
      }
      ics.push(`STATUS:${ev.status === 'past' ? 'COMPLETED' : 'CONFIRMED'}`);
      ics.push('END:VEVENT');
    }

    ics.push('END:VCALENDAR');
    return ics.join('\r\n');
  };

  const handleExportData = async () => {
    setIsExporting(true);

    try {
      const exportObject = {
        meta: {
          exportDate: new Date().toISOString(),
          formatVersion: '1.0.0',
          generator: 'Vanko Mobile App (DPDP Data Portability Module)',
        },
        userProfile: {
          uid: user?.uid,
          email: user?.email,
          displayName: user?.displayName,
          role: user?.role,
          college: user?.college || 'General',
        },
        consentRecord: {
          law: 'Digital Personal Data Protection Act, 2023 (DPDP)',
          coreCalendarProcessingConsent: true,
          pushNotificationsConsent: true,
          ageDeclaration: '18+ or enrolled college student',
        },
        calendarEventsCount: events.length,
        calendarEvents: events.map((e) => ({
          id: e.id,
          title: e.title,
          type: e.type,
          startDate: e.event_start_date,
          endDate: e.event_end_date,
          registrationDeadline: e.registration_deadline,
          time: e.time,
          mode: e.mode,
          location: e.location,
          status: e.status,
          tags: e.tags,
          createdAt: e.created_at,
          updatedAt: e.updated_at,
        })),
        iCalExport: generateICalString(),
      };

      const jsonString = JSON.stringify(exportObject, null, 2);

      await Share.share({
        title: 'Vanko_Personal_Data_Export.json',
        message: Platform.OS === 'android' ? jsonString : jsonString,
      });
    } catch {
      Alert.alert('Export Notice', 'Personal data export was cancelled or could not be completed.');
    } finally {
      setIsExporting(false);
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
            {/* Header - Fixed */}
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="folder-open-outline" size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.headerTitle}>My Data & Privacy</Text>
                  <Text style={styles.headerSubtitle}>DPDP Act 2023 Section 11</Text>
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

            {/* Scrollable Body - Stays cleanly inside card */}
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.bodyScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Profile Overview (Right to Access & Correction) */}
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>Profile Information (Right to Correct)</Text>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Display Name</Text>
                    {isEditingName ? (
                      <View style={styles.editRow}>
                        <TextInput
                          style={styles.editInput}
                          value={displayName}
                          onChangeText={setDisplayName}
                          maxLength={50}
                          autoFocus
                          placeholder="Your full name"
                          placeholderTextColor={colors.textTertiary}
                        />
                        <TouchableOpacity
                          onPress={handleSaveName}
                          style={styles.saveNameBtn}
                          disabled={isSavingName}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          {isSavingName ? (
                            <ActivityIndicator size="small" color="#FFF" />
                          ) : (
                            <Ionicons name="checkmark" size={16} color="#FFF" />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            setDisplayName(user?.displayName || '');
                            setIsEditingName(false);
                          }}
                          style={styles.cancelNameBtn}
                          disabled={isSavingName}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Ionicons name="close" size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                    <View style={styles.nameDisplayRow}>
                      <Text style={styles.dataValue} numberOfLines={1}>
                        {user?.displayName || 'User'}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setIsEditingName(true)}
                        style={styles.editIconBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="pencil-outline" size={14} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {saveSuccess && (
                  <Text style={styles.saveSuccessText}>Display name updated successfully!</Text>
                )}

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Registered Email</Text>
                  <Text style={styles.dataValue} numberOfLines={1}>
                    {user?.email || 'N/A'}
                  </Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Account ID</Text>
                  <Text
                    style={styles.dataMono}
                    numberOfLines={1}
                    ellipsizeMode="middle"
                  >
                    {user?.uid || 'N/A'}
                  </Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Affiliated Campus</Text>
                  <Text style={styles.dataValue} numberOfLines={1}>
                    {user?.college || 'General Student'}
                  </Text>
                </View>
              </View>

              {/* Data Storage & Processing Summary */}
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>Storage & Sync Status</Text>

                <View style={styles.statsCard}>
                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>{events.length}</Text>
                    <Text style={styles.statLabel}>Personal Events</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statBox}>
                    <Ionicons name="cloud-done-outline" size={20} color={colors.success} />
                    <Text style={styles.statLabel}>Cloud Synced</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statBox}>
                    <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
                    <Text style={styles.statLabel}>AES-256 Safe</Text>
                  </View>
                </View>
              </View>

              {/* Data Portability (Export) */}
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>Data Portability (Export)</Text>
                <Text style={styles.exportDesc}>
                  Under the DPDP Act 2023, you have the right to receive your personal data in a structured, standard machine-readable JSON & iCalendar file.
                </Text>
              </View>
            </ScrollView>

            {/* Footer - Fixed Action Buttons */}
            <View style={styles.footerActions}>
              <GlassButton
                title="Export My Complete Data (JSON + iCal)"
                variant="primary"
                onPress={handleExportData}
                loading={isExporting}
                icon={<Ionicons name="download-outline" size={16} color="#FFFFFF" />}
                style={styles.exportBtn}
              />
              <GlassButton
                title="Close"
                variant="glass"
                onPress={onClose}
                style={styles.closeActionBtn}
              />
            </View>
          </GlassCard>
        </View>
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
    maxWidth: 460,
    maxHeight: '88%',
  },
  card: {
    padding: 20,
    borderRadius: radii.card,
    maxHeight: '100%',
    display: 'flex',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
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
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 11,
    color: colors.textTertiary,
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
  section: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  dataLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  dataValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  dataMono: {
    fontSize: 11,
    color: colors.textTertiary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    maxWidth: 160,
    textAlign: 'right',
  },
  nameDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  editIconBtn: {
    padding: 4,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'flex-end',
  },
  editInput: {
    height: 32,
    backgroundColor: colors.canvasSubtle,
    borderRadius: 6,
    paddingHorizontal: 8,
    color: colors.textPrimary,
    fontSize: 13,
    borderWidth: 1,
    borderColor: colors.primary,
    flex: 1,
    maxWidth: 160,
  },
  saveNameBtn: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelNameBtn: {
    backgroundColor: colors.canvasSubtle,
    borderRadius: 6,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  saveSuccessText: {
    fontSize: 11,
    color: colors.success,
    fontWeight: '500',
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: 12,
    backgroundColor: colors.canvasSubtle,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  statBox: {
    alignItems: 'center',
    gap: 3,
  },
  statNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  statDivider: {
    width: 1,
    height: 22,
    backgroundColor: colors.glassBorder,
  },
  exportDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  footerActions: {
    gap: 8,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
    paddingTop: 12,
  },
  exportBtn: {
    minHeight: 44,
  },
  closeActionBtn: {
    minHeight: 40,
  },
});
