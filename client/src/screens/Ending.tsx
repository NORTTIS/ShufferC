import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen, Heading, Prose, Tag, StatRow, Button, Divider } from '../components';
import { space } from '../theme';
import type { SessionView, ChoiceView } from '../services/api';

export function Ending({
  view, lastChoice, busy, onContinue,
}: {
  view: SessionView;
  lastChoice: ChoiceView | null;
  busy: boolean;
  onContinue: () => void;
}) {
  const isDefeat = lastChoice?.ending === 'defeat';
  const canContinue = !isDefeat && view.hasNextRoute;

  if (canContinue) {
    return (
      <Screen>
        <View style={styles.wrap}>
          <Heading level="display">The End</Heading>
          <Divider />
          <Prose>{view.node.prose}</Prose>
          {view.ending && <Tag text={`Ending: ${view.ending}`} tone="gold" />}
          <Button label="Continue" busy={busy} onPress={onContinue} />
        </View>
      </Screen>
    );
  }

  if (isDefeat) {
    return (
      <Screen>
        <View style={styles.wrap}>
          <Heading level="display">You have fallen.</Heading>
          <Divider />
          <Prose>{view.node.prose}</Prose>
        </View>
      </Screen>
    );
  }

  // Finale: no further published routes remain.
  const stats = view.effectiveStats;
  const rep = view.save.reputation;
  const routesPlayed = view.save.playedRouteIds?.length ?? 1;
  return (
    <Screen>
      <View style={styles.wrap}>
        <Heading level="display">Your journey ends</Heading>
        <Divider />
        <Prose>{view.node.prose}</Prose>
        <Tag text={`Routes completed: ${routesPlayed}`} tone="gold" />
        <StatRow stats={stats} />
        <Tag text={`Reputation — hero ${rep.hero} · villain ${rep.villain}`} tone="muted" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
});
