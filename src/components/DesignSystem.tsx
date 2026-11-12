import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { colors, componentTokens, iconography, radius, shadows, spacing, typography, EzraIconName, EzraTextVariant } from '../theme';

export function EzraText({
  variant = 'body',
  color = colors.textPrimary,
  style,
  children,
  ...props
}: React.ComponentProps<typeof Text> & { variant?: EzraTextVariant; color?: string }) {
  return <Text {...props} style={[typography[variant], { color }, style]}>{children}</Text>;
}

type EzraButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function EzraButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  accessibilityLabel,
  style,
}: EzraButtonProps) {
  const palette = {
    primary: { backgroundColor: colors.accent, borderColor: colors.accentBright, color: colors.onAccent },
    secondary: { backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.textPrimary },
    ghost: { backgroundColor: 'transparent', borderColor: colors.borderSubtle, color: colors.textSecondary },
    danger: { backgroundColor: '#38252B', borderColor: '#63404B', color: colors.danger },
  }[variant];
  const dimensions = {
    sm: { minHeight: 40, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    md: { minHeight: 48, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
    lg: { minHeight: 56, paddingHorizontal: spacing.xxl, paddingVertical: spacing.lg },
  }[size];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          ...dimensions,
          borderRadius: radius.md,
          borderWidth: 1,
          borderCurve: 'continuous',
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.48 : pressed ? 0.84 : 1,
          transform: [{ scale: pressed && !disabled && !loading ? componentTokens.button.pressedScale : 1 }],
        },
        variant === 'primary' ? shadows.softGlow : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={palette.color} /> : (
        <Text style={{ color: palette.color, ...typography.button }}>{title}</Text>
      )}
    </Pressable>
  );
}

type EzraTextFieldProps = TextInputProps & {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export function EzraTextField({ label, error, containerStyle, style, onFocus, onBlur, editable = true, ...inputProps }: EzraTextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ width: '100%', gap: spacing.xs }, containerStyle]}>
      {label ? <EzraText variant="caption" color={colors.textSecondary}>{label}</EzraText> : null}
      <TextInput
        editable={editable}
        onFocus={event => { setFocused(true); onFocus?.(event); }}
        onBlur={event => { setFocused(false); onBlur?.(event); }}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accentBright}
        {...inputProps}
        style={[
          {
            width: '100%',
            minHeight: componentTokens.field.minHeight,
            borderRadius: radius.md,
            borderWidth: focused ? componentTokens.field.focusedBorderWidth : 1,
            borderColor: error ? colors.danger : focused ? colors.accentBright : colors.borderSubtle,
            opacity: editable ? 1 : 0.56,
            backgroundColor: colors.surfaceElevated,
            color: colors.textPrimary,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            ...typography.input,
          },
          style,
        ]}
      />
      {error ? <EzraText variant="caption" color={colors.danger}>{error}</EzraText> : null}
    </View>
  );
}

export function EzraCard({
  children,
  style,
  variant = 'surface',
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'surface' | 'raised' | 'glass';
}) {
  const backgroundColor = variant === 'glass' ? colors.surfaceGlass : variant === 'raised' ? colors.surfaceElevated : colors.surface;
  return (
    <View style={[
      {
        backgroundColor,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        padding: spacing.lg,
        borderCurve: 'continuous',
      },
      variant === 'raised' ? shadows.panel : null,
      style,
    ]}>
      {children}
    </View>
  );
}

export function EzraIcon({
  name,
  color = colors.textSecondary,
  size = iconography.opticalSize,
  accessibilityLabel,
}: {
  name: EzraIconName;
  color?: string;
  size?: number;
  accessibilityLabel?: string;
}) {
  return (
    <Text
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no'}
      style={{ color, fontSize: size, lineHeight: size + 5, fontWeight: '500', textAlign: 'center' }}
    >
      {iconography.glyphs[name]}
    </Text>
  );
}


/** Accessible 48dp icon action with the same quiet press language as EZRA buttons. */
export function EzraIconButton({
  name,
  onPress,
  accessibilityLabel,
  color = colors.textSecondary,
  size = iconography.opticalSize,
  disabled = false,
  style,
}: {
  name: EzraIconName;
  onPress: () => void;
  accessibilityLabel: string;
  color?: string;
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [{
        width: iconography.touchTarget,
        height: iconography.touchTarget,
        minWidth: iconography.touchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
        opacity: disabled ? 0.42 : pressed ? 0.78 : 1,
        transform: [{ scale: pressed && !disabled ? componentTokens.button.pressedScale : 1 }],
      }, style]}
    >
      <EzraIcon name={name} color={color} size={size} />
    </Pressable>
  );
}
