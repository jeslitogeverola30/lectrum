import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from './services/supabase.js';
import LoginScreen from './app/auth/sign_in';
import SignUpScreen from './app/auth/sign_up';

export default function App() {
  const [session, setSession] = useState(null);
  const [authScreen, setAuthScreen] = useState('login');

  useEffect(() => {
    // Check for an existing session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth state changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!session) {
    return authScreen === 'login' ? (
      <LoginScreen onSignUpPress={() => setAuthScreen('signup')} />
    ) : (
      <SignUpScreen onLoginPress={() => setAuthScreen('login')} />
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.welcomeText}>Welcome to the Lobby!</Text>
      <Text style={styles.userText}>{session.user.email}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  userText: {
    marginTop: 10,
    fontSize: 16,
    color: 'gray',
  }
});