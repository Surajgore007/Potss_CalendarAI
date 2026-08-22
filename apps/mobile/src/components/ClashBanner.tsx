import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ClashDetail } from '@eventpulse/shared';

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
        activeOpacity={0.8}
        onPress={() => setExpanded((prev) => !prev)}
      >
        <View style={styles.iconBox}>
          <Ionicons name="warning" size={18} color="#DC2626" />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {count === 1 ? '1 Calendar Clash Detected' : `${count} Calendar Clashes Detected`}
          </Text>
          <Text style={styles.subtitle}>
            {expanded ? 'Tap to collapse' : 'Overlapping event dates or critical deadlines found'}
          </Text>
        </View>

        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#DC2626"
        />
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
    backgroundColor: '#FEF2F2',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
  },
  subtitle: {
    fontSize: 12,
    color: '#B91C1C',
    marginTop: 2,
  },
  detailsList: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#FEE2E2',
    gap: 8,
  },
  clashItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 4,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#DC2626',
    marginTop: 6,
  },
  clashText: {
    fontSize: 12,
    color: '#7F1D1D',
    lineHeight: 18,
    fontWeight: '500',
  },
});
