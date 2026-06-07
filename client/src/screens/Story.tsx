import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { SessionView, ChoiceView } from '../services/api';

export function Story({
  view, lastChoice, busy, onChoose, onFight, onInventory,
}: {
  view: SessionView;
  lastChoice: ChoiceView | null;
  busy: boolean;
  onChoose: (choiceId: string) => void;   // skill-check / plain choices
  onFight: (choiceId: string) => void;    // fight choices (route to combat)
  onInventory: () => void;
}) {
  const nodeHasCombat = !!view.node.combat;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.prose}>{view.node.prose}</Text>

      {lastChoice?.roll != null && (
        <Text style={styles.check}>
          Skill check: rolled {lastChoice.roll} → {lastChoice.checkPassed ? 'PASS' : 'FAIL'}
        </Text>
      )}

      {view.node.choices.map((c) => {
        const isFight = nodeHasCombat && !c.skillCheck;
        return (
          <Pressable
            key={c.id}
            style={styles.choice}
            disabled={busy}
            onPress={() => (isFight ? onFight(c.id) : onChoose(c.id))}
          >
            <Text style={styles.choiceText}>
              {c.text}{c.skillCheck ? ` (${c.skillCheck.stat.toUpperCase()} check)` : ''}{isFight ? ' ⚔️' : ''}
            </Text>
          </Pressable>
        );
      })}

      <Pressable style={styles.inv} onPress={onInventory} disabled={busy}>
        <Text style={styles.invText}>Inventory / Equipment</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  prose: { fontSize: 16, lineHeight: 24 },
  check: { fontStyle: 'italic', color: '#555' },
  choice: { borderWidth: 1, borderColor: '#446', borderRadius: 8, padding: 12, backgroundColor: '#eef' },
  choiceText: { fontSize: 16 },
  inv: { padding: 10, marginTop: 16 },
  invText: { textAlign: 'center', color: '#446', textDecorationLine: 'underline' },
});
