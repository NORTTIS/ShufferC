import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Desk, BookPage, InkProse, ChoiceLine, PaperNote, NoteText, NoteRail, JournalEntryView,
} from '../components';
import { colors, space, type, tilts } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { formatStats } from '../lib/format';
import type { SessionView, ChoiceView } from '../services/api';

export function Story({
  view, lastChoice, busy, onChoose, onFight, onInventory, onShop,
}: {
  view: SessionView;
  lastChoice: ChoiceView | null;
  busy: boolean;
  onChoose: (choiceId: string) => void;
  onFight: (choiceId: string) => void;
  onInventory: () => void;
  onShop: () => void;
}) {
  const layout = useResponsive();
  const save = view.save;
  const nodeHasCombat = !!view.node.combat;
  const chapter = save.playedRouteIds?.length ?? 1;

  const notes = [
    <PaperNote tone="yellow" tilt={tilts[0]} compact={!layout.showRail}>
      <NoteText>HP {save.vitals.currentHp} ❤</NoteText>
      <NoteText>{formatStats(view.effectiveStats)}</NoteText>
    </PaperNote>,
    <PaperNote tone="blue" tilt={tilts[1]} compact={!layout.showRail} onPress={busy ? undefined : onInventory}>
      <NoteText>satchel — {save.character.inventory.length} items</NoteText>
      <NoteText>{save.gold} gold · tap to open</NoteText>
    </PaperNote>,
    <PaperNote tone="pink" tilt={tilts[2]} compact={!layout.showRail}>
      <NoteText>reputation</NoteText>
      <NoteText>hero {save.reputation.hero} · villain {save.reputation.villain}</NoteText>
    </PaperNote>,
    ...(view.node.merchant ? [
      <PaperNote tone="yellow" tilt={tilts[3]} compact={!layout.showRail} onPress={busy ? undefined : onShop}>
        <NoteText>a merchant is here</NoteText>
        <NoteText>tap to trade</NoteText>
      </PaperNote>,
    ] : []),
  ];

  const page = (
    <BookPage>
      <Text style={styles.chapter}>{save.character.background} — chapter {chapter}</Text>
      {view.journal.map((e, i) => <JournalEntryView key={i} entry={e} />)}
      <InkProse animate>{view.node.prose}</InkProse>
      <View style={styles.choices}>
        {view.node.choices.map((c) => {
          const isFight = nodeHasCombat && !c.skillCheck;
          const label = `${c.text}${c.skillCheck ? ` (${c.skillCheck.stat.toUpperCase()} check)` : ''}${isFight ? ' ⚔' : ''}`;
          return (
            <ChoiceLine
              key={c.id}
              text={label}
              tone={isFight ? 'danger' : 'default'}
              disabled={busy}
              onPress={() => (isFight ? onFight(c.id) : onChoose(c.id))}
            />
          );
        })}
      </View>
    </BookPage>
  );

  return (
    <Desk scrollToEndKey={save.currentNodeId} maxWidth={layout.showRail ? 1020 : 760}>
      {layout.showRail ? (
        <View style={styles.split}>
          <View style={styles.main}>{page}</View>
          <NoteRail notes={notes} />
        </View>
      ) : (
        <>
          <NoteRail notes={notes} horizontal />
          {page}
        </>
      )}
    </Desk>
  );
}

const styles = StyleSheet.create({
  split: { flexDirection: 'row', gap: space.lg },
  main: { flex: 1 },
  chapter: { ...type.chapter, color: colors.inkFaded, textTransform: 'uppercase' },
  choices: { marginTop: space.md },
});
