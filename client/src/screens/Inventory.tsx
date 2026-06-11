import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Desk, BookPage, InkButton, ChoiceLine } from '../components';
import { colors, space, type } from '../theme';
import { sprite } from '../assets';
import { formatStats } from '../lib/format';
import type { SessionView } from '../services/api';

export function Inventory({
  view, busy, onEquip, onUse, onBack,
}: {
  view: SessionView;
  busy: boolean;
  onEquip: (slot: string, itemId: string | null) => void;
  onUse: (itemId: string) => void;
  onBack: () => void;
}) {
  const equipped = view.save.character.equipped;

  return (
    <Desk>
      <BookPage tone="note">
        <Text style={styles.title}>satchel & gear</Text>
        <Text style={styles.line}>{formatStats(view.effectiveStats, true)}</Text>
        <Text style={styles.line}>HP {view.save.vitals.currentHp} ❤</Text>

        <Text style={styles.section}>— equipped —</Text>
        {Object.entries(equipped).map(([slot, id]) => {
          if (!id) return null;
          return (
            <View key={slot} style={styles.row}>
              <Text style={styles.item}>{slot}: {sprite('item.' + id)} {id}</Text>
              <InkButton label="unequip" disabled={busy} onPress={() => onEquip(slot, null)} />
            </View>
          );
        })}

        <Text style={styles.section}>— carried —</Text>
        {view.save.character.inventory.map((id, i) => (
          <View key={`${id}-${i}`} style={styles.row}>
            <Text style={styles.item}>{sprite('item.' + id)} {id}</Text>
          </View>
        ))}

        <Text style={styles.section}>— potions & scrolls —</Text>
        {Object.entries(view.save.consumables).map(([id, qty]) => (
          <View key={id} style={styles.row}>
            <Text style={styles.item}>{sprite('item.' + id)} {id} ×{qty}</Text>
            <InkButton label="use" disabled={busy} onPress={() => onUse(id)} />
          </View>
        ))}

        <ChoiceLine text="Back to the story" disabled={busy} onPress={onBack} />
      </BookPage>
    </Desk>
  );
}

const styles = StyleSheet.create({
  title: { ...type.chapter, color: colors.noteInk, textTransform: 'uppercase' },
  line: { ...type.handSmall, color: colors.noteInk },
  section: { ...type.handSmall, color: colors.noteInk, opacity: 0.7, marginTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  item: { ...type.hand, color: colors.noteInk, flexShrink: 1 },
});
