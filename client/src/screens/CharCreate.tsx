import React, { useEffect, useState } from 'react';
import { Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Desk, BookPage, InkProse, ChoiceLine, PaperNote, NoteText } from '../components';
import { colors, space, type } from '../theme';
import { formatStats } from '../lib/format';
import { gameApi } from '../services/api';
import type { Background } from '../../../shared/backgrounds';

export function CharCreate({ onPick, busy }: { onPick: (id: string) => void; busy: boolean }) {
  const [backgrounds, setBackgrounds] = useState<Background[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gameApi.listBackgrounds().then(setBackgrounds).catch((e) => setError(String(e.message)));
  }, []);

  if (error) {
    return (
      <Desk center>
        <PaperNote tone="pink" tilt={-1.5}>
          <NoteText>failed to load: {error}</NoteText>
        </PaperNote>
      </Desk>
    );
  }
  if (!backgrounds) {
    return (
      <Desk center>
        <ActivityIndicator color={colors.page} />
      </Desk>
    );
  }

  return (
    <Desk center>
      <BookPage>
        <Text style={styles.chapter}>prologue</Text>
        <InkProse>Every story begins with a soul. Choose whose tale this book will tell.</InkProse>
        {backgrounds.map((bg) => (
          <Pressable
            key={bg.id}
            disabled={busy}
            onPress={() => setSelected(bg.id)}
            style={[styles.bg, selected === bg.id && styles.bgActive]}
          >
            <Text style={styles.name}>{bg.name}</Text>
            <Text style={styles.blurb}>{bg.blurb}</Text>
            <Text style={styles.stats}>{formatStats(bg.baseStats, true)}</Text>
          </Pressable>
        ))}
        <ChoiceLine
          text="Take up the pen ✒"
          disabled={busy || !selected}
          onPress={() => selected && onPick(selected)}
        />
      </BookPage>
    </Desk>
  );
}

const styles = StyleSheet.create({
  chapter: { ...type.chapter, color: colors.inkFaded, textTransform: 'uppercase' },
  bg: {
    borderWidth: 1, borderColor: 'transparent', borderRadius: 4,
    padding: space.md, gap: space.xs,
  },
  bgActive: { borderColor: colors.inkAccent, backgroundColor: 'rgba(107,79,42,0.07)' },
  name: { ...type.hand, fontSize: 20, color: colors.ink },
  blurb: { ...type.prose, fontSize: 16, lineHeight: 24, color: colors.ink },
  stats: { ...type.handSmall, color: colors.inkAccent },
});
