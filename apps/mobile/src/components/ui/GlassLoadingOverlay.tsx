import React from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radii, shadows } from '../../theme/tokens';

export interface GlassLoadingOverlayProps {
  visible: boolean;
  message?: string;
}

export const GlassLoadingOverlay: React.FC<GlassLoadingOverlayProps> = ({
  visible,
  message = "We're getting things ready...",
}) => {
  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {Platform.OS !== 'web' && (
          <BlurView intensity={35} tint="light" style={StyleSheet.absoluteFill} />
        )}
        <View style={styles.card}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.message} numberOfLines={2}>
            {message}
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(250, 250, 250, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.card,
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    maxWidth: 320,
    width: '100%',
    ...shadows.overlay,
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
