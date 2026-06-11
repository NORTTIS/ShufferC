import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, space, type } from '../theme';

/** Small handwritten action ("use", "unequip", "buy") for ledger rows and headers. */
export function InkButton({
  label, onPress, disabled = false, tone = 'ink', busy = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'ink' | 'red';
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed, (disabled || busy) && styles.disabled]}
    >
      <Text style={[styles.label, tone === 'red' && styles.red]}>{busy ? '…' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingVertical: space.xs, paddingHorizontal: space.sm },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
  label: { ...type.handSmall, color: colors.inkAccent, textDecorationLine: 'underline' },
  red: { color: colors.inkRed },
});
