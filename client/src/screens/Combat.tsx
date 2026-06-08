import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen, Heading, Card, Button, Tag } from '../components';
import { colors, space } from '../theme';
import { sprite } from '../assets';
import type { SessionView, ChoiceView } from '../services/api';

export function Combat({
  view, lastChoice, busy, onFight,
}: {
  view: SessionView;
  lastChoice: ChoiceView | null;
  busy: boolean;
  onFight: (skillPriority: string[]) => void;
}) {
  const [priority, setPriority] = useState<string[]>(view.save.character.skillPriority);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= priority.length) return;
    const next = [...priority];
    [next[i], next[j]] = [next[j], next[i]];
    setPriority(next);
  };

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
      <Screen>
        <Heading level="title">Arrange skill priority</Heading>
        {priority.map((id, i) => (
          <Card key={id}>
            <View style={styles.row}>
              <Text style={styles.skill}>{i + 1}. {id}</Text>
              <Pressable disabled={busy} onPress={() => move(i, -1)}><Text style={styles.arrow}>▲</Text></Pressable>
              <Pressable disabled={busy} onPress={() => move(i, 1)}><Text style={styles.arrow}>▼</Text></Pressable>
            </View>
          </Card>
        ))}
        <Button label="Engage ⚔" variant="danger" busy={busy} onPress={() => onFight(priority)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.battleHead}>
        <Heading level="title">Battle</Heading>
        <Tag text={`Winner: ${lastChoice?.combat?.winner}`} tone="gold" />
      </View>
      {log.slice(0, shown).map((e, i) => (
        <Text key={i} style={styles.event}>
          R{e.round} {e.actorId} {e.type}
          {e.skillId ? ` ${sprite('skill.' + e.skillId)} ${e.skillId}` : ''}
          {e.damage ? ` → ${e.damage} dmg` : ''}
          {e.note ? ` (${e.note})` : ''}
        </Text>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  skill: { fontSize: 16, flex: 1, color: colors.inkPrimary },
  arrow: { fontSize: 18, paddingHorizontal: space.sm, color: colors.gold },
  battleHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  event: { fontVariant: ['tabular-nums'], fontSize: 14, color: colors.inkPrimary },
});
