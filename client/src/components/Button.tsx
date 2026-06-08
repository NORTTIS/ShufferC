import React from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, radii, space } from '../theme';

type Variant = 'primary' | 'ghost' | 'danger';

export function Button({
  label, onPress, variant = 'primary', busy = false, disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  busy?: boolean;
  disabled?: boolean;
}) {
  const isDisabled = disabled || busy;
  const labelColor = variant === 'primary' ? colors.bgBase : colors.inkPrimary;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'ghost' && styles.ghost,
        variant === 'danger' && styles.danger,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      {busy
        ? <ActivityIndicator color={labelColor} />
        : <Text style={[styles.label, { color: labelColor }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radii.md, paddingVertical: space.md, paddingHorizontal: space.lg, alignItems: 'center', borderWidth: 1 },
  primary: { backgroundColor: colors.gold, borderColor: colors.gold },
  ghost: { backgroundColor: 'transparent', borderColor: colors.goldDim },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
  label: { fontSize: 16, fontWeight: '600' },
});
