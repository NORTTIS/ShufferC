import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { SessionView, ChoiceView } from '../services/api';
import { sprite } from '../assets';

export function Combat({
  view, lastChoice, busy, onFight,
}: {
  view: SessionView;
  lastChoice: ChoiceView | null;
  busy: boolean;
  onFight: (skillPriority: string[]) => void;
}) {
  // Pre-battle: arrange skill priority (start from the saved order).
  const [priority, setPriority] = useState<string[]>(view.save.character.skillPriority);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= priority.length) return;
    const next = [...priority];
    [next[i], next[j]] = [next[j], next[i]];
    setPriority(next);
  };

  // Replay the combat log step by step once we have a result.
  const log = lastChoice?.combat?.log ?? [];
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const events = lastChoice?.combat?.log ?? [];
    if (events.length === 0) { setShown(0); return; }
    setShown(0);
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      setShown(n);
      if (n >= events.length) clearInterval(timer);
    }, 600);
    return () => clearInterval(timer);
  }, [lastChoice]);

  if (log.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Arrange skill priority</Text>
        {priority.map((id, i) => (
          <View key={id} style={styles.row}>
            <Text style={styles.skill}>{i + 1}. {id}</Text>
            <Pressable disabled={busy} onPress={() => move(i, -1)}><Text style={styles.arrow}>▲</Text></Pressable>
            <Pressable disabled={busy} onPress={() => move(i, 1)}><Text style={styles.arrow}>▼</Text></Pressable>
          </View>
        ))}
        <Pressable style={styles.engage} disabled={busy} onPress={() => onFight(priority)}>
          <Text style={styles.engageText}>Engage ⚔️</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Battle ({lastChoice?.combat?.winner})</Text>
      {log.slice(0, shown).map((e, i) => (
        <Text key={i} style={styles.event}>
          R{e.round} {e.actorId} {e.type}
          {e.skillId ? ` ${sprite('skill.' + e.skillId)} ${e.skillId}` : ''}
          {e.damage ? ` → ${e.damage} dmg` : ''}
          {e.note ? ` (${e.note})` : ''}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skill: { fontSize: 16, flex: 1 },
  arrow: { fontSize: 18, paddingHorizontal: 8 },
  engage: { backgroundColor: '#a33', borderRadius: 8, padding: 14, marginTop: 16 },
  engageText: { color: 'white', textAlign: 'center', fontSize: 16, fontWeight: '700' },
  event: { fontVariant: ['tabular-nums'], fontSize: 14 },
});
