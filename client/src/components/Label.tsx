import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors, type } from '../theme';

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}
export function Caption({ children }: { children: React.ReactNode }) {
  return <Text style={styles.caption}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.inkMuted },
  caption: { ...type.caption, color: colors.inkMuted },
});
