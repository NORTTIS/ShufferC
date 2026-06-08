import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors, type } from '../theme';

type Level = 'display' | 'title' | 'heading';

export function Heading({ children, level = 'title' }: { children: React.ReactNode; level?: Level }) {
  return <Text style={[styles.base, styles[level]]}>{children}</Text>;
}

const styles = StyleSheet.create({
  base: { color: colors.gold },
  display: type.display,
  title: type.title,
  heading: type.heading,
});
