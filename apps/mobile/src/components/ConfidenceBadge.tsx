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

  const color = isLow ? '#F59E0B' : isHigh ? '#10B981' : '#38BDF8';
  const bgColor = isLow ? '#F59E0B15' : isHigh ? '#10B98115' : '#38BDF815';
  const iconName = isLow ? 'alert-circle-outline' : isHigh ? 'sparkles' : 'checkmark-circle-outline';

  return (
    <View style={[styles.container, { backgroundColor: bgColor, borderColor: `${color}40` }]}>
      <Ionicons name={iconName as any} size={12} color={color} style={{ marginRight: 4 }} />
      <Text style={[styles.text, { color }]}>
        {isLow ? `AI: ${percentage}% (Review)` : `AI: ${percentage}%`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
  },
});
