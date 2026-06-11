import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { space } from '../theme';

/**
 * Lays out paper notes: a vertical column beside the page (desktop) or a
 * horizontal strip above it (narrow screens). The caller decides via useResponsive.
 */
export function NoteRail({ notes, horizontal = false }: { notes: React.ReactNode[]; horizontal?: boolean }) {
  if (!horizontal) {
    return (
      <View style={styles.rail}>
        {notes.map((n, i) => <View key={i}>{n}</View>)}
      </View>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {notes.map((n, i) => <View key={i}>{n}</View>)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { width: 230, gap: space.lg, paddingTop: space.md },
  strip: { gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.xs },
});
