import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Desk, BookPage, InkProse, ChoiceLine, InkStamp, PaperNote, NoteText } from '../components';
import { colors, space, type, tilts } from '../theme';
import { formatStats } from '../lib/format';
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
      <Desk center>
        <BookPage>
          <Text style={styles.chapter}>epilogue</Text>
          <InkProse animate>{view.node.prose}</InkProse>
          {view.ending && <InkStamp text={`ending: ${view.ending}`} tone="green" />}
          <ChoiceLine text="Write the next chapter" disabled={busy} onPress={onContinue} />
        </BookPage>
      </Desk>
    );
  }

  if (isDefeat) {
    return (
      <Desk center>
        <BookPage>
          <Text style={styles.chapter}>the final page</Text>
          <InkProse animate>{view.node.prose}</InkProse>
          <InkStamp text="you have fallen" tone="red" />
        </BookPage>
      </Desk>
    );
  }

  // Finale: no further published routes remain.
  const rep = view.save.reputation;
  const routesPlayed = view.save.playedRouteIds?.length ?? 1;
  return (
    <Desk center>
      <BookPage>
        <Text style={styles.chapter}>the book closes</Text>
        <InkProse animate>{view.node.prose}</InkProse>
        {view.ending && <InkStamp text={`ending: ${view.ending}`} tone="ink" />}
      </BookPage>
      <View style={styles.notes}>
        <PaperNote tone="yellow" tilt={tilts[0]}>
          <NoteText>chapters written: {routesPlayed}</NoteText>
          <NoteText>{formatStats(view.effectiveStats, true)}</NoteText>
        </PaperNote>
        <PaperNote tone="pink" tilt={tilts[1]}>
          <NoteText>hero {rep.hero} · villain {rep.villain}</NoteText>
        </PaperNote>
      </View>
    </Desk>
  );
}

const styles = StyleSheet.create({
  chapter: { ...type.chapter, color: colors.inkFaded, textTransform: 'uppercase' },
  notes: { flexDirection: 'row', gap: space.xl, justifyContent: 'center' },
});
