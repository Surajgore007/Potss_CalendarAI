import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
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
import * as WebBrowser from 'expo-web-browser';
import { FeedbackModal } from '../../src/components/FeedbackModal';
import { AdminFeedbackModal } from '../../src/components/AdminFeedbackModal';
import { DeleteAccountModal } from '../../src/components/DeleteAccountModal';
import { ManageConsentsModal } from '../../src/components/ManageConsentsModal';
import { MyDataModal } from '../../src/components/MyDataModal';
import { colors, radii, shadows } from '../../src/theme/tokens';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOutUser, isAdmin, refreshPermissions } = useAuth();
  const { events } = useEvents();
  const [liveUserCount, setLiveUserCount] = useState<number | null>(null);
  const [isRefreshingRole, setIsRefreshingRole] = useState(false);

  // DPDP & Feedback Modal States
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showAdminFeedbackModal, setShowAdminFeedbackModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showConsentsModal, setShowConsentsModal] = useState(false);
  const [showMyDataModal, setShowMyDataModal] = useState(false);

  // Subscribe to real-time live platform user count
  useEffect(() => {
    const unsubscribe = subscribeToLiveUserCount((count) => {
      setLiveUserCount(count);
    });
    return () => unsubscribe();
  }, []);

  const handleRefreshPermissions = async () => {
    setIsRefreshingRole(true);
    try {
      const isNowAdmin = await refreshPermissions();
      Alert.alert(
        'Permissions Refreshed',
        isNowAdmin
          ? 'Administrator privileges active! Custom claims verified.'
          : `Permissions up-to-date (Role: ${user?.role || 'student'}).`
      );
    } catch {
      Alert.alert('Error', 'Failed to refresh permissions. Check network connection.');
    } finally {
      setIsRefreshingRole(false);
    }
  };

  const handleOpenPrivacyPolicy = () => {
    WebBrowser.openBrowserAsync('https://vanko-api.vanko-app.workers.dev/privacy-policy');
  };

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
              <View style={styles.badgeRowContainer}>
                <View style={isAdmin ? styles.adminBadge : styles.accountBadge}>
                  <Ionicons
                    name={isAdmin ? 'shield-checkmark' : 'school-outline'}
                    size={11}
                    color={isAdmin ? colors.danger : colors.primary}
                  />
                  <Text style={isAdmin ? styles.adminBadgeText : styles.roleBadgeText} numberOfLines={1}>
                    {isAdmin ? 'Admin' : 'Student'}
                  </Text>
                </View>

                {isAdmin && (
                  <TouchableOpacity
                    style={styles.refreshBadgeBtn}
                    onPress={handleRefreshPermissions}
                    disabled={isRefreshingRole}
                    activeOpacity={0.7}
                  >
                    {isRefreshingRole ? (
                      <ActivityIndicator size="small" color={colors.textSecondary} style={{ transform: [{ scale: 0.7 }] }} />
                    ) : (
                      <Ionicons name="sync-outline" size={12} color={colors.textSecondary} />
                    )}
                    <Text style={styles.refreshBadgeText}>Sync Permissions</Text>
                  </TouchableOpacity>
                )}
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

          {/* Help & Feedback Channel (Admin-Only) */}
          <GlassCard contentStyle={styles.sectionCard}>
            <Text style={styles.sectionHeader} numberOfLines={1}>Help & Feedback</Text>

            <TouchableOpacity
              style={styles.touchableRow}
              onPress={() => setShowFeedbackModal(true)}
              activeOpacity={0.7}
            >
              <View style={[styles.rowIconCircle, { backgroundColor: 'rgba(99, 102, 241, 0.12)' }]}>
                <Ionicons name="chatbubbles-outline" size={16} color={colors.primary} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>Send Feedback / Suggestion</Text>
                <Text style={styles.rowSub} numberOfLines={2}>
                  Report bugs or suggest features directly to the Vanko team.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>

            {isAdmin && (
              <TouchableOpacity
                style={[styles.touchableRow, { marginTop: 4 }]}
                onPress={() => setShowAdminFeedbackModal(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.rowIconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={colors.danger} />
                </View>
                <View style={styles.rowTextCol}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>Admin: Review Feedback</Text>
                    <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: colors.danger }}>ADMIN</Text>
                    </View>
                  </View>
                  <Text style={styles.rowSub} numberOfLines={2}>
                    Read user bug reports, suggestions, and send private replies.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </GlassCard>

          {/* Personal Data & Rights (DPDP Act 2023) */}
          <GlassCard contentStyle={styles.sectionCard}>
            <Text style={styles.sectionHeader} numberOfLines={1}>Personal Data & Privacy Rights (DPDP)</Text>

            <TouchableOpacity
              style={styles.touchableRow}
              onPress={() => setShowMyDataModal(true)}
              activeOpacity={0.7}
            >
              <View style={styles.rowIconCircle}>
                <Ionicons name="folder-open-outline" size={16} color={colors.textPrimary} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>My Data & Export</Text>
                <Text style={styles.rowSub} numberOfLines={2}>
                  View all personal data stored, edit profile, or export JSON/iCalendar.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.touchableRow}
              onPress={() => setShowConsentsModal(true)}
              activeOpacity={0.7}
            >
              <View style={styles.rowIconCircle}>
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.textPrimary} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>Manage Data Consents</Text>
                <Text style={styles.rowSub} numberOfLines={2}>
                  Review active processing purposes or withdraw consent.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.touchableRow}
              onPress={handleOpenPrivacyPolicy}
              activeOpacity={0.7}
            >
              <View style={styles.rowIconCircle}>
                <Ionicons name="document-text-outline" size={16} color={colors.textPrimary} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>Privacy Policy</Text>
                <Text style={styles.rowSub} numberOfLines={2}>
                  Read our DPDP Act 2023 & Google Play compliant privacy policy.
                </Text>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            {/* Privacy & Governance Desk */}
            <View style={styles.grievanceCard}>
              <View style={styles.grievanceHeader}>
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
                <Text style={styles.grievanceTitle}>Privacy & Data Protection</Text>
              </View>
              <Text style={styles.grievanceText}>
                Data Fiduciary: <Text style={styles.boldText}>Vanko</Text>{'\n'}
                Support Desk: <Text style={styles.boldText}>Privacy & Data Protection</Text>{'\n'}
                Contact: <Text style={styles.boldText}>Available on official website & in-app feedback</Text>
              </Text>
            </View>
          </GlassCard>

          {/* Account Management & Deletion */}
          <GlassCard contentStyle={styles.sectionCard}>
            <Text style={styles.sectionHeader} numberOfLines={1}>Account Management</Text>

            <GlassButton
              title="Sign Out from Vanko"
              variant="glass"
              onPress={handleSignOut}
              icon={<Ionicons name="log-out-outline" size={16} color={colors.textPrimary} />}
              style={styles.signOutBtn}
            />

            <GlassButton
              title="Delete My Account & Data"
              variant="danger"
              onPress={() => setShowDeleteModal(true)}
              icon={<Ionicons name="trash-outline" size={16} color="#FFFFFF" />}
              style={styles.deleteBtn}
            />
          </GlassCard>

          <Text style={styles.versionFooter} numberOfLines={1}>
            Vanko v1.0.0
          </Text>
        </ScrollView>

        {/* DPDP & Feedback Modals */}
        <FeedbackModal
          visible={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
        />
        <AdminFeedbackModal
          visible={showAdminFeedbackModal}
          onClose={() => setShowAdminFeedbackModal(false)}
        />
        <DeleteAccountModal
          visible={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
        />
        <ManageConsentsModal
          visible={showConsentsModal}
          onClose={() => setShowConsentsModal(false)}
          onOpenDeleteAccount={() => setShowDeleteModal(true)}
        />
        <MyDataModal
          visible={showMyDataModal}
          onClose={() => setShowMyDataModal(false)}
        />
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
    paddingBottom: 110,
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
  badgeRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  accountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.danger,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  refreshBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  refreshBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
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
  deleteBtn: {
    minHeight: 46,
    marginTop: 6,
  },
  touchableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  grievanceCard: {
    padding: 12,
    borderRadius: radii.control,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
    gap: 6,
    marginTop: 6,
  },
  grievanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  grievanceTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  grievanceText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  boldText: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  linkUnderline: {
    color: colors.primary,
    fontWeight: '600',
  },
  versionFooter: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: '500',
    paddingVertical: 12,
  },
});
