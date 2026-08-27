import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { THEME_DESIGN } from '@eventpulse/shared';

interface SidebarRailProps {
  onExtractPress?: () => void;
}

export const SidebarRail: React.FC<SidebarRailProps> = ({ onExtractPress }) => {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    { name: 'Dashboard', route: '/(auth)', icon: 'home-outline', activeIcon: 'home' },
    { name: 'Calendar', route: '/(auth)/calendar', icon: 'calendar-outline', activeIcon: 'calendar' },
    { name: 'Extract', route: '/(auth)/extract', icon: 'sparkles-outline', activeIcon: 'sparkles' },
    { name: 'Settings', route: '/(auth)/settings', icon: 'settings-outline', activeIcon: 'settings' },
  ];

  return (
    <View style={styles.railContainer}>
      {/* Brand Logo */}
      <TouchableOpacity
        style={styles.logoBtn}
        onPress={() => router.push('/(auth)' as any)}
        activeOpacity={0.85}
      >
        <View style={styles.logoIconWrapper}>
          <Ionicons name="pulse" size={22} color="#FFFFFF" />
        </View>
      </TouchableOpacity>

      {/* Nav Actions */}
      <View style={styles.navGroup}>
        {navItems.map((item) => {
          const isActive =
            item.route === '/(auth)'
              ? pathname === '/' || pathname === '/(auth)' || pathname === '/(auth)/index'
              : pathname.includes(item.route);

          return (
            <TouchableOpacity
              key={item.name}
              style={[styles.navBtn, isActive && styles.navBtnActive]}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={(isActive ? item.activeIcon : item.icon) as any}
                size={20}
                color={isActive ? '#4F46E5' : '#94A3B8'}
              />
              {isActive && <View style={styles.activePillBar} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bottom Floating Quick CTA */}
      <View style={styles.bottomGroup}>
        <TouchableOpacity
          style={styles.sparkleActionBtn}
          onPress={() => (onExtractPress ? onExtractPress() : router.push('/extract'))}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  railContainer: {
    width: 72,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    marginVertical: 14,
    marginLeft: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.85)',
    ...THEME_DESIGN.shadows.card,
  },
  logoBtn: {
    padding: 4,
  },
  logoIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    ...THEME_DESIGN.shadows.glow,
  },
  navGroup: {
    gap: 14,
    alignItems: 'center',
  },
  navBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: 'transparent',
  },
  navBtnActive: {
    backgroundColor: '#EEF2FF',
  },
  activePillBar: {
    position: 'absolute',
    left: -8,
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: '#4F46E5',
  },
  bottomGroup: {
    alignItems: 'center',
  },
  sparkleActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    ...THEME_DESIGN.shadows.glow,
  },
});
