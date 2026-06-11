import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Desk, BookPage, InkButton, ChoiceLine, PaperNote, NoteText } from '../../components';
import { colors, space, type } from '../../theme';
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
    <Desk center maxWidth={460}>
      <BookPage>
        <Text style={styles.brand}>ShufferC</Text>
        <Text style={styles.sub}>AI Chronicles</Text>
        <View style={styles.tabs}>
          <InkButton label={mode === 'login' ? '● log in' : 'log in'} onPress={() => switchMode('login')} />
          <InkButton label={mode === 'register' ? '● register' : 'register'} onPress={() => switchMode('register')} />
        </View>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.inkFaded}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.inkFaded}
          secureTextEntry
          value={pw}
          onChangeText={setPw}
        />
        {mode === 'register' && (
          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            placeholderTextColor={colors.inkFaded}
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
          />
        )}
        {error && (
          <PaperNote tone="pink" tilt={-1}>
            <NoteText>{error}</NoteText>
          </PaperNote>
        )}
        <ChoiceLine text={mode === 'login' ? 'Open the book' : 'Begin a new book'} onPress={submit} />
        <Text style={styles.hint}>A local sign-in for the demo — no data leaves your device.</Text>
      </BookPage>
    </Desk>
  );
}

const styles = StyleSheet.create({
  brand: { ...type.prose, fontSize: 30, lineHeight: 38, fontFamily: 'CrimsonPro_600SemiBold', color: colors.ink, textAlign: 'center' },
  sub: { ...type.handSmall, color: colors.inkFaded, textAlign: 'center' },
  tabs: { flexDirection: 'row', justifyContent: 'center', gap: space.lg },
  input: {
    backgroundColor: '#fdf6e7',
    borderWidth: 1,
    borderColor: colors.pageEdge,
    borderRadius: 4,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    color: colors.ink,
    fontSize: 16,
    fontFamily: 'CrimsonPro_400Regular',
  },
  hint: { ...type.handSmall, color: colors.inkFaded, textAlign: 'center' },
});
