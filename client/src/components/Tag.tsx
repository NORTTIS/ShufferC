import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radii, space, toneColor, type Tone } from '../theme';

export function Tag({ text, tone = 'gold' }: { text: string; tone?: Tone }) {
  const c = toneColor(tone);
  return (
    <View style={[styles.tag, { borderColor: c }]}>
      <Text style={[styles.text, { color: c }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radii.sm, paddingVertical: space.xs, paddingHorizontal: space.sm },
  text: { fontSize: 12 },
});
