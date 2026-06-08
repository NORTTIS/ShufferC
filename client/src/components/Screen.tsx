import React from 'react';
import { SafeAreaView, ScrollView, View, StyleSheet, type ViewStyle } from 'react-native';
import { colors, space } from '../theme';
import { useResponsive } from '../hooks/useResponsive';

export function Screen({
  children, scroll = true, center = false, style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  center?: boolean;
  style?: ViewStyle;
}) {
  const layout = useResponsive();
  const inner: ViewStyle = {
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
    padding: space.lg,
    gap: space.md,
    ...(center ? { flexGrow: 1, justifyContent: 'center' } : null),
  };
  const body = <View style={[inner, style]}>{children}</View>;
  return (
    <SafeAreaView style={styles.root}>
      {scroll
        ? <ScrollView contentContainerStyle={[styles.scroll, center && styles.center]}>{body}</ScrollView>
        : <View style={styles.fill}>{body}</View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  scroll: { flexGrow: 1 },
  center: { justifyContent: 'center' },
  fill: { flex: 1 },
});
