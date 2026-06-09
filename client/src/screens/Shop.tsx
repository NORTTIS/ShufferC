import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, Heading, Card, Button, Label } from '../components';
import { colors, space } from '../theme';
import { sprite } from '../assets';
import type { ShopView } from '../services/api';

export function Shop({ shop, gold, busy, onBuy, onBack }: {
  shop: ShopView; gold: number; busy: boolean; onBuy: (itemId: string) => void; onBack: () => void;
}) {
  return (
    <Screen>
      <Heading level="title">Merchant</Heading>
      <Label>Gold: {gold}</Label>
      {shop.stock.map(({ item, price }) => (
        <Card key={item.id}>
          <View style={styles.row}>
            <Text style={styles.item}>{sprite('item.' + item.id)} {item.name} — {price}g</Text>
            <Button label="Buy" variant="ghost" disabled={busy || gold < price} onPress={() => onBuy(item.id)} />
          </View>
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
