import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ClashDetail, THEME_DESIGN } from '@eventpulse/shared';

interface ClashBannerProps {
  clashes: ClashDetail[];
}

export const ClashBanner: React.FC<ClashBannerProps> = ({ clashes }) => {
  const [expanded, setExpanded] = useState(false);

  if (!clashes || clashes.length === 0) return null;

  const count = clashes.length;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.headerRow}
        activeOpacity={0.85}
        onPress={() => setExpanded((prev) => !prev)}
      >
        <View style={styles.iconBox}>
          <Ionicons name="warning" size={16} color="#E11D48" />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {count === 1 ? '1 Schedule Conflict Detected' : `${count} Schedule Conflicts Detected`}
          </Text>
          <Text style={styles.subtitle}>
            {expanded ? 'Tap to collapse details' : 'Overlapping event dates or collisions found'}
          </Text>
        </View>

        <View style={styles.chevronWrap}>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="#E11D48"
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.detailsList}>
          {clashes.map((clash, idx) => (
            <View key={idx} style={styles.clashItem}>
              <View style={styles.bulletDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.clashText}>{clash.description}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF1F2',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FFE4E6',
    overflow: 'hidden',
    marginBottom: 16,
    ...THEME_DESIGN.shadows.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFE4E6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: '#9F1239',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11,
    color: '#BE123C',
    marginTop: 1,
    fontWeight: '500',
  },
  chevronWrap: {
    padding: 4,
  },
  detailsList: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(254, 205, 211, 0.6)',
    paddingTop: 10,
  },
  clashItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E11D48',
    marginTop: 5,
  },
  clashText: {
    fontSize: 12,
    color: '#881337',
    lineHeight: 16,
    fontWeight: '500',
  },
});
