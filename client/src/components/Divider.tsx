import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, space } from '../theme';

export function Divider() {
  return (
    <View style={styles.wrap}>
      <View style={styles.line} />
      <Text style={styles.orn}>❖</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginVertical: space.sm },
  line: { flex: 1, height: 1, backgroundColor: colors.goldDim },
  orn: { color: colors.gold, fontSize: 14 },
});
