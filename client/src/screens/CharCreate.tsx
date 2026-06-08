import React, { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Screen, Heading, Prose, Card, StatRow, Banner, Divider } from '../components';
import { colors } from '../theme';
import { gameApi } from '../services/api';
import type { Background } from '../../../shared/backgrounds';

export function CharCreate({ onPick, busy }: { onPick: (id: string) => void; busy: boolean }) {
  const [backgrounds, setBackgrounds] = useState<Background[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gameApi.listBackgrounds().then(setBackgrounds).catch((e) => setError(String(e.message)));
  }, []);

  if (error) {
    return (
      <Screen>
        <Banner text={`Failed to load: ${error}`} tone="danger" />
      </Screen>
    );
  }
  if (!backgrounds) {
    return (
      <Screen center scroll={false}>
        <ActivityIndicator color={colors.gold} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Heading level="title">Choose your background</Heading>
      <Divider />
      {backgrounds.map((bg) => (
        <Card key={bg.id} onPress={busy ? undefined : () => onPick(bg.id)}>
          <Heading level="heading">{bg.name}</Heading>
          <Prose>{bg.blurb}</Prose>
          <StatRow stats={bg.baseStats} />
        </Card>
      ))}
    </Screen>
  );
}
