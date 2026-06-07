import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { SessionView } from '../services/api';
import { sprite } from '../assets';

export function Inventory({
  view, busy, onEquip, onBack,
}: {
  view: SessionView;
  busy: boolean;
  onEquip: (slot: string, itemId: string | null) => void;
  onBack: () => void;
}) {
  const equipped = view.save.character.equipped;
  const stats = view.effectiveStats;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Equipment</Text>
      <Text style={styles.stats}>
        STR {stats.str} · DEX {stats.dex} · INT {stats.int} · WIS {stats.wis} · CHA {stats.cha} · CON {stats.con}
      </Text>

      <Text style={styles.section}>Equipped</Text>
      {Object.entries(equipped).map(([slot, id]) => {
        if (!id) return null;
        return (
          <View key={slot} style={styles.row}>
            <Text style={styles.item}>{slot}: {sprite('item.' + id)} {id}</Text>
            <Pressable disabled={busy} onPress={() => onEquip(slot, null)}>
              <Text style={styles.unequip}>unequip</Text>
            </Pressable>
          </View>
        );
      })}

      <Text style={styles.section}>Inventory</Text>
      {view.save.character.inventory.map((id) => (
        <Text key={id} style={styles.item}>{id}</Text>
      ))}

      <Pressable style={styles.back} onPress={onBack} disabled={busy}>
        <Text style={styles.backText}>Back to story</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  stats: { fontVariant: ['tabular-nums'], color: '#222', marginBottom: 8 },
  section: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  item: { fontSize: 15 },
  unequip: { color: '#a33', textDecorationLine: 'underline' },
  back: { padding: 12, marginTop: 20 },
  backText: { textAlign: 'center', color: '#446', textDecorationLine: 'underline' },
});
