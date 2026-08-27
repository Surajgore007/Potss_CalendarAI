import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CONFIDENCE_LOW_THRESHOLD } from '@eventpulse/shared';

interface ConfidenceBadgeProps {
  score: number;
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({ score }) => {
  const percentage = Math.round(score * 100);
  const isLow = score < CONFIDENCE_LOW_THRESHOLD;
  const isHigh = score >= 0.85;

  const color = isLow ? '#F59E0B' : isHigh ? '#10B981' : '#4F46E5';
  const bgColor = isLow ? '#FFFBEB' : isHigh ? '#ECFDF5' : '#EEF2FF';
  const iconName = isLow ? 'alert-circle-outline' : isHigh ? 'sparkles' : 'checkmark-circle-outline';

  return (
    <View style={[styles.container, { backgroundColor: bgColor, borderColor: `${color}35` }]}>
      <Ionicons name={iconName as any} size={11} color={color} style={{ marginRight: 4 }} />
      <Text style={[styles.text, { color }]}>
        {isLow ? `AI: ${percentage}% (Check)` : `AI: ${percentage}%`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
