import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, space, type } from '../theme';

/** A tilted ink stamp pressed onto the page ("⚄ 17 — PASS", "winner: player"). */
export function InkStamp({ text, tone = 'ink' }: { text: string; tone?: 'ink' | 'red' | 'green' }) {
  const c = tone === 'red' ? colors.inkRed : tone === 'green' ? colors.inkGreen : colors.inkAccent;
  return (
    <View style={[styles.stamp, { borderColor: c }]}>
      <Text style={[styles.text, { color: c }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stamp: {
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderRadius: 4,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    transform: [{ rotate: '-2deg' }],
  },
  text: { ...type.handSmall, letterSpacing: 1, textTransform: 'uppercase' },
});
