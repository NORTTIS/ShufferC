import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Desk, BookPage, InkButton, ChoiceLine, PaperNote, NoteText } from '../components';
import { colors, space, type, tilts } from '../theme';
import { sprite } from '../assets';
import type { ShopView } from '../services/api';

export function Shop({ shop, gold, busy, onBuy, onBack }: {
  shop: ShopView; gold: number; busy: boolean; onBuy: (itemId: string) => void; onBack: () => void;
}) {
  // ids bought during this visit — marked with a ✓ in the ledger (stock itself never depletes)
  const [bought, setBought] = useState<Set<string>>(new Set());
  const buy = (id: string) => {
    onBuy(id);
    setBought((s) => new Set(s).add(id));
  };

  return (
    <Desk>
      <PaperNote tone="yellow" tilt={tilts[1]}>
        <NoteText>purse: {gold} gold</NoteText>
      </PaperNote>
      <BookPage tone="note">
        <Text style={styles.title}>merchant's ledger</Text>
        {shop.stock.map(({ item, price }) => (
          <View key={item.id} style={styles.row}>
            <Text style={styles.item}>
              {sprite('item.' + item.id)} {item.name} — {price}g{bought.has(item.id) ? '  ✓' : ''}
            </Text>
            <InkButton label="buy" disabled={busy || gold < price} onPress={() => buy(item.id)} />
          </View>
        ))}
        <ChoiceLine text="Back to the story" disabled={busy} onPress={onBack} />
      </BookPage>
    </Desk>
  );
}

const styles = StyleSheet.create({
  title: { ...type.chapter, color: colors.noteInk, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  item: { ...type.hand, color: colors.noteInk, flexShrink: 1 },
});
