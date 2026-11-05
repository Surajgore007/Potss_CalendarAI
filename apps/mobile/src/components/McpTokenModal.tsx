import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { colors, radii, shadows } from '../theme/tokens';

interface McpTokenModalProps {
  visible: boolean;
  token: string | null;
  onClose: () => void;
}

type McpTab = 'oauth' | 'direct';

export const McpTokenModal: React.FC<McpTokenModalProps> = ({
  visible,
  token,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<McpTab>('oauth');
  const [copiedOauthUrl, setCopiedOauthUrl] = useState(false);
  const [copiedKeyUrl, setCopiedKeyUrl] = useState(false);
  const [copiedRawKey, setCopiedRawKey] = useState(false);

  const oauthMcpUrl = 'https://vanko-api.vanko-app.workers.dev/api/mcp';
  const isPermanent = Boolean(token && token.startsWith('vnk_live_'));
  const fullMcpUrl = token
    ? (isPermanent
        ? `https://vanko-api.vanko-app.workers.dev/api/mcp?key=${token}`
        : `https://vanko-api.vanko-app.workers.dev/api/mcp?token=${token}`)
    : oauthMcpUrl;

  const handleCopyOauth = async () => {
    try {
      await Clipboard.setStringAsync(oauthMcpUrl);
      setCopiedOauthUrl(true);
      setTimeout(() => setCopiedOauthUrl(false), 2000);
    } catch {}
  };

  const handleCopyKeyUrl = async () => {
    if (!token) return;
    try {
      await Clipboard.setStringAsync(fullMcpUrl);
      setCopiedKeyUrl(true);
      setTimeout(() => setCopiedKeyUrl(false), 2000);
    } catch {}
  };

  const handleCopyRawKey = async () => {
    if (!token) return;
    try {
      await Clipboard.setStringAsync(token);
      setCopiedRawKey(true);
      setTimeout(() => setCopiedRawKey(false), 2000);
    } catch {}
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIconCircle}>
              <Ionicons name="sparkles" size={17} color={colors.textPrimary} />
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title} numberOfLines={1}>AI Assistants & MCP</Text>
              <Text style={styles.subtitle} numberOfLines={1}>Connect ChatGPT, Claude & Cursor</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Segmented Control Tabs */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'oauth' && styles.tabBtnActive]}
              onPress={() => setActiveTab('oauth')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={14}
                color={activeTab === 'oauth' ? colors.textPrimary : colors.textSecondary}
              />
              <Text style={[styles.tabBtnText, activeTab === 'oauth' && styles.tabBtnTextActive]} numberOfLines={1}>
                ChatGPT (OAuth)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'direct' && styles.tabBtnActive]}
              onPress={() => setActiveTab('direct')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="key-outline"
                size={14}
                color={activeTab === 'direct' ? colors.textPrimary : colors.textSecondary}
              />
              <Text style={[styles.tabBtnText, activeTab === 'direct' && styles.tabBtnTextActive]} numberOfLines={1}>
                Claude & Direct Key
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {activeTab === 'oauth' ? (
              /* TAB 1: OAuth 2.1 for ChatGPT */
              <View style={styles.tabContent}>
                {/* Clean URL Card */}
                <View style={styles.cardBox}>
                  <Text style={styles.boxLabel}>MCP SERVER URL</Text>
                  <View style={styles.codeSnippet}>
                    <Text style={styles.codeText} numberOfLines={1} ellipsizeMode="middle">
                      {oauthMcpUrl}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.copyActionBtn, copiedOauthUrl && styles.copyActionBtnDone]}
                    onPress={handleCopyOauth}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={copiedOauthUrl ? 'checkmark' : 'copy-outline'}
                      size={14}
                      color={copiedOauthUrl ? '#16A34A' : colors.textPrimary}
                    />
                    <Text style={[styles.copyActionBtnText, copiedOauthUrl && styles.copyActionBtnTextDone]}>
                      {copiedOauthUrl ? 'Copied Server URL' : 'Copy Server URL'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Steps List */}
                <View style={styles.stepsCard}>
                  <Text style={styles.stepsCardTitle}>QUICK SETUP IN CHATGPT</Text>

                  <View style={styles.stepRow}>
                    <View style={styles.stepBadge}><Text style={styles.stepBadgeNum}>1</Text></View>
                    <Text style={styles.stepText}>
                      In ChatGPT, go to <Text style={styles.bold}>Settings → Add MCP Server</Text>.
                    </Text>
                  </View>

                  <View style={styles.stepRow}>
                    <View style={styles.stepBadge}><Text style={styles.stepBadgeNum}>2</Text></View>
                    <Text style={styles.stepText}>
                      Set Name to <Text style={styles.bold}>Vanko</Text> and paste the Server URL above.
                    </Text>
                  </View>

                  <View style={styles.stepRow}>
                    <View style={styles.stepBadge}><Text style={styles.stepBadgeNum}>3</Text></View>
                    <Text style={styles.stepText}>
                      Choose <Text style={styles.bold}>OAuth</Text> authentication, then log in to authorize.
                    </Text>
                  </View>
                </View>

                <View style={styles.securityNote}>
                  <Ionicons name="shield-checkmark-outline" size={13} color="#16A34A" />
                  <Text style={styles.securityNoteText}>
                    Zero-Trust: ChatGPT only gets scoped access to read & update your calendar.
                  </Text>
                </View>
              </View>
            ) : (
              /* TAB 2: Direct Permanent Key */
              <View style={styles.tabContent}>
                {/* Permanent Key URL */}
                <View style={styles.cardBox}>
                  <View style={styles.labelRow}>
                    <Text style={styles.boxLabel}>DIRECT INTEGRATION URL</Text>
                    <View style={styles.permanentPill}>
                      <Text style={styles.permanentPillText}>PERMANENT</Text>
                    </View>
                  </View>
                  <View style={styles.codeSnippet}>
                    <Text style={styles.codeText} numberOfLines={1} ellipsizeMode="middle">
                      {fullMcpUrl}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.copyActionBtn, copiedKeyUrl && styles.copyActionBtnDone]}
                    onPress={handleCopyKeyUrl}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={copiedKeyUrl ? 'checkmark' : 'copy-outline'}
                      size={14}
                      color={copiedKeyUrl ? '#16A34A' : colors.textPrimary}
                    />
                    <Text style={[styles.copyActionBtnText, copiedKeyUrl && styles.copyActionBtnTextDone]}>
                      {copiedKeyUrl ? 'Copied Full Key URL' : 'Copy Full Key URL'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Raw Secret Key */}
                <View style={styles.cardBox}>
                  <Text style={styles.boxLabel}>PERSONAL ACCESS KEY</Text>
                  <View style={styles.codeSnippet}>
                    <Text style={styles.codeText} numberOfLines={1} ellipsizeMode="middle">
                      {token ? token : 'Loading permanent key...'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.copyActionBtn, copiedRawKey && styles.copyActionBtnDone]}
                    onPress={handleCopyRawKey}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={copiedRawKey ? 'checkmark' : 'copy-outline'}
                      size={14}
                      color={copiedRawKey ? '#16A34A' : colors.textPrimary}
                    />
                    <Text style={[styles.copyActionBtnText, copiedRawKey && styles.copyActionBtnTextDone]}>
                      {copiedRawKey ? 'Copied Key' : 'Copy Key Only'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.stepsCard}>
                  <Text style={styles.stepsCardTitle}>BEST FOR DESKTOP TOOLS</Text>
                  <Text style={styles.directSubText}>
                    Paste the direct URL into <Text style={styles.bold}>Claude Desktop (config.json)</Text>, <Text style={styles.bold}>Cursor</Text>, or <Text style={styles.bold}>Cline</Text> with No Authentication required.
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.doneBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    overflow: 'hidden',
    ...shadows.overlay,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F5',
  },
  headerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.canvasSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    padding: 6,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#F4F4F5',
    borderRadius: 12,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    ...shadows.subtle,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabBtnTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  tabContent: {
    gap: 12,
    paddingBottom: 8,
  },
  cardBox: {
    backgroundColor: '#FAFAFA',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    padding: 12,
    gap: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  boxLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textTertiary,
    letterSpacing: 0.8,
  },
  permanentPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  permanentPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#16A34A',
    letterSpacing: 0.5,
  },
  codeSnippet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  codeText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: colors.textPrimary,
  },
  copyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 8,
    paddingVertical: 7,
  },
  copyActionBtnDone: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  copyActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  copyActionBtnTextDone: {
    color: '#16A34A',
    fontWeight: '700',
  },
  stepsCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    padding: 14,
    gap: 10,
  },
  stepsCardTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textTertiary,
    letterSpacing: 0.8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  stepBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E4E4E7',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  stepBadgeNum: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  stepText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  directSubText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  bold: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  securityNoteText: {
    flex: 1,
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
    backgroundColor: '#FFFFFF',
  },
  doneBtn: {
    backgroundColor: colors.textPrimary,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
