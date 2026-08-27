import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useEvents } from '../../src/context/EventsContext';
import { Header } from '../../src/components/Header';
import { SidebarRail } from '../../src/components/SidebarRail';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { GlassButton } from '../../src/components/ui/GlassButton';
import { subscribeToLiveUserCount } from '@eventpulse/shared';
import { colors, radii, shadows } from '../../src/theme/tokens';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOutUser } = useAuth();
  const { events } = useEvents();
  const [liveUserCount, setLiveUserCount] = useState<number | null>(null);

  // Subscribe to real-time live platform user count
  useEffect(() => {
    const unsubscribe = subscribeToLiveUserCount((count) => {
      setLiveUserCount(count);
    });
    return () => unsubscribe();
  }, []);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOutUser();
          router.replace('/(public)/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.layoutWrapper}>
        {Platform.OS === 'web' && <SidebarRail />}

        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <Header title="Account & Settings" showBack />

          {/* User Profile Card */}
          <GlassCard contentStyle={styles.profileCard}>
            <View style={styles.avatarLarge}>
              <Ionicons name="person-outline" size={26} color={colors.textPrimary} />
            </View>
            <View style={styles.profileInfoCol}>
              <Text style={styles.userName} numberOfLines={1}>{user?.displayName || 'User'}</Text>
              <Text style={styles.userEmail} numberOfLines={1}>{user?.email || ''}</Text>
              <View style={styles.accountBadge}>
                <Ionicons name="shield-checkmark-outline" size={11} color={colors.success} />
                <Text style={styles.accountBadgeText} numberOfLines={1}>Verified Account</Text>
              </View>
            </View>
          </GlassCard>

          {/* Live Platform & Community Network */}
          <GlassCard contentStyle={styles.sectionCard}>
            <Text style={styles.sectionHeader} numberOfLines={1}>Platform Network</Text>

            <View style={styles.rowItem}>
              <View style={[styles.rowIconCircle, { backgroundColor: colors.successLight }]}>
                <Ionicons name="people-outline" size={16} color={colors.success} />
              </View>
              <View style={styles.rowTextCol}>
                <View style={styles.liveBadgeRow}>
                  <Text style={styles.rowTitle} numberOfLines={1}>Total Registered Users</Text>
                  <View style={styles.livePill}>
                    <View style={styles.livePulseDot} />
                    <Text style={styles.livePillText}>LIVE</Text>
                  </View>
                </View>
                <Text style={styles.rowSub} numberOfLines={2}>
                  {liveUserCount !== null
                    ? `${liveUserCount.toLocaleString()} registered user${liveUserCount === 1 ? '' : 's'} on the platform.`
                    : 'Connecting to live platform counter...'}
                </Text>
              </View>
            </View>
          </GlassCard>

          {/* Security & Data Isolation Card */}
          <GlassCard contentStyle={styles.sectionCard}>
            <Text style={styles.sectionHeader} numberOfLines={1}>Privacy & Security</Text>

            <View style={styles.rowItem}>
              <View style={styles.rowIconCircle}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.textPrimary} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>Private Data Isolation</Text>
                <Text style={styles.rowSub} numberOfLines={2}>
                  Your events are encrypted and strictly bound to your authenticated account.
                </Text>
              </View>
            </View>

            <View style={styles.rowItem}>
              <View style={styles.rowIconCircle}>
                <Ionicons name="cloud-done-outline" size={16} color={colors.textPrimary} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>Active Cloud Sync</Text>
                <Text style={styles.rowSub} numberOfLines={2}>
                  {events.length} event(s) synced in your private cloud schedule.
                </Text>
              </View>
            </View>

            <View style={styles.rowItem}>
              <View style={styles.rowIconCircle}>
                <Ionicons name="notifications-outline" size={16} color={colors.textPrimary} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>On-Device Reminders</Text>
                <Text style={styles.rowSub} numberOfLines={2}>
                  Local notifications scheduled 24 hours prior to registration deadlines and event dates.
                </Text>
              </View>
            </View>
          </GlassCard>

          {/* Session Management & Sign Out */}
          <GlassCard contentStyle={styles.sectionCard}>
            <Text style={styles.sectionHeader} numberOfLines={1}>Session Management</Text>

            <GlassButton
              title="Sign Out from Vanko"
              variant="danger"
              onPress={handleSignOut}
              icon={<Ionicons name="log-out-outline" size={16} color="#FFFFFF" />}
              style={styles.signOutBtn}
            />
          </GlassCard>

          <Text style={styles.versionFooter} numberOfLines={1}>
            Vanko v1.0.0
          </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  layoutWrapper: {
    flex: 1,
    flexDirection: 'row',
  },
  container: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 40,
    gap: 14,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  avatarLarge: {
    width: 52,
    height: 52,
    borderRadius: radii.card,
    backgroundColor: colors.canvasSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  profileInfoCol: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 22,
  },
  userEmail: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  accountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.successLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  accountBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.success,
  },
  sectionCard: {
    padding: 16,
    gap: 14,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  rowIconCircle: {
    width: 34,
    height: 34,
    borderRadius: radii.control - 4,
    backgroundColor: colors.canvasSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  rowTextCol: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  liveBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    gap: 4,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  livePillText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.success,
    letterSpacing: 0.5,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 18,
  },
  rowSub: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  signOutBtn: {
    minHeight: 46,
    marginTop: 4,
  },
  versionFooter: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: '500',
    paddingVertical: 12,
  },
});
