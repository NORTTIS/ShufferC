import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
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
import { Screen, Heading, Button, Banner } from './src/components';
import { colors, space } from './src/theme';

const APP_TITLE = 'ShufferC';

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    CrimsonPro_400Regular, CrimsonPro_600SemiBold, PatrickHand_400Regular,
  });
  const auth = useAuth();
  const { state, start, choose, enterCombat, fight, equip, buy, useItem, openShop, goTo, continueRoute } = useGameSession();

  if (auth.status === 'loading' || (!fontsLoaded && !fontError)) {
    return (
      <Screen center scroll={false}>
        <View style={styles.splash}>
          <Heading level="display">{APP_TITLE}</Heading>
          <ActivityIndicator color={colors.gold} />
        </View>
      </Screen>
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
        <Heading level="heading">{APP_TITLE}</Heading>
        <Button label="Log out" variant="ghost" onPress={auth.logout} />
      </View>
      <View style={styles.headerRule} />
      {state.error && (
        <View style={styles.bannerWrap}>
          <Banner text={state.error} tone="danger" />
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
  root: { flex: 1, backgroundColor: colors.bgBase, paddingTop: 24 },
  splash: { alignItems: 'center', gap: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.sm },
  headerRule: { height: 1, backgroundColor: colors.goldDim, marginHorizontal: space.lg },
  bannerWrap: { paddingHorizontal: space.lg, paddingTop: space.sm },
  body: { flex: 1 },
});
