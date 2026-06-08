import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors, type } from '../theme';

export function Prose({ children }: { children: React.ReactNode }) {
  return <Text style={styles.prose}>{children}</Text>;
}

const styles = StyleSheet.create({
  prose: { ...type.body, color: colors.inkPrimary },
});
