export const colors = {
  // District-style minimal white glassmorphism palette
  canvas: '#FAFAFA',
  canvasSubtle: '#F4F4F5',
  glassFill: 'rgba(255, 255, 255, 0.82)',
  glassFillTranslucent: 'rgba(255, 255, 255, 0.65)',
  glassBorder: 'rgba(0, 0, 0, 0.06)',
  glassBorderHighlight: 'rgba(255, 255, 255, 0.95)',
  
  // Typography
  textPrimary: '#18181B',
  textSecondary: '#71717A',
  textTertiary: '#A1A1AA',
  
  // Single restrained dark neutral accent
  primary: '#18181B',
  primaryMuted: '#27272A',
  primaryLight: '#F4F4F5',
  
  // Subtle state indicators (calm, desaturated)
  danger: '#DC2626',
  dangerLight: '#FEF2F2',
  warning: '#D97706',
  warningLight: '#FFFBEB',
  success: '#16A34A',
  successLight: '#F0FDF4',
};

export const radii = {
  card: 18,
  control: 14,
  pill: 9999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const shadows = {
  subtle: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  overlay: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 5,
  },
};
