import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { colors, radii, shadows } from '../../theme/tokens';

export interface GlassButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'glass' | 'primary' | 'danger';
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const GlassButton: React.FC<GlassButtonProps> = ({
  title,
  onPress,
  variant = 'glass',
  icon,
  loading = false,
  disabled = false,
  style,
  textStyle,
}) => {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.baseButton,
        isPrimary && styles.primaryButton,
        isDanger && styles.dangerButton,
        pressed && styles.pressedState,
        disabled && styles.disabledState,
        style,
      ]}
      android_ripple={{
        color: isPrimary ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.05)',
        borderless: false,
      }}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={isPrimary || isDanger ? '#FFFFFF' : colors.textPrimary}
        />
      ) : (
        <View style={styles.contentRow}>
          {icon && <View style={styles.iconWrap}>{icon}</View>}
          <Text
            style={[
              styles.baseText,
              isPrimary && styles.primaryText,
              isDanger && styles.dangerText,
              textStyle,
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  baseButton: {
    minHeight: 48,
    minWidth: 48,
    borderRadius: radii.control,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.subtle,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
  },
  dangerButton: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  pressedState: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  disabledState: {
    opacity: 0.45,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    marginRight: 8,
  },
  baseText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  dangerText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
