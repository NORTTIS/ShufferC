import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, Heading, Card, Button, Label, StatRow } from '../components';
import { colors, space } from '../theme';
import { sprite } from '../assets';
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
  const stats = view.effectiveStats;

  return (
    <Screen>
      <Heading level="title">Equipment</Heading>
      <StatRow stats={stats} full />

      <Label>Equipped</Label>
      {Object.entries(equipped).map(([slot, id]) => {
        if (!id) return null;
        return (
          <Card key={slot}>
            <View style={styles.row}>
              <Text style={styles.item}>{slot}: {sprite('item.' + id)} {id}</Text>
              <Button label="Unequip" variant="ghost" disabled={busy} onPress={() => onEquip(slot, null)} />
            </View>
          </Card>
        );
      })}

      <Label>Inventory</Label>
      {view.save.character.inventory.map((id) => (
        <Card key={id}>
          <Text style={styles.item}>{sprite('item.' + id)} {id}</Text>
        </Card>
      ))}

      <Label>Consumables</Label>
      {Object.entries(view.save.consumables).map(([id, qty]) => (
        <Card key={id}>
          <View style={styles.row}>
            <Text style={styles.item}>{sprite('item.' + id)} {id} ×{qty}</Text>
            <Button label="Use" variant="ghost" disabled={busy} onPress={() => onUse(id)} />
          </View>
        </Card>
      ))}
      <Label>HP: {view.save.vitals.currentHp}</Label>

      <Button label="Back to story" variant="ghost" disabled={busy} onPress={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  item: { fontSize: 15, color: colors.inkPrimary, flexShrink: 1 },
});
