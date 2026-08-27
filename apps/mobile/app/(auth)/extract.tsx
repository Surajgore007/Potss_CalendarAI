import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  extractEventsFromText,
  getExtractionQuota,
  ExtractedEvent,
  ExtractionQuotaInfo,
  SAMPLE_WHATSAPP_MESSAGES,
} from '@eventpulse/shared';
import { useEvents } from '../../src/context/EventsContext';
import { useAuth } from '../../src/context/AuthContext';
import { SidebarRail } from '../../src/components/SidebarRail';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { GlassButton } from '../../src/components/ui/GlassButton';
import { GlassLoadingOverlay } from '../../src/components/ui/GlassLoadingOverlay';
import { colors, radii, shadows } from '../../src/theme/tokens';

export default function ExtractStudioScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const { setPendingExtractions, checkDuplicate } = useEvents();
  const { getIdToken, isAdmin } = useAuth();

  const [rawText, setRawText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [quotaInfo, setQuotaInfo] = useState<ExtractionQuotaInfo | null>(null);

  // Load quota stats on mount
  const refreshQuota = useCallback(async () => {
    try {
      const q = await getExtractionQuota({
        getIdToken,
        workerUrl: process.env.EXPO_PUBLIC_WORKER_URL || process.env.EXPO_PUBLIC_API_URL,
      });
      setQuotaInfo(q);
    } catch {
      // Ignored
    }
  }, [getIdToken]);

  useEffect(() => {
    refreshQuota();
  }, [refreshQuota]);

  const lastExtractedTextRef = React.useRef<string>('');

  // Load incoming deep link or initial text
  useEffect(() => {
    const textParam =
      (params?.shared_text as string) ||
      (params?.text as string) ||
      (params?.initialText as string);

    if (textParam) {
      let decoded = textParam;
      try {
        decoded = decodeURIComponent(textParam);
      } catch {
        decoded = textParam;
      }
      setRawText(decoded);
      if (decoded.trim().length > 0 && lastExtractedTextRef.current !== decoded.trim()) {
        lastExtractedTextRef.current = decoded.trim();
        const timer = setTimeout(() => {
          performExtraction(decoded);
        }, 250);
        return () => clearTimeout(timer);
      }
    }
  }, [params?.text, params?.shared_text, params?.initialText]);

  const performExtraction = async (textToExtract: string) => {
    if (!textToExtract.trim()) {
      setErrorMsg('Please enter or paste message text first.');
      return;
    }

    if (!isAdmin && quotaInfo && quotaInfo.remaining <= 0) {
      setErrorMsg("You've used today's 3 extractions. New ones unlock tomorrow.");
      return;
    }

    setErrorMsg(null);
    setIsExtracting(true);

    try {
      const response = await extractEventsFromText(textToExtract, {
        getIdToken,
        workerUrl: process.env.EXPO_PUBLIC_WORKER_URL || process.env.EXPO_PUBLIC_API_URL,
      });

      if (response.quota) {
        setQuotaInfo(response.quota);
      }

      if (!response.events || response.events.length === 0) {
        setErrorMsg('No upcoming events or dates found in this text. Try copying the full message.');
        setIsExtracting(false);
        return;
      }

      // Enriched events with duplicate detection
      const enrichedEvents = response.events.map((event: ExtractedEvent) => {
        const dupResult = checkDuplicate(event);
        return {
          ...event,
          duplicate_warning: {
            is_duplicate: dupResult.isDuplicate,
            matched_event_id: dupResult.matchedEvent?.id,
            matched_event_title: dupResult.matchedEvent?.title,
            similarity_score: dupResult.similarityScore,
          },
        };
      });

      setPendingExtractions(enrichedEvents);
      setIsExtracting(false);
      router.push('/(auth)/confirm');
    } catch (err: any) {
      console.error('Extraction failed:', err);
      setIsExtracting(false);
      if (err.code === 'QUOTA_EXCEEDED' || err.status === 429) {
        // Use server-returned quota if available, avoid hardcoded values
        const serverQuota = err.quota || null;
        const dailyLimit = serverQuota?.daily_quota ?? quotaInfo?.daily_quota ?? 3;
        setErrorMsg(`You've used today's ${dailyLimit} extractions. New ones unlock tomorrow.`);
        if (quotaInfo) {
          setQuotaInfo({
            ...quotaInfo,
            remaining: 0,
            used_today: serverQuota?.used_today ?? dailyLimit,
          });
        }
      } else if (err.code === 'UNAUTHORIZED' || err.status === 401) {
        setErrorMsg(err.message || 'Session expired or not signed in. Please sign in to use AI extraction.');
      } else if (err.code === 'TIMEOUT' || err.status === 408) {
        setErrorMsg('Extraction timed out. Please try with a slightly shorter text.');
      } else {
        setErrorMsg(err.message || 'Failed to extract schedule. Please check your connection and try again.');
      }
    }
  };

  const handleExtract = () => {
    performExtraction(rawText);
  };

  const handleSelectSample = (sampleText: string) => {
    setRawText(sampleText);
    setErrorMsg(null);
  };

  const handleClear = () => {
    setRawText('');
    setErrorMsg(null);
  };

  const isQuotaExhausted = !isAdmin && quotaInfo !== null && quotaInfo.remaining <= 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Full-screen Loading Overlay during AI extraction */}
      <GlassLoadingOverlay
        visible={isExtracting}
        message="Curating your personalized schedule..."
      />

      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
      >
        <View style={styles.screenLayout}>
          {isTablet && (
            <SidebarRail onExtractPress={() => {}} />
          )}

          <ScrollView
            style={styles.mainScroll}
            contentContainerStyle={styles.contentContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header Card */}
            <GlassCard contentStyle={styles.headerCard}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => router.push('/')}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.headerTextWrap}>
                <View style={styles.topBadgeRow}>
                  <View style={styles.badgeIndicator}>
                    <Ionicons name="sparkles-outline" size={12} color={colors.textPrimary} />
                    <Text style={styles.badgeIndicatorText} numberOfLines={1}>Smart Extraction</Text>
                  </View>

                  {/* Daily Quota Pill */}
                  {isAdmin ? (
                    <View style={styles.adminPill}>
                      <Ionicons name="shield-checkmark" size={11} color="#FFFFFF" />
                      <Text style={styles.adminPillText}>UNLIMITED</Text>
                    </View>
                  ) : quotaInfo ? (
                    <View style={[styles.quotaPill, isQuotaExhausted && styles.quotaPillEmpty]}>
                      <Ionicons
                        name="hourglass-outline"
                        size={11}
                        color={isQuotaExhausted ? colors.danger : colors.textSecondary}
                      />
                      <Text style={[styles.quotaPillText, isQuotaExhausted && styles.quotaPillTextEmpty]}>
                        {quotaInfo.remaining} / {quotaInfo.daily_quota} left today
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.headerTitle} numberOfLines={1}>Event Studio</Text>
                <Text style={styles.headerSubtitle} numberOfLines={2}>
                  Extract hackathons, deadlines, and meetups from raw text announcements
                </Text>
              </View>
            </GlassCard>

            {/* Quota Exhausted Banner */}
            {isQuotaExhausted && (
              <View style={styles.quotaBanner}>
                <Ionicons name="information-circle-outline" size={18} color={colors.textPrimary} />
                <Text style={styles.quotaBannerText}>
                  You've used today's 3 extractions. New ones unlock tomorrow.
                </Text>
              </View>
            )}

            {/* Sample Selector Pills */}
            <View style={styles.sampleSection}>
              <Text style={styles.sampleHeading}>TRY A SAMPLE ANNOUNCEMENT:</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sampleRow}
              >
                {SAMPLE_WHATSAPP_MESSAGES.map((sample, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.sampleChip}
                    onPress={() => handleSelectSample(sample.text)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="document-text-outline"
                      size={13}
                      color={colors.textSecondary}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.sampleChipText} numberOfLines={1}>{sample.title}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Text Input Card */}
            <GlassCard contentStyle={styles.inputCard}>
              <View style={styles.inputHeader}>
                <View style={styles.inputLabelGroup}>
                  <Ionicons name="chatbubbles-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.inputLabel}>MESSAGE TEXT</Text>
                </View>
                {rawText.length > 0 && (
                  <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.clearText}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TextInput
                style={styles.textArea}
                value={rawText}
                onChangeText={(t) => {
                  setRawText(t);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="Paste message here with event dates, deadlines, or registration links..."
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={8}
                maxLength={25000}
                textAlignVertical="top"
                editable={!isQuotaExhausted}
              />

              <View style={styles.inputFooter}>
                <Text style={styles.charCount}>{rawText.length} / 25,000</Text>
                <View style={styles.aiEngineTag}>
                  <Ionicons name="sparkles-outline" size={12} color={colors.textTertiary} />
                  <Text style={styles.aiEngineText}>Smart Schedule Parser</Text>
                </View>
              </View>
            </GlassCard>

            {/* Error Alert Banner */}
            {errorMsg && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.errorText} numberOfLines={3}>{errorMsg}</Text>
              </View>
            )}

            {/* Primary Action Button */}
            <GlassButton
              title={isQuotaExhausted ? 'Daily Limit Reached' : 'Extract Schedule'}
              variant="primary"
              onPress={handleExtract}
              loading={isExtracting}
              disabled={rawText.trim().length === 0 || isQuotaExhausted}
              icon={<Ionicons name="sparkles-outline" size={16} color="#FFFFFF" />}
              style={styles.extractButton}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  flexOne: {
    flex: 1,
  },
  screenLayout: {
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
  topBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  badgeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.canvasSubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  badgeIndicatorText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  adminPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primary,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  adminPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  quotaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.canvasSubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  quotaPillEmpty: {
    backgroundColor: colors.dangerLight,
    borderColor: 'rgba(220, 38, 38, 0.2)',
  },
  quotaPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  quotaPillTextEmpty: {
    color: colors.danger,
    fontWeight: '700',
  },
  quotaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.canvasSubtle,
    borderRadius: radii.control,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  quotaBannerText: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '500',
    flex: 1,
    lineHeight: 16,
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
  sampleSection: {
    gap: 6,
  },
  sampleHeading: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sampleRow: {
    gap: 8,
    paddingVertical: 2,
  },
  sampleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.subtle,
  },
  sampleChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  inputCard: {
    padding: 16,
    gap: 10,
  },
  inputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.4,
  },
  clearText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  textArea: {
    minHeight: 140,
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 22,
    backgroundColor: colors.canvasSubtle,
    borderRadius: radii.control,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  inputFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  charCount: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  aiEngineTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  aiEngineText: {
    fontSize: 11,
    color: colors.textTertiary,
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
  extractButton: {
    minHeight: 48,
  },
});
