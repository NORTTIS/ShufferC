import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii, space, toneColor, type Tone } from '../theme';

export function Banner({ text, tone = 'danger' }: { text: string; tone?: Tone }) {
  const c = toneColor(tone);
  return (
    <View style={[styles.banner, { borderColor: c }]}>
      <Text style={[styles.text, { color: c }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: radii.sm, padding: space.sm, backgroundColor: colors.bgPanel },
  text: { fontSize: 14 },
});
