import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventType, EVENT_TYPE_CONFIG } from '@eventpulse/shared';

interface TypeBadgeProps {
  type: EventType;
  size?: 'sm' | 'md';
}

export const TypeBadge: React.FC<TypeBadgeProps> = ({ type, size = 'md' }) => {
  const config = EVENT_TYPE_CONFIG[type] || EVENT_TYPE_CONFIG.other;
  const isSm = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.badgeBg, borderColor: `${config.accentColor}30` },
        isSm && styles.badgeSm,
      ]}
    >
      <Ionicons
        name={config.icon as any}
        size={isSm ? 10 : 12}
        color={config.badgeText}
        style={{ marginRight: 4 }}
      />
      <Text
        style={[
          styles.text,
          { color: config.badgeText },
          isSm && styles.textSm,
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  textSm: {
    fontSize: 10,
    fontWeight: '700',
  },
});
