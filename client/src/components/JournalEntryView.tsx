import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, space, type } from '../theme';
import type { JournalEntry } from '../../../shared/engine/journal';

/** A past step of the story: faded prose + the handwritten line of what was chosen. */
export function JournalEntryView({ entry }: { entry: JournalEntry }) {
  const rollNote = entry.roll != null
    ? `  (⚄ ${entry.roll} — ${entry.checkPassed ? 'passed' : 'failed'})`
    : '';
  return (
    <View style={styles.wrap}>
      <Text style={styles.prose}>{entry.prose}</Text>
      <Text style={styles.chosen}>→ {entry.chosenText}{rollNote}</Text>
      {entry.reward && (
        <Text style={styles.chosen}>
          ✦ +{entry.reward.gold} gold · +{entry.reward.xp} xp
          {entry.reward.itemIds.length ? ` · ${entry.reward.itemIds.join(', ')}` : ''}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs, marginBottom: space.md },
  prose: { ...type.prose, color: colors.inkFaded },
  chosen: { ...type.handSmall, color: colors.inkFaded },
});
