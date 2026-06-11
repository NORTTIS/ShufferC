import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { colors, space } from '../theme';

/** A parchment sheet. tone="note" renders it as an enlarged sticky note (ledger screens). */
export function BookPage({
  children, tone = 'page', style,
}: {
  children: React.ReactNode;
  tone?: 'page' | 'note';
  style?: ViewStyle;
}) {
  return <View style={[styles.page, tone === 'note' && styles.note, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.page,
    borderWidth: 1,
    borderColor: colors.pageEdge,
    borderRadius: 4,
    paddingVertical: space.xl,
    paddingHorizontal: space.xl,
    gap: space.md,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  note: { backgroundColor: colors.noteYellow },
});
