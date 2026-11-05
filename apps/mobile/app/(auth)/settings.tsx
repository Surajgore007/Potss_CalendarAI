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
  Linking,
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
import Constants from 'expo-constants';
import { FeedbackModal } from '../../src/components/FeedbackModal';
import { AdminFeedbackModal } from '../../src/components/AdminFeedbackModal';
import { DeleteAccountModal } from '../../src/components/DeleteAccountModal';
import { ManageConsentsModal } from '../../src/components/ManageConsentsModal';
import { MyDataModal } from '../../src/components/MyDataModal';
import { CampusAffiliationModal } from '../../src/components/CampusAffiliationModal';
import { colors, radii, shadows } from '../../src/theme/tokens';
import { COLLEGE_SIES_GST, COLLEGE_OTHER } from '@eventpulse/shared';
import { AlarmReliabilityModal } from '../../src/components/AlarmReliabilityModal';
import { McpTokenModal } from '../../src/components/McpTokenModal';
import {
  isIgnoringBatteryOptimizations,
  canScheduleExactAlarms,
  openBatteryOptimizationSettings,
  openAlarmChannelSettings,
} from '../../src/services/alarmService';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOutUser, isAdmin, refreshPermissions, getIdToken } = useAuth();
  const { events } = useEvents();
  const [liveUserCount, setLiveUserCount] = useState<number | null>(null);
  const [isRefreshingRole, setIsRefreshingRole] = useState(false);

  // DPDP, MCP & Feedback Modal States
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showAdminFeedbackModal, setShowAdminFeedbackModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showConsentsModal, setShowConsentsModal] = useState(false);
  const [showMyDataModal, setShowMyDataModal] = useState(false);
  const [showCollegeModal, setShowCollegeModal] = useState(false);
  const [showReliabilityModal, setShowReliabilityModal] = useState(false);
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [mcpToken, setMcpToken] = useState<string | null>(null);
  const [isFetchingToken, setIsFetchingToken] = useState(false);
  const [isBatteryIgnored, setIsBatteryIgnored] = useState<boolean | null>(null);
  const [hasExactAlarms, setHasExactAlarms] = useState<boolean | null>(null);

  const handleOpenMcpModal = async () => {
    setIsFetchingToken(true);
    try {
      const token = await getIdToken(true);
      if (!token) {
        Alert.alert('Authentication Required', 'Please sign in to generate your AI assistant connection URL.');
        return;
      }

      // Request permanent non-expiring personal key from Cloudflare Worker
      let keyToDisplay = token;
      try {
        const resp = await fetch('https://vanko-api.vanko-app.workers.dev/api/mcp/permanent-key', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (resp.ok) {
          const data = (await resp.json()) as any;
          if (data && data.key) {
            keyToDisplay = data.key;
          }
        }
      } catch (err) {
        console.warn('[MCP] Permanent key generation network fallback:', err);
      }

      setMcpToken(keyToDisplay);
      setShowMcpModal(true);
    } catch {
      Alert.alert('Error', 'Failed to retrieve access token. Check network.');
    } finally {
      setIsFetchingToken(false);
    }
  };

  useEffect(() => {
    if (Platform.OS === 'android') {
      isIgnoringBatteryOptimizations().then(setIsBatteryIgnored).catch(() => {});
      canScheduleExactAlarms().then(setHasExactAlarms).catch(() => {});
    }
  }, []);

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
                    color={isAdmin ? colors.danger : colors.textSecondary}
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
                    <Text style={styles.refreshBadgeText} numberOfLines={1}>Sync Permissions</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </GlassCard>

          {/* SECTION 1: ACCOUNT & PREFERENCES */}
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionGroupTitle}>Account & Preferences</Text>
            <GlassCard contentStyle={styles.groupedCardContent}>
              {/* Row 1: Campus Affiliation */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => setShowCollegeModal(true)}
                activeOpacity={0.7}
              >
                <View style={styles.rowIconCircle}>
                  <Ionicons name="school-outline" size={17} color={colors.textPrimary} />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitle} numberOfLines={1}>Campus Affiliation</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {user?.college === COLLEGE_OTHER ? 'General Student' : 'SIES GST Member'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} />
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              {/* Row 2: My Data & Export */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => setShowMyDataModal(true)}
                activeOpacity={0.7}
              >
                <View style={styles.rowIconCircle}>
                  <Ionicons name="folder-open-outline" size={17} color={colors.textPrimary} />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitle} numberOfLines={1}>My Data & Export</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>View profile, personal events & export</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} />
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              {/* Row 3: Manage Consents */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => setShowConsentsModal(true)}
                activeOpacity={0.7}
              >
                <View style={styles.rowIconCircle}>
                  <Ionicons name="shield-checkmark-outline" size={17} color={colors.textPrimary} />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitle} numberOfLines={1}>Privacy & Consents</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>Push reminders & data processing choices</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} />
              </TouchableOpacity>
            </GlassCard>
          </View>

          {/* SECTION 2: INTEGRATIONS & RELIABILITY */}
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionGroupTitle}>Integrations & Reliability</Text>
            <GlassCard contentStyle={styles.groupedCardContent}>
              {/* Row 1: AI Assistant (MCP) */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={handleOpenMcpModal}
                disabled={isFetchingToken}
                activeOpacity={0.7}
              >
                <View style={styles.rowIconCircle}>
                  {isFetchingToken ? (
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  ) : (
                    <Ionicons name="sparkles-outline" size={17} color={colors.textPrimary} />
                  )}
                </View>
                <View style={styles.rowTextCol}>
                  <View style={styles.rowTitleBadgeWrap}>
                    <Text style={styles.rowTitle} numberOfLines={1}>Connect AI Assistants</Text>
                    <View style={styles.mcpPill}>
                      <Text style={styles.mcpPillText}>MCP</Text>
                    </View>
                  </View>
                  <Text style={styles.rowSub} numberOfLines={1}>ChatGPT (OAuth), Claude Desktop & Cursor</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} />
              </TouchableOpacity>

              {Platform.OS === 'android' && (
                <>
                  <View style={styles.rowDivider} />

                  {/* Row 2: Alarm Reliability Guide */}
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={() => setShowReliabilityModal(true)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rowIconCircle}>
                      <Ionicons name="shield-checkmark-outline" size={17} color={colors.textPrimary} />
                    </View>
                    <View style={styles.rowTextCol}>
                      <View style={styles.rowTitleBadgeWrap}>
                        <Text style={styles.rowTitle} numberOfLines={1}>Alarm Reliability Guide</Text>
                        <View
                          style={[
                            styles.statusPill,
                            isBatteryIgnored ? styles.statusPillOptimal : styles.statusPillWarning,
                          ]}
                        >
                          <Ionicons
                            name={isBatteryIgnored ? 'checkmark-circle' : 'alert-circle'}
                            size={10}
                            color={isBatteryIgnored ? '#16A34A' : '#D97706'}
                          />
                          <Text
                            style={[
                              styles.statusPillText,
                              isBatteryIgnored ? styles.statusPillTextOptimal : styles.statusPillTextWarning,
                            ]}
                            numberOfLines={1}
                          >
                            {isBatteryIgnored ? 'Optimal' : 'Needs Setup'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.rowSub} numberOfLines={1}>Xiaomi, Samsung, Oppo background limits</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} />
                  </TouchableOpacity>

                  <View style={styles.rowDivider} />

                  {/* Row 3: Battery Saver Settings */}
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={openBatteryOptimizationSettings}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rowIconCircle}>
                      <Ionicons name="battery-charging-outline" size={17} color={colors.textPrimary} />
                    </View>
                    <View style={styles.rowTextCol}>
                      <Text style={styles.rowTitle} numberOfLines={1}>Battery Saver Settings</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {isBatteryIgnored
                          ? 'Vanko is exempt from battery saver sleep limits'
                          : 'Allow unrestricted background execution'}
                      </Text>
                    </View>
                    <Ionicons name="open-outline" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>

                  <View style={styles.rowDivider} />

                  {/* Row 4: Alarm Audio Channel */}
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={openAlarmChannelSettings}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rowIconCircle}>
                      <Ionicons name="volume-high-outline" size={17} color={colors.textPrimary} />
                    </View>
                    <View style={styles.rowTextCol}>
                      <Text style={styles.rowTitle} numberOfLines={1}>Alarm Audio Channel</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>Ringtone, vibration & DND override settings</Text>
                    </View>
                    <Ionicons name="open-outline" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                </>
              )}
            </GlassCard>
          </View>

          {/* SECTION 3: COMMUNITY & SUPPORT */}
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionGroupTitle}>Community & Support</Text>
            <GlassCard contentStyle={styles.groupedCardContent}>
              {/* Row 1: Platform Network */}
              <View style={styles.menuRow}>
                <View style={styles.rowIconCircle}>
                  <Ionicons name="people-outline" size={17} color={colors.textPrimary} />
                </View>
                <View style={styles.rowTextCol}>
                  <View style={styles.rowTitleBadgeWrap}>
                    <Text style={styles.rowTitle} numberOfLines={1}>Platform Network</Text>
                    <View style={styles.livePill}>
                      <View style={styles.livePulseDot} />
                      <Text style={styles.livePillText}>LIVE</Text>
                    </View>
                  </View>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {liveUserCount !== null
                      ? `${liveUserCount.toLocaleString()} registered student${liveUserCount === 1 ? '' : 's'} on Vanko`
                      : 'Connecting to live platform counter...'}
                  </Text>
                </View>
              </View>

              <View style={styles.rowDivider} />

              {/* Row 2: Help & Feedback */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => setShowFeedbackModal(true)}
                activeOpacity={0.7}
              >
                <View style={styles.rowIconCircle}>
                  <Ionicons name="chatbubbles-outline" size={17} color={colors.textPrimary} />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitle} numberOfLines={1}>Send Feedback / Suggestion</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>Report bugs or suggest features directly to the team</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} />
              </TouchableOpacity>

              {isAdmin && (
                <>
                  <View style={styles.rowDivider} />

                  {/* Row 3: Admin Review Feedback */}
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={() => setShowAdminFeedbackModal(true)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.rowIconCircle, { backgroundColor: colors.dangerLight, borderColor: 'rgba(220, 38, 38, 0.2)' }]}>
                      <Ionicons name="shield-checkmark-outline" size={17} color={colors.danger} />
                    </View>
                    <View style={styles.rowTextCol}>
                      <View style={styles.rowTitleBadgeWrap}>
                        <Text style={styles.rowTitle} numberOfLines={1}>Admin: Review Feedback</Text>
                        <View style={styles.adminTag}>
                          <Text style={styles.adminTagText}>ADMIN</Text>
                        </View>
                      </View>
                      <Text style={styles.rowSub} numberOfLines={1}>Read user bug reports & send private replies</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} />
                  </TouchableOpacity>
                </>
              )}

              <View style={styles.rowDivider} />

              {/* Row 4: Privacy Policy */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={handleOpenPrivacyPolicy}
                activeOpacity={0.7}
              >
                <View style={styles.rowIconCircle}>
                  <Ionicons name="document-text-outline" size={17} color={colors.textPrimary} />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitle} numberOfLines={1}>Privacy Policy</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>Data governance and protection practices</Text>
                </View>
                <Ionicons name="open-outline" size={16} color={colors.textTertiary} />
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              {/* Row 5: Support Desk */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => Linking.openURL('mailto:supportvanko@gmail.com').catch(() => {})}
                activeOpacity={0.7}
              >
                <View style={styles.rowIconCircle}>
                  <Ionicons name="mail-outline" size={17} color={colors.textPrimary} />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitle} numberOfLines={1}>Support & Grievances</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>supportvanko@gmail.com</Text>
                </View>
                <Ionicons name="open-outline" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </GlassCard>
          </View>

          {/* SECTION 4: ACCOUNT ACTIONS */}
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionGroupTitle}>Account Actions</Text>
            <GlassCard contentStyle={styles.groupedCardContent}>
              {/* Row 1: Sign Out */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={handleSignOut}
                activeOpacity={0.7}
              >
                <View style={styles.rowIconCircle}>
                  <Ionicons name="log-out-outline" size={17} color={colors.textPrimary} />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitle} numberOfLines={1}>Sign Out</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>End your session on this device</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} />
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              {/* Row 2: Delete Account */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => setShowDeleteModal(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.rowIconCircle, { backgroundColor: colors.dangerLight, borderColor: 'rgba(220, 38, 38, 0.2)' }]}>
                  <Ionicons name="trash-outline" size={17} color={colors.danger} />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={[styles.rowTitle, { color: colors.danger }]} numberOfLines={1}>Delete Account</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>Permanently erase all personal data & events</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.danger} />
              </TouchableOpacity>
            </GlassCard>
          </View>

          <Text style={styles.versionFooter} numberOfLines={1}>
            Vanko v{Constants.expoConfig?.version ?? '1.0.3'}
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
        <CampusAffiliationModal
          visible={showCollegeModal}
          onClose={() => setShowCollegeModal(false)}
          currentCollege={user?.college}
          isEditing
        />
        <AlarmReliabilityModal
          visible={showReliabilityModal}
          onClose={() => setShowReliabilityModal(false)}
        />
        <McpTokenModal
          visible={showMcpModal}
          token={mcpToken}
          onClose={() => setShowMcpModal(false)}
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
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.2)',
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
    color: colors.textSecondary,
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
  sectionGroup: {
    gap: 6,
  },
  sectionGroupTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginLeft: 4,
  },
  groupedCardContent: {
    paddingVertical: 2,
    paddingHorizontal: 16,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.glassBorder,
    marginLeft: 48,
  },
  rowTitleBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mcpPill: {
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: radii.pill,
  },
  mcpPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.4,
  },
  campusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: radii.pill,
    flexShrink: 0,
  },
  campusPillSies: {
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  campusPillOther: {
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  campusPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  campusPillTextSies: {
    color: colors.textPrimary,
  },
  campusPillTextOther: {
    color: colors.textSecondary,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexShrink: 0,
  },
  statusPillOptimal: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  statusPillWarning: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusPillTextOptimal: {
    color: '#16A34A',
  },
  statusPillTextWarning: {
    color: '#D97706',
  },
  rowIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.canvasSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    flexShrink: 0,
  },
  rowTextCol: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    gap: 4,
    flexShrink: 0,
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
  adminTag: {
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.pill,
  },
  adminTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.danger,
    letterSpacing: 0.3,
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
  versionFooter: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: '500',
    paddingVertical: 12,
  },
});
