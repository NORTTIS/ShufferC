import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { CrimsonPro_400Regular, CrimsonPro_600SemiBold } from '@expo-google-fonts/crimson-pro';
import { PatrickHand_400Regular } from '@expo-google-fonts/patrick-hand';
import { useAuth } from './src/hooks/useAuth';
import { useGameSession } from './src/hooks/useGameSession';
import { AuthScreen } from './src/screens/Auth';
import { CharCreate } from './src/screens/CharCreate';
import { Story } from './src/screens/Story';
import { Combat } from './src/screens/Combat';
import { Inventory } from './src/screens/Inventory';
import { Shop } from './src/screens/Shop';
import { Ending } from './src/screens/Ending';
import { Desk, PaperNote, NoteText } from './src/components';
import { colors, space, type } from './src/theme';

const APP_TITLE = 'ShufferC';

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    CrimsonPro_400Regular, CrimsonPro_600SemiBold, PatrickHand_400Regular,
  });
  const auth = useAuth();
  const { state, start, choose, enterCombat, fight, equip, buy, useItem, openShop, goTo, continueRoute } = useGameSession();

  if (auth.status === 'loading' || (!fontsLoaded && !fontError)) {
    return (
      <Desk center>
        <View style={styles.splash}>
          <Text style={styles.splashTitle}>{APP_TITLE}</Text>
          <ActivityIndicator color={colors.page} />
        </View>
      </Desk>
    );
  }

  if (auth.status === 'out') {
    return (
      <>
        <StatusBar style="light" />
        <AuthScreen onLogin={auth.login} onRegister={auth.register} />
      </>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{APP_TITLE}</Text>
        <Pressable onPress={auth.logout}><Text style={styles.logout}>close the book ✕</Text></Pressable>
      </View>
      {state.error && (
        <View style={styles.bannerWrap}>
          <PaperNote tone="pink" tilt={-1}>
            <NoteText>{state.error}</NoteText>
          </PaperNote>
        </View>
      )}

      <View style={styles.body}>
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
            onShop={openShop}
          />
        )}

        {state.screen === 'combat' && state.view && (
          <Combat view={state.view} lastChoice={state.lastChoice} busy={state.busy} onFight={fight} />
        )}

        {state.screen === 'inventory' && state.view && (
          <Inventory view={state.view} busy={state.busy} onEquip={equip} onUse={useItem} onBack={() => goTo('story')} />
        )}

        {state.screen === 'shop' && state.shop && state.view && (
          <Shop
            shop={state.shop}
            gold={state.view.save.gold}
            busy={state.busy}
            onBuy={buy}
            onBack={() => goTo('story')}
          />
        )}

        {state.screen === 'ending' && state.view && (
          <Ending
            view={state.view}
            lastChoice={state.lastChoice}
            busy={state.busy}
            onContinue={() => continueRoute()}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.deskWood, paddingTop: 24 },
  splash: { alignItems: 'center', gap: space.lg },
  splashTitle: { fontSize: 30, fontFamily: 'CrimsonPro_600SemiBold', color: colors.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.sm,
    borderBottomWidth: 1, borderBottomColor: 'rgba(244,234,214,0.15)',
  },
  headerTitle: { fontSize: 20, fontFamily: 'CrimsonPro_600SemiBold', color: colors.page },
  logout: { ...type.handSmall, color: colors.pageEdge },
  bannerWrap: { paddingHorizontal: space.lg, paddingTop: space.sm, alignItems: 'flex-start' },
  body: { flex: 1 },
});
