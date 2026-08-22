import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';

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
  const { user, signOutUser } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Simple title bar mode (for detail screens)
  if (title) {
    return (
      <View style={styles.headerContainer}>
        <View style={styles.simpleTitleRow}>
          {showBack && (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={18} color="#64748B" />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
            {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
          </View>
        </View>

        {rightAction || (
          <TouchableOpacity
            style={styles.userProfilePill}
            onPress={signOutUser}
            activeOpacity={0.8}
          >
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={14} color="#3B82F6" />
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
    icon: string;
  }[] = [
    { key: 'dashboard', label: 'All', icon: 'grid-outline' },
    { key: 'events', label: 'Events', icon: 'calendar-outline' },
    { key: 'deadlines', label: 'Deadlines', icon: 'alarm-outline' },
    { key: 'clashes', label: 'Clashes', icon: 'warning-outline' },
  ];

  return (
    <View style={styles.headerContainer}>
      {/* Search Bar */}
      <View style={[styles.searchWrapper, isMobile && styles.searchWrapperMobile]}>
        <Ionicons name="search" size={16} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder={isMobile ? 'Search events...' : 'Search hackathons, meetups, venues...'}
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={onSearchChange}
        />
        {searchQuery.length > 0 && onSearchChange && (
          <TouchableOpacity onPress={() => onSearchChange('')}>
            <Ionicons name="close-circle" size={14} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabPillGroup}>
        {tabs.map((t) => {
          const isActive = activeTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabPill, isActive && styles.tabPillActive]}
              onPress={() => onTabChange && onTabChange(t.key)}
              activeOpacity={0.7}
            >
              {!isMobile && (
                <Ionicons
                  name={t.icon as any}
                  size={14}
                  color={isActive ? '#3B82F6' : '#64748B'}
                />
              )}
              <Text
                style={[
                  styles.tabPillText,
                  isActive && styles.tabPillTextActive,
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Right Actions */}
      <View style={styles.rightActionsGroup}>
        <TouchableOpacity
          style={styles.addEventBtn}
          onPress={() => (onAddPress ? onAddPress() : router.push('/extract'))}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={16} color="#FFFFFF" />
          {!isMobile && <Text style={styles.addEventBtnText}>Paste WhatsApp</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.userProfilePill}
          onPress={signOutUser}
          activeOpacity={0.8}
        >
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={14} color="#3B82F6" />
          </View>
          {!isMobile && (
            <Text style={styles.userNameText} numberOfLines={1}>
              {user?.displayName?.split(' ')[0] || 'User'}
            </Text>
          )}
          <Ionicons name="log-out-outline" size={14} color="#94A3B8" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
  simpleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
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
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 160,
    flex: 1,
    maxWidth: 280,
    gap: 6,
  },
  searchWrapperMobile: {
    maxWidth: '100%',
    flex: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  tabPillGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 4,
  },
  tabPillActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  tabPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  tabPillTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  rightActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addEventBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    gap: 4,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  addEventBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userProfilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingLeft: 4,
    paddingRight: 8,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 5,
  },
  avatarCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userNameText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
});
