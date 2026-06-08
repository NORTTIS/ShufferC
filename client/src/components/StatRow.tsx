import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors } from '../theme';
import type { Stats } from '../../../shared/types';

export function StatRow({ stats }: { stats: Stats }) {
  return (
    <Text style={styles.row}>
      STR {stats.str} · DEX {stats.dex} · INT {stats.int} · CON {stats.con}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { color: colors.inkPrimary, fontVariant: ['tabular-nums'], fontSize: 14 },
});
