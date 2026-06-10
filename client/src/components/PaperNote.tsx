import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, space, type } from '../theme';

export type NoteTone = 'yellow' | 'blue' | 'pink';

const TONE_BG: Record<NoteTone, string> = {
  yellow: colors.noteYellow,
  blue: colors.noteBlue,
  pink: colors.notePink,
};

/** A pinned sticky note. Pass `tilt` (degrees) from theme `tilts` for variety. */
export function PaperNote({
  children, tone = 'yellow', tilt = 0, onPress, compact = false,
}: {
  children: React.ReactNode;
  tone?: NoteTone;
  tilt?: number;
  onPress?: () => void;
  compact?: boolean;
}) {
  const inner = (
    <View style={[
      styles.note,
      { backgroundColor: TONE_BG[tone], transform: [{ rotate: `${tilt}deg` }] },
      compact && styles.compact,
    ]}>
      <View style={styles.pin} />
      {children}
    </View>
  );
  if (!onPress) return inner;
  return <Pressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : null)}>{inner}</Pressable>;
}

/** Handwritten text on a note. */
export function NoteText({ children }: { children: React.ReactNode }) {
  return <Text style={styles.text}>{children}</Text>;
}

const styles = StyleSheet.create({
  note: {
    padding: space.md,
    paddingTop: space.sm,
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 2, height: 3 },
    elevation: 5,
  },
  compact: { padding: space.sm, minWidth: 150 },
  pin: {
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: colors.notePin,
    alignSelf: 'center', marginBottom: space.xs,
  },
  pressed: { opacity: 0.8 },
  text: { ...type.handSmall, color: colors.noteInk },
});
