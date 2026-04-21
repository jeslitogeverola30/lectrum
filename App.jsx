import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { supabase } from './services/supabase.js';
import LoginScreen from './app/auth/sign_in';
import SignUpScreen from './app/auth/sign_up';
import CreateQuiz from './components/create_quiz.jsx';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error('Add your Clerk Publishable Key to the .env file');
}

function AppContent() {
  const [session, setSession] = useState(null);
  const [authScreen, setAuthScreen] = useState('login');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const cardTranslateY = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;

  const cardAnimatedStyle = useMemo(
    () => ({
      transform: [{ translateY: cardTranslateY }],
      opacity: cardOpacity,
    }),
    [cardOpacity, cardTranslateY]
  );

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

  const switchAuthScreen = (targetScreen) => {
    if (targetScreen === authScreen || isTransitioning) {
      return;
    }

    setIsTransitioning(true);

    Animated.parallel([
      Animated.timing(cardTranslateY, {
        toValue: -40,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setAuthScreen(targetScreen);
      cardTranslateY.setValue(40);
      cardOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(cardTranslateY, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsTransitioning(false);
      });
    });
  };

  if (!session) {
    return authScreen === 'login' ? (
      <LoginScreen
        onSignUpPress={() => switchAuthScreen('signup')}
        cardAnimatedStyle={cardAnimatedStyle}
      />
    ) : (
      <SignUpScreen
        onLoginPress={() => switchAuthScreen('login')}
        cardAnimatedStyle={cardAnimatedStyle}
      />
    );
  }

  return <CreateQuiz session={session} />;
}

export default function App() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <AppContent />
    </ClerkProvider>
  );
}

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   welcomeText: {
//     fontSize: 24,
//     fontWeight: 'bold',
//   },
//   userText: {
//     marginTop: 10,
//     fontSize: 16,
//     color: 'gray',
//   }
// });