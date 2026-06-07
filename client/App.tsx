import React from 'react';
import { SafeAreaView, View, Text, Pressable, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useGameSession } from './src/hooks/useGameSession';
import { CharCreate } from './src/screens/CharCreate';
import { Story } from './src/screens/Story';
import { Combat } from './src/screens/Combat';
import { Inventory } from './src/screens/Inventory';

export default function App() {
  const { state, start, choose, enterCombat, fight, equip, goTo } = useGameSession();

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="auto" />
      {state.error && <Text style={styles.error}>{state.error}</Text>}

      {state.screen === 'charcreate' && (
        <CharCreate onPick={start} busy={state.busy} />
      )}

      {state.screen === 'story' && state.view && (
        <Story
          view={state.view}
          lastChoice={state.lastChoice}
          busy={state.busy}
          onChoose={choose}
          onFight={enterCombat}
          onInventory={() => goTo('inventory')}
        />
      )}

      {state.screen === 'combat' && state.view && (
        <Combat view={state.view} lastChoice={state.lastChoice} busy={state.busy} onFight={fight} />
      )}

      {state.screen === 'inventory' && state.view && (
        <Inventory view={state.view} busy={state.busy} onEquip={equip} onBack={() => goTo('story')} />
      )}

      {state.screen === 'ending' && state.view && (
        <View style={styles.ending}>
          <Text style={styles.endTitle}>
            {state.lastChoice?.ending === 'defeat' ? 'You have fallen.' : 'The End'}
          </Text>
          <Text style={styles.endProse}>{state.view.node.prose}</Text>
          {state.view.ending && <Text style={styles.endTag}>Ending: {state.view.ending}</Text>}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 24 },
  error: { color: 'red', textAlign: 'center', padding: 8 },
  ending: { padding: 24, gap: 12 },
  endTitle: { fontSize: 24, fontWeight: '700' },
  endProse: { fontSize: 16, lineHeight: 24 },
  endTag: { fontStyle: 'italic', color: '#555' },
});
