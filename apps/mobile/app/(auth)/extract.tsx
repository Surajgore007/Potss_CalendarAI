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
  Image,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  extractEventsFromText,
  extractEventsFromImage,
  getExtractionQuota,
  ExtractedEvent,
  ExtractionQuotaInfo,
  SAMPLE_WHATSAPP_MESSAGES,
} from '@eventpulse/shared';
import { ManualEventModal } from '../../src/components/ManualEventModal';
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
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isVisionScanning, setIsVisionScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [quotaInfo, setQuotaInfo] = useState<ExtractionQuotaInfo | null>(null);
  const [showManualModal, setShowManualModal] = useState(false);
  type ExtractionSource = 'text' | 'image';
  const [preferredSource, setPreferredSource] = useState<ExtractionSource>('text');

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

  const processedIntentKeyRef = React.useRef<string>('');

  // 1. Convert local file URI to Base64 binary string
  const uriToBase64 = async (uri: string): Promise<string> => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read image stream'));
      reader.readAsDataURL(blob);
    });
  };

  // 2. Perform Image AI Vision Extraction
  const performImageExtraction = async (imageUriToExtract: string, preloadedBase64?: string, contextText?: string) => {
    if (!isAdmin && quotaInfo && quotaInfo.remaining <= 0) {
      setErrorMsg('Daily schedule scan limit reached. Your allowance refreshes tomorrow at midnight.');
      return;
    }

    setErrorMsg(null);
    setIsExtracting(true);
    setIsVisionScanning(true);

    try {
      let base64 = preloadedBase64;
      if (!base64) {
        base64 = await uriToBase64(imageUriToExtract);
      }

      const response = await extractEventsFromImage(base64, 'image/jpeg', contextText || rawText, {
        getIdToken,
        workerUrl: process.env.EXPO_PUBLIC_WORKER_URL || process.env.EXPO_PUBLIC_API_URL,
      });

      if (response.quota) {
        setQuotaInfo(response.quota);
      }

      if (!response.events || response.events.length === 0) {
        setErrorMsg('No event dates were detected in this image. Please ensure the event title and dates are clearly legible.');
        setIsExtracting(false);
        setIsVisionScanning(false);
        return;
      }

      // Check if registration link was mentioned in comments/caption
      const mentionedLinkNotice = response.events.some((ev) => ev.link_status === 'mentioned_in_comments');
      if (mentionedLinkNotice) {
        // Enriched with user note
      }

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
      setIsVisionScanning(false);
      setRawText('');
      setSelectedImageUri(null);
      setErrorMsg(null);
      processedIntentKeyRef.current = '';
      router.replace('/(auth)/confirm');
    } catch (err: any) {
      setIsExtracting(false);
      setIsVisionScanning(false);
      if (err.code === 'QUOTA_EXCEEDED' || err.status === 429) {
        const serverQuota = err.quota || null;
        const dailyLimit = serverQuota?.daily_quota ?? quotaInfo?.daily_quota ?? 3;
        setErrorMsg('Daily schedule scan limit reached. Your allowance refreshes tomorrow at midnight.');
        if (quotaInfo) {
          setQuotaInfo({
            ...quotaInfo,
            remaining: 0,
            used_today: serverQuota?.used_today ?? dailyLimit,
          });
        }
      } else if (err.code === 'UNAUTHORIZED' || err.status === 401) {
        setErrorMsg('Your session has expired. Please sign in again to continue.');
      } else if (err.code === 'TIMEOUT' || err.status === 408) {
        setErrorMsg('The image scan took too long to respond. Please try again with a clear photo or check your connection.');
      } else {
        setErrorMsg(err.message || 'Unable to scan the image. Please verify your connection or enter the details manually.');
      }
    }
  };

  // 3. Unified incoming share / deep link payload handler
  // Rule: If message has text (with or without image), predominantly detect the text.
  // If and only if there is NO text and an image is present, detect the image.
  useEffect(() => {
    const rawTextParam =
      (params?.shared_text as string) ||
      (params?.text as string) ||
      (params?.initialText as string);

    const rawImageParam =
      (params?.imageUri as string) ||
      (params?.image_uri as string);

    let decodedText = '';
    if (rawTextParam) {
      try {
        decodedText = decodeURIComponent(rawTextParam).trim();
      } catch {
        decodedText = rawTextParam.trim();
      }
    }

    let decodedImageUri = '';
    if (rawImageParam) {
      try {
        decodedImageUri = decodeURIComponent(rawImageParam).trim();
      } catch {
        decodedImageUri = rawImageParam.trim();
      }
    }

    if (!decodedText && !decodedImageUri) return;

    // Deduplicate so re-renders or param changes don't re-trigger redundant extractions
    const currentIntentKey = `${decodedText}:::${decodedImageUri}`;
    if (processedIntentKeyRef.current === currentIntentKey) return;
    processedIntentKeyRef.current = currentIntentKey;

    // 1. If an image is present, keep it in selectedImageUri so user sees the poster/flyer preview in the UI
    if (decodedImageUri) {
      setSelectedImageUri(decodedImageUri);
    }

    // 2. If text is present, populate rawText input
    if (decodedText) {
      setRawText(decodedText);
    }

    // 3. Set default preferred extraction source (Text is preferred to save tokens)
    if (decodedText.length > 0) {
      setPreferredSource('text');
    } else if (decodedImageUri.length > 0) {
      setPreferredSource('image');
    }

    // 4. Trigger extraction request:
    // When text is present, extract text first.
    // If text has no events, it automatically falls back to vision scan of decodedImageUri.
    // If only image is present, runs vision extraction directly.
    const timer = setTimeout(() => {
      if (decodedText.length > 0) {
        performExtraction(decodedText, decodedImageUri || undefined);
      } else if (decodedImageUri.length > 0) {
        performImageExtraction(decodedImageUri);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [params?.text, params?.shared_text, params?.initialText, params?.imageUri, params?.image_uri]);

  const performExtraction = async (textToExtract: string, fallbackImageUri?: string) => {
    if (!textToExtract.trim()) {
      const candidateImage = fallbackImageUri || selectedImageUri;
      if (candidateImage) {
        performImageExtraction(candidateImage);
        return;
      }
      setErrorMsg('Please enter or paste the announcement text to continue.');
      return;
    }

    if (!isAdmin && quotaInfo && quotaInfo.remaining <= 0) {
      setErrorMsg('Daily schedule scan limit reached. Your allowance refreshes tomorrow at midnight.');
      return;
    }

    setErrorMsg(null);
    setIsExtracting(true);
    setIsVisionScanning(false);

    try {
      const response = await extractEventsFromText(textToExtract, {
        getIdToken,
        workerUrl: process.env.EXPO_PUBLIC_WORKER_URL || process.env.EXPO_PUBLIC_API_URL,
      });

      if (response.quota) {
        setQuotaInfo(response.quota);
      }

      const candidateImage = fallbackImageUri || selectedImageUri;

      if (!response.events || response.events.length === 0) {
        // Rule: Extract text first; if no info in text, automatically fall back to the image
        if (candidateImage) {
          await performImageExtraction(candidateImage, undefined, textToExtract);
          return;
        }

        setErrorMsg('No event dates or deadlines detected. Please paste the complete announcement or add the event manually.');
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
      setRawText('');
      setSelectedImageUri(null);
      setErrorMsg(null);
      processedIntentKeyRef.current = '';
      router.replace('/(auth)/confirm');
    } catch (err: any) {
      const candidateImage = fallbackImageUri || selectedImageUri;
      if (candidateImage && err.code !== 'QUOTA_EXCEEDED' && err.code !== 'UNAUTHORIZED') {
        // If text extraction failed due to parsing/network issue, attempt image scan
        await performImageExtraction(candidateImage, undefined, textToExtract);
        return;
      }

      setIsExtracting(false);
      if (err.code === 'QUOTA_EXCEEDED' || err.status === 429) {
        const serverQuota = err.quota || null;
        const dailyLimit = serverQuota?.daily_quota ?? quotaInfo?.daily_quota ?? 3;
        setErrorMsg('Daily schedule scan limit reached. Your allowance refreshes tomorrow at midnight.');
        if (quotaInfo) {
          setQuotaInfo({
            ...quotaInfo,
            remaining: 0,
            used_today: serverQuota?.used_today ?? dailyLimit,
          });
        }
      } else if (err.code === 'UNAUTHORIZED' || err.status === 401) {
        setErrorMsg('Your session has expired. Please sign in again to continue.');
      } else if (err.code === 'TIMEOUT' || err.status === 408) {
        setErrorMsg('The request timed out. Please try again or check your internet connection.');
      } else {
        setErrorMsg('Unable to parse the announcement text. Please verify your connection or enter the details manually.');
      }
    }
  };

  const handleExtract = () => {
    setErrorMsg(null);

    const hasText = rawText.trim().length > 0;
    const hasImage = Boolean(selectedImageUri);

    if (hasText && hasImage) {
      // If user explicitly switched to "Attached Image" tab, scan the image
      if (preferredSource === 'image') {
        performImageExtraction(selectedImageUri!);
      } else {
        // Default (Message Text): extract text first, automatically fall back to image if no info found
        performExtraction(rawText, selectedImageUri!);
      }
    } else if (hasText) {
      performExtraction(rawText);
    } else if (hasImage) {
      performImageExtraction(selectedImageUri!);
    } else {
      setErrorMsg('Please provide an announcement message or select an image to scan.');
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setSelectedImageUri(asset.uri);
        // If text is already entered, respect text-first extraction with image fallback
        if (rawText.trim().length > 0) {
          performExtraction(rawText, asset.uri);
        } else {
          // Image only: run Vision extraction directly
          if (asset.base64) {
            performImageExtraction(asset.uri, asset.base64);
          } else {
            performImageExtraction(asset.uri);
          }
        }
      }
    } catch (err: any) {
      setErrorMsg('Unable to access device photos. Please check your photo permissions and try again.');
    }
  };

  const handleSelectSample = (sampleText: string) => {
    setRawText(sampleText);
    setSelectedImageUri(null);
    setErrorMsg(null);
  };

  const handleClear = useCallback(() => {
    setRawText('');
    setSelectedImageUri(null);
    setErrorMsg(null);
    processedIntentKeyRef.current = '';
  }, []);

  // Intercept Android hardware back button to clean up and return to home
  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        if (!isExtracting) {
          handleClear();
          router.replace('/(auth)');
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
      return () => subscription.remove();
    }, [isExtracting, handleClear, router])
  );

  const isQuotaExhausted = !isAdmin && quotaInfo !== null && quotaInfo.remaining <= 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Full-screen Loading Overlay during schedule analysis */}
      <GlassLoadingOverlay
        visible={isExtracting}
        message={isVisionScanning ? "Scanning image for event details..." : "Reading announcement details..."}
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
                onPress={() => {
                  handleClear();
                  router.replace('/(auth)');
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.headerTextWrap}>
                <View style={styles.topBadgeRow}>
                  <View style={styles.badgeIndicator}>
                    <Ionicons name="sparkles-outline" size={12} color={colors.textPrimary} />
                    <Text style={styles.badgeIndicatorText} numberOfLines={1}>Schedule Scanner</Text>
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

                <Text style={styles.headerTitle} numberOfLines={1}>Add via Announcement</Text>
                <Text style={styles.headerSubtitle} numberOfLines={2}>
                  Instantly import dates, deadlines, and details from messages, flyers, or circulars
                </Text>
              </View>
            </GlassCard>

            {/* Quota Exhausted Banner & Manual Fallback Option */}
            {isQuotaExhausted && (
              <GlassCard contentStyle={styles.quotaExhaustedCard}>
                <View style={styles.quotaExhaustedTop}>
                  <View style={styles.quotaExhaustedIconBox}>
                    <Ionicons name="sparkles" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.quotaExhaustedTexts}>
                    <Text style={styles.quotaExhaustedTitle}>Daily Scan Limit Reached</Text>
                    <Text style={styles.quotaExhaustedSub}>
                      You have used all {quotaInfo?.daily_quota ?? 3} scans for today. Your daily allowance will refresh at midnight.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.quotaManualActionBtn}
                  onPress={() => setShowManualModal(true)}
                  activeOpacity={0.85}
                  accessibilityLabel="Add event manually"
                >
                  <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.quotaManualActionBtnText}>Add Event Manually</Text>
                </TouchableOpacity>
              </GlassCard>
            )}

            {/* Image Preview Card if Screenshot or Poster is loaded */}
            {selectedImageUri && (
              <GlassCard contentStyle={styles.imagePreviewCard}>
                <View style={styles.imagePreviewHeader}>
                  <View style={styles.inputLabelGroup}>
                    <Ionicons name="image-outline" size={14} color={colors.primary} />
                    <Text style={styles.imagePreviewLabel}>ATTACHED IMAGE</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedImageUri(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
                <Image
                  source={{ uri: selectedImageUri }}
                  style={styles.imagePreviewThumbnail}
                  resizeMode="contain"
                />
              </GlassCard>
            )}

            {/* Action Row: Pick Screenshot / Poster */}
            <View style={styles.sourceSelectorRow}>
              <TouchableOpacity
                style={styles.pickImageBtn}
                onPress={handlePickImage}
                activeOpacity={0.8}
              >
                <Ionicons name="image-outline" size={16} color={colors.primary} />
                <Text style={styles.pickImageBtnText}>Select Image or Flyer from Gallery</Text>
              </TouchableOpacity>
            </View>

            {/* Sample Selector Pills */}
            <View style={styles.sampleSection}>
              <Text style={styles.sampleHeading}>OR TRY A SAMPLE ANNOUNCEMENT:</Text>
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
                  <Text style={styles.inputLabel}>{selectedImageUri ? 'ACCOMPANYING MESSAGE / CAPTION' : 'ANNOUNCEMENT OR MESSAGE'}</Text>
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
                placeholder={selectedImageUri ? "Add optional message text or caption..." : "Paste announcement message, circular, or details with dates and links..."}
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={selectedImageUri ? 4 : 8}
                maxLength={25000}
                textAlignVertical="top"
                editable={!isQuotaExhausted}
              />

              <View style={styles.inputFooter}>
                <Text style={styles.charCount}>{rawText.length} / 25,000</Text>
                <View style={styles.aiEngineTag}>
                  <Ionicons name="sparkles-outline" size={12} color={colors.textTertiary} />
                  <Text style={styles.aiEngineText}>Automatic Schedule Detection</Text>
                </View>
              </View>
            </GlassCard>

            {/* Source Toggle Tabs when both Image and Text exist */}
            {selectedImageUri && rawText.trim().length > 0 && !isExtracting && (
              <View style={styles.sourceToggleBox}>
                <Text style={styles.sourceToggleLabel}>DETECT DETAILS FROM:</Text>
                <View style={styles.sourceToggleRow}>
                  <TouchableOpacity
                    style={[styles.sourceToggleBtn, preferredSource === 'text' && styles.sourceToggleBtnActive]}
                    onPress={() => setPreferredSource('text')}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="document-text"
                      size={13}
                      color={preferredSource === 'text' ? '#FFFFFF' : colors.textSecondary}
                    />
                    <Text style={[styles.sourceToggleText, preferredSource === 'text' && styles.sourceToggleTextActive]}>
                      Message Text (Recommended)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.sourceToggleBtn, preferredSource === 'image' && styles.sourceToggleBtnActive]}
                    onPress={() => setPreferredSource('image')}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="scan"
                      size={13}
                      color={preferredSource === 'image' ? '#FFFFFF' : colors.textSecondary}
                    />
                    <Text style={[styles.sourceToggleText, preferredSource === 'image' && styles.sourceToggleTextActive]}>
                      Attached Image
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Error Alert Banner */}
            {errorMsg && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.errorText} numberOfLines={3}>{errorMsg}</Text>
              </View>
            )}

            {/* Primary Action Button or Quota Fallback */}
            {isQuotaExhausted ? (
              <TouchableOpacity
                style={styles.quotaManualActionBtn}
                onPress={() => setShowManualModal(true)}
                activeOpacity={0.85}
                accessibilityLabel="Add event manually"
              >
                <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.quotaManualActionBtnText}>Add Event Manually</Text>
              </TouchableOpacity>
            ) : (
              <>
                <GlassButton
                  title={
                    selectedImageUri && rawText.trim().length > 0
                      ? (preferredSource === 'text' ? "Find Events in Message Text" : "Scan Image for Events")
                      : (selectedImageUri ? "Scan Image for Events" : "Find Events in Message")
                  }
                  variant="primary"
                  onPress={handleExtract}
                  loading={isExtracting}
                  disabled={!selectedImageUri && rawText.trim().length === 0}
                  icon={
                    <Ionicons
                      name={
                        (selectedImageUri && rawText.trim().length > 0 && preferredSource === 'image') || (selectedImageUri && rawText.trim().length === 0)
                          ? "scan-outline"
                          : "sparkles-outline"
                      }
                      size={16}
                      color="#FFFFFF"
                    />
                  }
                  style={styles.extractButton}
                />
                <TouchableOpacity
                  style={styles.manualEntryLink}
                  onPress={() => setShowManualModal(true)}
                  activeOpacity={0.7}
                  accessibilityLabel="Enter event details manually"
                >
                  <Ionicons name="create-outline" size={15} color={colors.textSecondary} />
                  <Text style={styles.manualEntryLinkText}>Or enter event details manually</Text>
                </TouchableOpacity>
                <Text style={styles.aiDisclaimer}>
                  Schedule details are detected automatically. Please review dates and times before adding to your calendar.
                </Text>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <ManualEventModal
        visible={showManualModal}
        onClose={() => setShowManualModal(false)}
        onEventCreated={(id) => router.push(`/event/${id}`)}
      />
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
    paddingBottom: 110,
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
  quotaExhaustedCard: {
    padding: 16,
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(234, 88, 12, 0.25)',
  },
  quotaExhaustedTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  quotaExhaustedIconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  quotaExhaustedTexts: {
    flex: 1,
    gap: 4,
  },
  quotaExhaustedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 18,
  },
  quotaExhaustedSub: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  quotaManualActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: radii.control,
    gap: 8,
    ...shadows.subtle,
  },
  quotaManualActionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  manualEntryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  manualEntryLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
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
  aiDisclaimer: {
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  imagePreviewCard: {
    padding: 14,
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  imagePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  imagePreviewLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  imagePreviewThumbnail: {
    width: '100%',
    height: 180,
    borderRadius: radii.control,
    backgroundColor: colors.canvasSubtle,
  },
  sourceSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickImageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.subtle,
  },
  pickImageBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sourceToggleBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.control,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    gap: 8,
    ...shadows.subtle,
  },
  sourceToggleLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textTertiary,
    letterSpacing: 0.5,
  },
  sourceToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sourceToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  sourceToggleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sourceToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sourceToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  fallbackPosterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669', // Emerald accent
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.control,
    ...shadows.subtle,
  },
  fallbackPosterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
