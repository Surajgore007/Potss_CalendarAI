import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SidebarRail } from '../../src/components/SidebarRail';
import { EditableEventCard } from '../../src/components/EditableEventCard';
import { useEvents } from '../../src/context/EventsContext';
import { ExtractedEvent, validateEventForSave } from '@eventpulse/shared';

export default function ConfirmScreen() {
  const router = useRouter();
  const { pendingExtractions, setPendingExtractions, addBatchEvents } = useEvents();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleUpdateEvent = (index: number, updated: ExtractedEvent) => {
    setPendingExtractions((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  };

  const handleDeleteEvent = (index: number) => {
    setPendingExtractions((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        router.back();
      }
      return next;
    });
  };

  const handleSaveSingle = async (index: number) => {
    const item = pendingExtractions[index];
    const issues = validateEventForSave(item);
    const hasError = issues.some((i) => i.severity === 'error');

    if (hasError) {
      const errorMsg = issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.message)
        .join('\n');
      Alert.alert('Please fix errors before saving', errorMsg);
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      await addBatchEvents([item]);
      setPendingExtractions((prev) => {
        const next = prev.filter((_, i) => i !== index);
        if (next.length === 0) {
          router.replace('/(auth)');
        }
        return next;
      });
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save event to Firestore.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAll = async () => {
    const invalidItems = pendingExtractions.filter((item) => {
      const issues = validateEventForSave(item);
      return issues.some((i) => i.severity === 'error');
    });

    if (invalidItems.length > 0) {
      Alert.alert(
        'Validation Errors',
        'Some events have missing dates or invalid fields. Please resolve red warnings before saving.'
      );
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      await addBatchEvents(pendingExtractions);
      setPendingExtractions([]);
      router.replace('/(auth)');
    } catch (err: any) {
      console.error('Save all failed:', err);
      setSaveError(err.message || 'Failed to save events to Firestore.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardAll = () => {
    setPendingExtractions([]);
    router.back();
  };

  if (!pendingExtractions || pendingExtractions.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.emptyContainer}>
          <Ionicons
            name="documents-outline"
            size={48}
            color="#94A3B8"
            style={{ marginBottom: 12 }}
          />
          <Text style={styles.emptyTitle}>No pending extractions</Text>
          <Text style={styles.emptySubtitle}>
            Extract a WhatsApp message to see preview here.
          </Text>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.replace('/extract')}
          >
            <Text style={styles.backBtnText}>Go to Extract</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const totalCount = pendingExtractions.length;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.layoutWrapper}>
        {Platform.OS === 'web' && (
          <SidebarRail onExtractPress={() => router.push('/extract')} />
        )}

        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Card */}
          <View style={styles.headerCard}>
            <TouchableOpacity
              style={styles.backHeaderBtn}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={18} color="#64748B" />
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Review & Confirm</Text>
              <Text style={styles.headerSubtitle}>
                {totalCount} event{totalCount > 1 ? 's' : ''} extracted by Groq AI
              </Text>
            </View>

            <TouchableOpacity onPress={handleDiscardAll}>
              <Text style={styles.discardText}>Discard All</Text>
            </TouchableOpacity>
          </View>

          {/* Review Notice */}
          <View style={styles.topNotice}>
            <Ionicons name="create-outline" size={18} color="#3B82F6" />
            <Text style={styles.topNoticeText}>
              Never auto-saves silently. Review, edit, or adjust tags before syncing to your calendar.
            </Text>
          </View>

          {saveError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color="#EF4444" />
              <Text style={styles.errorText}>{saveError}</Text>
            </View>
          )}

          {/* Editable Cards */}
          {pendingExtractions.map((item, idx) => (
            <EditableEventCard
              key={item.temp_id || idx}
              event={item}
              index={idx}
              total={totalCount}
              onUpdate={(updated) => handleUpdateEvent(idx, updated)}
              onDelete={() => handleDeleteEvent(idx)}
              onSaveSingle={() => handleSaveSingle(idx)}
              isSaving={isSaving}
            />
          ))}

          {/* Save All CTA */}
          <View style={styles.saveAllSection}>
            <TouchableOpacity
              style={[styles.saveAllBtn, isSaving && styles.btnDisabled]}
              activeOpacity={0.85}
              onPress={handleSaveAll}
              disabled={isSaving}
            >
              {isSaving ? (
                <View style={styles.btnRow}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.saveAllBtnText}>Saving to Firestore...</Text>
                </View>
              ) : (
                <View style={styles.btnRow}>
                  <Ionicons
                    name="cloud-upload"
                    size={18}
                    color="#FFFFFF"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.saveAllBtnText}>
                    {totalCount === 1
                      ? 'Save Event to Calendar'
                      : `Save All ${totalCount} Events`}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.syncDisclaimer}>
              Events will be saved to your calendar and available across all views.
            </Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EEF2F6',
  },
  layoutWrapper: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#EEF2F6',
  },
  mainScroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
  backHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  discardText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
  },
  topNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    backgroundColor: '#EFF6FF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  topNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 17,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#FEE2E2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#DC2626',
  },
  saveAllSection: {
    marginTop: 10,
    gap: 8,
  },
  saveAllBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  btnDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.7,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveAllBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  syncDisclaimer: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 20,
    textAlign: 'center',
  },
  backBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 14,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
