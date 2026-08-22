import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SidebarRail } from '../../src/components/SidebarRail';
import { useEvents } from '../../src/context/EventsContext';
import {
  extractEventsWithGemini,
  SAMPLE_WHATSAPP_MESSAGES,
} from '@eventpulse/shared';

export default function ExtractScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { setPendingExtractions, checkDuplicate } = useEvents();

  const [rawText, setRawText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const textParam = (params?.text || params?.shared_text || params?.initialText) as string | undefined;
    if (textParam && typeof textParam === 'string') {
      const decoded = decodeURIComponent(textParam);
      setRawText(decoded);
      // If shared directly from WhatsApp or deep link, automatically trigger extraction
      if (decoded.trim().length > 0 && (params?.autoExtract === 'true' || params?.shared_text || params?.text)) {
        setTimeout(() => {
          performExtraction(decoded);
        }, 100);
      }
    }
  }, [params]);

  const performExtraction = async (textToExtract: string) => {
    if (!textToExtract.trim()) {
      setErrorMsg('Please paste a WhatsApp message first.');
      return;
    }

    setErrorMsg(null);
    setIsExtracting(true);

    try {
      const response = await extractEventsWithGemini(textToExtract);

      if (!response.events || response.events.length === 0) {
        setErrorMsg(
          'Could not find any tech events or deadlines in this message. Please check the text.'
        );
        setIsExtracting(false);
        return;
      }

      // Run duplicate detection on all extracted events
      const enrichedEvents = response.events.map((event) => {
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
      setErrorMsg(
        err.message || 'Failed to extract events. Please check your Groq API key in .env.'
      );
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.layoutWrapper}>
        {Platform.OS === 'web' && (
          <SidebarRail onExtractPress={() => {}} />
        )}

        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.headerCard}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.push('/')}
            >
              <Ionicons name="arrow-back" size={18} color="#64748B" />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>AI Event Extractor</Text>
              <Text style={styles.headerSubtitle}>
                Powered by Groq LPUs (~200ms real-time chat parsing)
              </Text>
            </View>
          </View>

          {/* Preset Sample Selector Pills */}
          <View style={styles.sampleSection}>
            <Text style={styles.sampleHeading}>TRY A REAL SAMPLE MESSAGE:</Text>
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
                    size={14}
                    color="#3B82F6"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.sampleChipText}>{sample.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Text Input Card */}
          <View style={styles.inputCard}>
            <View style={styles.inputHeader}>
              <View style={styles.inputLabelGroup}>
                <Ionicons name="chatbubbles-outline" size={15} color="#3B82F6" />
                <Text style={styles.inputLabel}>WHATSAPP MESSAGE TEXT</Text>
              </View>
              {rawText.length > 0 && (
                <TouchableOpacity onPress={handleClear}>
                  <Text style={styles.clearText}>Clear text</Text>
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
              placeholder="Paste WhatsApp message here (with emojis, relative dates, links, multiple events)..."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={10}
              textAlignVertical="top"
            />

            <View style={styles.inputFooter}>
              <Text style={styles.charCount}>{rawText.length} characters</Text>
              <View style={styles.aiEngineTag}>
                <Ionicons name="flash" size={12} color="#16A34A" />
                <Text style={styles.aiEngineText}>Groq LPU (GPT-OSS 120B)</Text>
              </View>
            </View>
          </View>

          {/* Error Alert */}
          {errorMsg && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color="#EF4444" />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {/* Primary Action Button */}
          <TouchableOpacity
            style={[styles.extractButton, isExtracting && styles.btnDisabled]}
            activeOpacity={0.85}
            onPress={handleExtract}
            disabled={isExtracting || rawText.trim().length === 0}
          >
            {isExtracting ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.extractButtonText}>
                  Extracting with Groq LPU...
                </Text>
              </View>
            ) : (
              <View style={styles.loadingRow}>
                <Ionicons
                  name="sparkles"
                  size={18}
                  color="#FFFFFF"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.extractButtonText}>
                  Extract Event Objects
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Security Note */}
          <View style={styles.noteBox}>
            <Ionicons name="shield-checkmark-outline" size={14} color="#64748B" />
            <Text style={styles.noteText}>
              Never auto-saves silently. You review & edit every field on the next screen before saving.
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
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
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
  backBtn: {
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
  sampleSection: {
    gap: 8,
  },
  sampleHeading: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: '#64748B',
    marginLeft: 4,
  },
  sampleRow: {
    gap: 8,
    paddingVertical: 2,
  },
  sampleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  sampleChipText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    overflow: 'hidden',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  inputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  inputLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#475569',
  },
  clearText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
  textArea: {
    minHeight: 200,
    padding: 16,
    fontSize: 14,
    color: '#0F172A',
    lineHeight: 22,
  },
  inputFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },
  charCount: {
    fontSize: 12,
    color: '#94A3B8',
  },
  aiEngineTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  aiEngineText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEE2E2',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#B91C1C',
    lineHeight: 18,
  },
  extractButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  btnDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.7,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  extractButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  noteText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
});
