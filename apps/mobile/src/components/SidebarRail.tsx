import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';

interface SidebarRailProps {
  onExtractPress?: () => void;
}

export const SidebarRail: React.FC<SidebarRailProps> = ({ onExtractPress }) => {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    { name: 'Dashboard', route: '/', icon: 'home-outline', activeIcon: 'home' },
    { name: 'Calendar', route: '/calendar', icon: 'calendar-outline', activeIcon: 'calendar' },
    { name: 'Extract', route: '/extract', icon: 'sparkles-outline', activeIcon: 'sparkles' },
  ];

  return (
    <View style={styles.railContainer}>
      {/* Brand Logo Pill */}
      <TouchableOpacity
        style={styles.logoBtn}
        onPress={() => router.push('/')}
        activeOpacity={0.8}
      >
        <View style={styles.logoIconWrapper}>
          <Ionicons name="pulse" size={22} color="#3B82F6" />
        </View>
      </TouchableOpacity>

      {/* Nav Actions */}
      <View style={styles.navGroup}>
        {navItems.map((item) => {
          const isActive =
            item.route === '/'
              ? pathname === '/' || pathname === '/(auth)' || pathname === '/(auth)/index'
              : pathname.includes(item.route);

          return (
            <TouchableOpacity
              key={item.name}
              style={[styles.navBtn, isActive && styles.navBtnActive]}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={(isActive ? item.activeIcon : item.icon) as any}
                size={20}
                color={isActive ? '#3B82F6' : '#94A3B8'}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bottom Profile / Quick Action */}
      <View style={styles.bottomGroup}>
        <TouchableOpacity
          style={styles.sparkleActionBtn}
          onPress={() => (onExtractPress ? onExtractPress() : router.push('/extract'))}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  railContainer: {
    width: 68,
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    marginVertical: 12,
    marginLeft: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
  logoBtn: {
    padding: 6,
  },
  logoIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navGroup: {
    alignItems: 'center',
    gap: 12,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  navBtnActive: {
    backgroundColor: '#EFF6FF',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 2,
  },
  bottomGroup: {
    alignItems: 'center',
  },
  sparkleActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
});
