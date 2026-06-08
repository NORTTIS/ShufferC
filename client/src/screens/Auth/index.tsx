import React, { useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { Screen, Card, Button, Heading, Prose, Label, Banner, Divider } from '../../components';
import { colors, radii, space } from '../../theme';
import type { AuthResult } from '../../auth/authCore';

export function AuthScreen({
  onLogin, onRegister,
}: {
  onLogin: (email: string, pw: string) => AuthResult;
  onRegister: (email: string, pw: string, confirm: string) => AuthResult;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const switchMode = (m: 'login' | 'register') => { setMode(m); setError(null); };
  const submit = () => {
    const res = mode === 'login' ? onLogin(email, pw) : onRegister(email, pw, confirm);
    if (!res.ok) setError(res.error);
  };

  return (
    <Screen center>
      <View style={styles.brand}>
        <Heading level="display">ShufferC</Heading>
        <Label>AI Chronicles</Label>
      </View>
      <Divider />
      <Card>
        <View style={styles.tabs}>
          <View style={styles.tab}>
            <Button label="Log in" variant={mode === 'login' ? 'primary' : 'ghost'} onPress={() => switchMode('login')} />
          </View>
          <View style={styles.tab}>
            <Button label="Register" variant={mode === 'register' ? 'primary' : 'ghost'} onPress={() => switchMode('register')} />
          </View>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.inkMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.inkMuted}
          secureTextEntry
          value={pw}
          onChangeText={setPw}
        />
        {mode === 'register' && (
          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            placeholderTextColor={colors.inkMuted}
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
          />
        )}
        {error && <Banner text={error} tone="danger" />}
        <Button label={mode === 'login' ? 'Enter' : 'Create'} onPress={submit} />
      </Card>
      <Prose>A local sign-in for the demo — no data leaves your device.</Prose>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: space.xs },
  tabs: { flexDirection: 'row', gap: space.sm },
  tab: { flex: 1 },
  input: {
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.goldDim,
    borderRadius: radii.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    color: colors.inkPrimary,
    fontSize: 16,
  },
});
