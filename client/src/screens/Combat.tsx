import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Desk, BookPage, InkProse, ChoiceLine, InkStamp } from '../components';
import { colors, space, type } from '../theme';
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
      <Desk center>
        <BookPage>
          <Text style={styles.chapter}>before the battle</Text>
          <InkProse>You ready yourself, deciding which skill to lead with.</InkProse>
          {priority.map((id, i) => (
            <View key={id} style={styles.row}>
              <Text style={styles.skill}>{i + 1}. {id}</Text>
              <Pressable disabled={busy} onPress={() => move(i, -1)}><Text style={styles.arrow}>▲</Text></Pressable>
              <Pressable disabled={busy} onPress={() => move(i, 1)}><Text style={styles.arrow}>▼</Text></Pressable>
            </View>
          ))}
          <ChoiceLine text="Engage ⚔" tone="danger" disabled={busy} onPress={() => onFight(priority)} />
        </BookPage>
      </Desk>
    );
  }

  return (
    <Desk scrollToEndKey={shown}>
      <BookPage>
        <Text style={styles.chapter}>the battle</Text>
        {log.slice(0, shown).map((e, i) => (
          <Text key={i} style={styles.event}>
            R{e.round} {e.actorId} {e.type}
            {e.skillId ? ` ${sprite('skill.' + e.skillId)} ${e.skillId}` : ''}
            {e.damage ? ` → ${e.damage} dmg` : ''}
            {e.note ? ` (${e.note})` : ''}
          </Text>
        ))}
        {shown >= log.length && (
          <InkStamp
            text={`winner: ${lastChoice?.combat?.winner}`}
            tone={lastChoice?.combat?.winner === 'player' ? 'green' : 'red'}
          />
        )}
      </BookPage>
    </Desk>
  );
}

const styles = StyleSheet.create({
  chapter: { ...type.chapter, color: colors.inkFaded, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  skill: { ...type.hand, flex: 1, color: colors.ink },
  arrow: { fontSize: 18, paddingHorizontal: space.sm, color: colors.inkAccent },
  event: { ...type.handSmall, color: colors.ink },
});
