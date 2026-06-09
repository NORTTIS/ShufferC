import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen, Prose, Card, Button, Tag, Heading, StatRow, Label } from '../components';
import { space } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import type { SessionView, ChoiceView } from '../services/api';

export function Story({
  view, lastChoice, busy, onChoose, onFight, onInventory,
}: {
  view: SessionView;
  lastChoice: ChoiceView | null;
  busy: boolean;
  onChoose: (choiceId: string) => void;
  onFight: (choiceId: string) => void;
  onInventory: () => void;
}) {
  const layout = useResponsive();
  const nodeHasCombat = !!view.node.combat;
  const rep = view.save.reputation;

  const rail = layout.showRail ? (
    <View style={styles.rail}>
      <Heading level="heading">{view.save.character.background}</Heading>
      <StatRow stats={view.effectiveStats} />
      <Label>Reputation — hero {rep.hero} · villain {rep.villain}</Label>
    </View>
  ) : null;

  const main = (
    <View style={styles.main}>
      <Prose>{view.node.prose}</Prose>

      {lastChoice?.roll != null && (
        <Tag
          text={`Skill check · rolled ${lastChoice.roll} → ${lastChoice.checkPassed ? 'PASS' : 'FAIL'}`}
          tone={lastChoice.checkPassed ? 'success' : 'danger'}
        />
      )}

      {lastChoice?.reward && (
        <Tag
          text={`Spoils · +${lastChoice.reward.gold}g · +${lastChoice.reward.xp} xp${lastChoice.reward.itemIds.length ? ' · ' + lastChoice.reward.itemIds.join(', ') : ''}`}
          tone="success"
        />
      )}

      {view.node.choices.map((c) => {
        const isFight = nodeHasCombat && !c.skillCheck;
        const label = `${c.text}${c.skillCheck ? ` (${c.skillCheck.stat.toUpperCase()} check)` : ''}${isFight ? ' ⚔' : ''}`;
        return (
          <Button
            key={c.id}
            label={label}
            variant={isFight ? 'danger' : 'ghost'}
            disabled={busy}
            onPress={() => (isFight ? onFight(c.id) : onChoose(c.id))}
          />
        );
      })}

      <Card onPress={busy ? undefined : onInventory}>
        <Label>Inventory / Equipment</Label>
      </Card>
    </View>
  );

  return (
    <Screen>
      {rail ? (
        <View style={styles.split}>
          {main}
          {rail}
        </View>
      ) : main}
    </Screen>
  );
}

const styles = StyleSheet.create({
  split: { flexDirection: 'row', gap: space.lg },
  main: { flex: 1, gap: space.md },
  rail: { width: 240, gap: space.sm },
});
