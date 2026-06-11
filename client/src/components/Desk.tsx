import React, { useEffect, useRef } from 'react';
import { SafeAreaView, ScrollView, View, StyleSheet, type ViewStyle } from 'react-native';
import { colors, space } from '../theme';

/**
 * The wooden desk every screen sits on. Scrollable; when `scrollToEndKey`
 * changes the desk scrolls to the bottom (used by Story as prose grows).
 */
export function Desk({
  children, center = false, maxWidth = 760, scrollToEndKey, style,
}: {
  children: React.ReactNode;
  center?: boolean;
  maxWidth?: number;
  scrollToEndKey?: string | number;
  style?: ViewStyle;
}) {
  const ref = useRef<ScrollView>(null);
  useEffect(() => {
    if (scrollToEndKey === undefined) return;
    const t = setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [scrollToEndKey]);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView ref={ref} contentContainerStyle={[styles.scroll, center && styles.center]}>
        <View style={[styles.inner, { maxWidth }, style]}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.deskWood },
  scroll: { flexGrow: 1, padding: space.lg },
  center: { justifyContent: 'center' },
  inner: { width: '100%', alignSelf: 'center', gap: space.lg },
});
