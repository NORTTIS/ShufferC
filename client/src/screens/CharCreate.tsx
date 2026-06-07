import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { gameApi } from '../services/api';
import type { Background } from '../../../shared/backgrounds';

export function CharCreate({ onPick, busy }: { onPick: (id: string) => void; busy: boolean }) {
  const [backgrounds, setBackgrounds] = useState<Background[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gameApi.listBackgrounds().then(setBackgrounds).catch((e) => setError(String(e.message)));
  }, []);

  if (error) return <Text style={styles.error}>Failed to load: {error}</Text>;
  if (!backgrounds) return <ActivityIndicator style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Choose your background</Text>
      {backgrounds.map((bg) => (
        <Pressable key={bg.id} style={styles.card} disabled={busy} onPress={() => onPick(bg.id)}>
          <Text style={styles.name}>{bg.name}</Text>
          <Text style={styles.blurb}>{bg.blurb}</Text>
          <Text style={styles.stats}>
            STR {bg.baseStats.str} · DEX {bg.baseStats.dex} · INT {bg.baseStats.int} · CON {bg.baseStats.con}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  card: { borderWidth: 1, borderColor: '#888', borderRadius: 8, padding: 12 },
  name: { fontSize: 18, fontWeight: '600' },
  blurb: { color: '#444', marginVertical: 4 },
  stats: { fontVariant: ['tabular-nums'], color: '#222' },
  error: { color: 'red', padding: 16 },
});
