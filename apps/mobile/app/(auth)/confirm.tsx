import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SidebarRail } from '../../src/components/SidebarRail';
import { EditableEventCard } from '../../src/components/EditableEventCard';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { GlassButton } from '../../src/components/ui/GlassButton';
import { GlassLoadingOverlay } from '../../src/components/ui/GlassLoadingOverlay';
import { useEvents } from '../../src/context/EventsContext';
import { useAuth } from '../../src/context/AuthContext';
import {
  ExtractedEvent,
  PublishDestination,
  validateEventForSave,
  batchPublishCommunityEvents,
} from '@eventpulse/shared';
import { colors, radii, shadows } from '../../src/theme/tokens';

export default function ConfirmScreen() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { pendingExtractions, setPendingExtractions, addBatchEvents } = useEvents();

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [destination, setDestination] = useState<PublishDestination>('personal');

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
      Alert.alert('Please resolve errors', errorMsg);
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      if (destination === 'personal' || destination === 'both') {
        await addBatchEvents([item]);
      }
      if (isAdmin && user && (destination === 'community' || destination === 'both')) {
        await batchPublishCommunityEvents([item], user.uid, 'SIES_GST');
      }

      setPendingExtractions((prev) => {
        const next = prev.filter((_, i) => i !== index);
        if (next.length === 0) {
          router.replace((destination === 'community' ? '/(auth)/college' : '/(auth)') as any);
        }
        return next;
      });
    } catch (err: any) {
      console.error('Save single event failed:', err);
      setSaveError("We're getting things ready. Please check your connection and try again in a moment.");
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
        'Some events have missing dates or invalid fields. Please resolve highlighted items before saving.'
      );
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      if (destination === 'personal' || destination === 'both') {
        await addBatchEvents(pendingExtractions);
      }
      if (isAdmin && user && (destination === 'community' || destination === 'both')) {
        await batchPublishCommunityEvents(pendingExtractions, user.uid, 'SIES_GST');
      }

      setPendingExtractions([]);
      router.replace((destination === 'community' ? '/(auth)/college' : '/(auth)') as any);
    } catch (err: any) {
      console.error('Save all events failed:', err);
      setSaveError("We're getting things ready. Please check your connection and try again in a moment.");
    } finally {
      setIsSaving(false);
    }
  };

  const count = pendingExtractions.length;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Full-screen Loading Overlay during batch save */}
      <GlassLoadingOverlay
        visible={isSaving}
        message={
          destination === 'community'
            ? 'Publishing to SIES GST Feed...'
            : destination === 'both'
            ? 'Saving to Calendar & SIES GST Feed...'
            : 'Saving to your private calendar...'
        }
      />

      <View style={styles.layoutWrapper}>
        {Platform.OS === 'web' && (
          <SidebarRail onExtractPress={() => router.push('/extract')} />
        )}

        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Card */}
          <GlassCard contentStyle={styles.headerCard}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle} numberOfLines={1}>Review Extracted Schedule</Text>
              <Text style={styles.headerSubtitle} numberOfLines={2}>
                {count} {count === 1 ? 'event ready' : 'events ready'} for confirmation
              </Text>
            </View>
          </GlassCard>

          {/* Admin Destination Picker */}
          {isAdmin && (
            <GlassCard contentStyle={styles.destinationCard}>
              <View style={styles.destHeaderRow}>
                <Ionicons name="git-branch-outline" size={15} color={colors.textPrimary} />
                <Text style={styles.destHeaderTitle}>PUBLISH DESTINATION (ADMIN)</Text>
              </View>

              <View style={styles.destPickerRow}>
                {(
                  [
                    { key: 'personal', label: 'My Calendar', icon: 'calendar-outline' },
                    { key: 'community', label: 'SIES GST Feed', icon: 'school-outline' },
                    { key: 'both', label: 'Both', icon: 'globe-outline' },
                  ] as const
                ).map((opt) => {
                  const isSelected = destination === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.destOption, isSelected && styles.destOptionSelected]}
                      onPress={() => setDestination(opt.key)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={opt.icon as any}
                        size={14}
                        color={isSelected ? '#FFFFFF' : colors.textSecondary}
                      />
                      <Text style={[styles.destOptionText, isSelected && styles.destOptionTextSelected]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </GlassCard>
          )}

          {saveError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={styles.errorText} numberOfLines={3}>{saveError}</Text>
            </View>
          )}

          {/* List of Editable Cards */}
          {pendingExtractions.map((event, idx) => (
            <EditableEventCard
              key={idx}
              event={event}
              index={idx}
              total={count}
              onUpdate={(updated) => handleUpdateEvent(idx, updated)}
              onDelete={() => handleDeleteEvent(idx)}
              onSaveSingle={() => handleSaveSingle(idx)}
              isSaving={isSaving}
            />
          ))}

          {/* Sticky Bottom Actions */}
          <View style={styles.bottomBar}>
            <GlassButton
              title={
                destination === 'community'
                  ? `Publish ${count === 1 ? 'Event' : `All ${count} Events`} to SIES GST`
                  : destination === 'both'
                  ? `Save & Publish ${count === 1 ? 'Event' : `All ${count} Events`}`
                  : `Save ${count === 1 ? 'Event' : `All ${count} Events`} to Calendar`
              }
              variant="primary"
              onPress={handleSaveAll}
              loading={isSaving}
              icon={
                <Ionicons
                  name={destination === 'community' ? 'school-outline' : 'cloud-upload-outline'}
                  size={16}
                  color="#FFFFFF"
                />
              }
              style={styles.saveAllBtn}
            />

            <TouchableOpacity
              style={styles.discardBtn}
              onPress={() => {
                setPendingExtractions([]);
                router.replace('/(auth)');
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.discardText} numberOfLines={1}>Discard All</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  layoutWrapper: {
    flex: 1,
    flexDirection: 'row',
  },
  mainScroll: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.canvasSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
  destinationCard: {
    padding: 14,
    gap: 10,
  },
  destHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  destHeaderTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.4,
  },
  destPickerRow: {
    flexDirection: 'row',
    backgroundColor: colors.canvasSubtle,
    borderRadius: radii.control,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    gap: 3,
  },
  destOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  destOptionSelected: {
    backgroundColor: '#FFFFFF',
    ...shadows.subtle,
  },
  destOptionText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  destOptionTextSelected: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.15)',
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: colors.danger,
    lineHeight: 16,
  },
  bottomBar: {
    gap: 10,
    marginTop: 8,
  },
  saveAllBtn: {
    minHeight: 48,
  },
  discardBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  discardText: {
    fontSize: 13,
    color: colors.danger,
    fontWeight: '500',
  },
});
