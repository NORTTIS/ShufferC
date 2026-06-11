import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { colors, type } from '../theme';
import { useTypewriter } from '../hooks/useTypewriter';

/** Story prose. animate=true writes it out with an ink cursor; tap reveals everything. */
export function InkProse({
  children, animate = false, faded = false,
}: {
  children: string;
  animate?: boolean;
  faded?: boolean;
}) {
  const { shown, done, skip } = useTypewriter(children, { enabled: animate });
  const body = (
    <Text style={[styles.prose, faded && styles.faded]}>
      {animate ? shown : children}
      {animate && !done ? <Text style={styles.cursor}>▍</Text> : null}
    </Text>
  );
  if (!animate || done) return body;
  return <Pressable onPress={skip}>{body}</Pressable>;
}

const styles = StyleSheet.create({
  prose: { ...type.prose, color: colors.ink },
  faded: { color: colors.inkFaded },
  cursor: { color: colors.inkAccent },
});
