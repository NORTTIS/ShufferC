import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, Heading, Card, Button, Label, StatRow } from '../components';
import { colors, space } from '../theme';
import { sprite } from '../assets';
import type { SessionView } from '../services/api';

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
    <Screen>
      <Heading level="title">Equipment</Heading>
      <StatRow stats={stats} />

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

      <Button label="Back to story" variant="ghost" disabled={busy} onPress={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  item: { fontSize: 15, color: colors.inkPrimary, flexShrink: 1 },
});
