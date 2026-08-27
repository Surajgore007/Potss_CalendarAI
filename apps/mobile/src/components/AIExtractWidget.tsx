import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GlassCard } from './ui/GlassCard';
import { colors, radii, shadows } from '../theme/tokens';

interface AIExtractWidgetProps {
  userName?: string;
}

export const AIExtractWidget: React.FC<AIExtractWidgetProps> = ({
  userName = 'User',
}) => {
  const router = useRouter();
  const [quickText, setQuickText] = useState('');

  const handleQuickExtract = () => {
    if (!quickText.trim()) {
      router.push('/extract');
      return;
    }
    router.push({
      pathname: '/extract',
      params: { initialText: quickText },
    });
  };

  return (
    <GlassCard contentStyle={styles.cardContent}>
      {/* Top Badge & Greeting */}
      <View style={styles.topRow}>
        <View style={styles.badgeWrap}>
          <Ionicons name="sparkles-outline" size={13} color={colors.textPrimary} />
          <Text style={styles.badgeText} numberOfLines={1}>Smart Extraction</Text>
        </View>
        <Text style={styles.speedText} numberOfLines={1}>Instant</Text>
      </View>

      <Text style={styles.greetingTitle} numberOfLines={1}>Welcome back, {userName}</Text>
      <Text style={styles.greetingSubtitle} numberOfLines={2}>
        Paste any message or announcement to extract dates and deadlines instantly.
      </Text>

      {/* Quick Action Pills */}
      <View style={styles.chipRow}>
        <TouchableOpacity
          style={styles.actionChip}
          onPress={() => router.push('/extract')}
          activeOpacity={0.8}
        >
          <Ionicons name="clipboard-outline" size={13} color={colors.textPrimary} />
          <Text style={styles.actionChipText} numberOfLines={1}>Open Studio</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionChip}
          onPress={() => router.push('/calendar')}
          activeOpacity={0.8}
        >
          <Ionicons name="git-compare-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.actionChipText} numberOfLines={1}>Timeline & Conflicts</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Input Bar */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Paste message text here..."
          placeholderTextColor={colors.textTertiary}
          value={quickText}
          onChangeText={setQuickText}
          maxLength={10000}
          onSubmitEditing={handleQuickExtract}
        />
        <TouchableOpacity
          style={styles.sendBtn}
          onPress={handleQuickExtract}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  cardContent: {
    padding: 16,
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.canvasSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  speedText: {
    fontSize: 11,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  greetingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  greetingSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.canvasSubtle,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  actionChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.control,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.subtle,
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
    paddingVertical: 6,
    minWidth: 0,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: radii.control - 4,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
