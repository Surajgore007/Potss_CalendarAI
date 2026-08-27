import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { colors, radii, shadows } from '../theme/tokens';

export interface HeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
  activeTab?: 'dashboard' | 'events' | 'deadlines' | 'clashes';
  onTabChange?: (tab: 'dashboard' | 'events' | 'deadlines' | 'clashes') => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onAddPress?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showBack = false,
  rightAction,
  activeTab = 'dashboard',
  onTabChange,
  searchQuery = '',
  onSearchChange,
  onAddPress,
}) => {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Simple title bar mode (for detail & sub screens)
  if (title) {
    return (
      <View style={styles.headerCard}>
        <View style={styles.simpleTitleRow}>
          {showBack && (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={20} color="#334155" />
            </TouchableOpacity>
          )}
          <View style={styles.titleTextContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
            {subtitle && <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text>}
          </View>
        </View>

        {rightAction || (
          <TouchableOpacity
            style={styles.userProfilePill}
            onPress={() => router.push('/(auth)/settings' as any)}
            activeOpacity={0.85}
          >
            <View style={styles.avatarWrap}>
              <Ionicons name="person" size={13} color="#4F46E5" />
              <View style={styles.onlineDot} />
            </View>
            <Text style={styles.userNameText} numberOfLines={1}>
              {user?.displayName?.split(' ')[0] || 'User'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const tabs: {
    key: 'dashboard' | 'events' | 'deadlines' | 'clashes';
    label: string;
    icon: any;
  }[] = [
    { key: 'dashboard', label: 'All Items', icon: 'grid-outline' },
    { key: 'events', label: 'Events', icon: 'calendar-outline' },
    { key: 'deadlines', label: 'Deadlines', icon: 'alarm-outline' },
    { key: 'clashes', label: 'Conflicts', icon: 'warning-outline' },
  ];

  return (
    <View style={styles.headerContainer}>
      {/* Top Branding & User Action Bar */}
      <View style={styles.topBrandRow}>
        <View style={styles.brandGroup}>
          <View style={styles.brandLogo}>
            <Ionicons name="calendar-outline" size={17} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.brandTitle} numberOfLines={1}>Vanko</Text>
            <Text style={styles.brandSub} numberOfLines={1}>Intelligent Calendar</Text>
          </View>
        </View>

        <View style={styles.topRightActions}>
          <TouchableOpacity
            style={styles.aiExtractBtn}
            onPress={() => (onAddPress ? onAddPress() : router.push('/extract'))}
            activeOpacity={0.85}
          >
            <Ionicons name="sparkles-outline" size={14} color="#FFFFFF" />
            <Text style={styles.aiExtractBtnText}>Extract</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.profileAvatarBtn}
            onPress={() => router.push('/(auth)/settings' as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="person-outline" size={15} color={colors.textPrimary} />
            <View style={styles.onlineDot} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchWrapper}>
        <Ionicons name="search-outline" size={16} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search hackathons, deadlines, venues..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={onSearchChange}
        />
        {searchQuery.length > 0 && onSearchChange && (
          <TouchableOpacity onPress={() => onSearchChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Horizontal Scrollable Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabScrollRow}
      >
        {tabs.map((t) => {
          const isActive = activeTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => onTabChange && onTabChange(t.key)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={t.icon}
                size={13}
                color={isActive ? '#FFFFFF' : '#64748B'}
              />
              <Text
                style={[
                  styles.filterChipText,
                  isActive && styles.filterChipTextActive,
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.card,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.card,
    gap: 10,
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.card,
  },
  simpleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.control,
    backgroundColor: colors.canvasSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  titleTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  topBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandLogo: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  brandSub: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiExtractBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 5,
  },
  aiExtractBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  profileAvatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.canvasSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  userProfilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  avatarWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    position: 'absolute',
    bottom: -1,
    right: -1,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  userNameText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  tabScrollRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.control,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    gap: 5,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...shadows.subtle,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
