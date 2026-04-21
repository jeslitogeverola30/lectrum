import { useState } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useSignIn } from '@clerk/expo';
import { useRouter } from 'expo-router';
import AuthLayout from './AuthLayout';
import styles, { Colors } from '../../styles/auth/auth_styles.js';
import useSocialOAuth from './useSocialOAuth';



const LoginScreen = ({ onSignUpPress, cardAnimatedStyle }) => {
  const router = useRouter();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const handleSignUpPress = onSignUpPress ?? (() => router.push('/auth/sign_up'));
  const { activeProvider, startOAuth } = useSocialOAuth();

  const { signIn, errors, fetchStatus } = useSignIn();
  const { isSignedIn } = useAuth();

  if (signIn.status === 'complete' || isSignedIn) {
    return null;
  }

  const handleSubmit = async () => {
    const { error } = await signIn.password({
      emailAddress,
      password,
    });

    if (error) {
      console.error(JSON.stringify(error, null, 2));
      return;
    }

    if (signIn.status === 'complete') {
      await signIn.finalize({
        navigate: ({ session, decorateUrl }) => {
          if (session?.currentTask) {
            console.log(session?.currentTask);
            return;
          }

          const url = decorateUrl('/');
          router.replace(url);
        },
      });
    } else if (signIn.status === 'needs_second_factor') {
      // See Clerk docs for MFA flows.
    } else if (signIn.status === 'needs_client_trust') {
      const emailCodeFactor = signIn.supportedSecondFactors.find(
        (factor) => factor.strategy === 'email_code'
      );

      if (emailCodeFactor) {
        await signIn.mfa.sendEmailCode();
      }
    } else {
      console.error('Sign-in attempt not complete:', signIn);
    }
  };

  const handleVerify = async () => {
    await signIn.mfa.verifyEmailCode({
      code,
    });

    if (signIn.status === 'complete') {
      await signIn.finalize({
        navigate: ({ session, decorateUrl }) => {
          if (session?.currentTask) {
            console.log(session?.currentTask);
            return;
          }

          const url = decorateUrl('/');
          router.replace(url);
        },
      });
    } else {
      console.error('Sign-in attempt not complete:', signIn);
    }
  };

  if (signIn.status === 'needs_client_trust') {
    return (
      <AuthLayout
        cardAnimatedStyle={cardAnimatedStyle}
        cardStyle={styles.loginCard}
        title="Verify your account"
        subtitle="Enter the code we sent to your email"
      >
        <View style={styles.inputContainer}>
          <Ionicons name="mail" size={20} color={Colors.darkGray} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            value={code}
            placeholder="Enter your verification code"
            placeholderTextColor={Colors.darkGray}
            onChangeText={setCode}
            keyboardType="numeric"
          />
        </View>

        {errors.fields.code ? (
          <Text style={styles.forgotPasswordText}>{errors.fields.code.message}</Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.loginButton,
            fetchStatus === 'fetching' && styles.checkboxChecked,
            pressed && styles.checkboxChecked,
          ]}
          onPress={handleVerify}
          disabled={fetchStatus === 'fetching'}
        >
          <Text style={styles.loginButtonText}>Verify</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.forgotPasswordText, pressed && styles.checkboxChecked]}
          onPress={() => signIn.mfa.sendEmailCode()}
        >
          <Text style={styles.forgotPasswordText}>I need a new code</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.forgotPasswordText, pressed && styles.checkboxChecked]}
          onPress={() => signIn.reset()}
        >
          <Text style={styles.forgotPasswordText}>Start over</Text>
        </Pressable>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      cardAnimatedStyle={cardAnimatedStyle}
      cardStyle={styles.loginCard}
      title="Login"
      topText="Don't Have An Account?"
      linkText="Sign Up"
      onLinkPress={handleSignUpPress}
    >
      <View style={styles.inputContainer}>
        <Ionicons name="mail" size={20} color={Colors.darkGray} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Enter your email address"
          placeholderTextColor={Colors.darkGray}
          value={emailAddress}
          onChangeText={setEmailAddress}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      {errors.fields.identifier ? (
        <Text style={styles.forgotPasswordText}>{errors.fields.identifier.message}</Text>
      ) : null}

      <View style={styles.inputContainer}>
        <Ionicons name="lock-closed" size={20} color={Colors.darkGray} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Enter your password"
          placeholderTextColor={Colors.darkGray}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
        />
      </View>

      {errors.fields.password ? (
        <Text style={styles.forgotPasswordText}>{errors.fields.password.message}</Text>
      ) : null}

      <View style={styles.checkboxContainer}>
        <View style={styles.rememberMeContainer}>
          <TouchableOpacity
            style={[styles.checkbox, rememberMe && styles.checkboxChecked]}
            onPress={() => setRememberMe((currentValue) => !currentValue)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: rememberMe }}
          >
            {rememberMe ? <View style={styles.checkboxInner} /> : null}
          </TouchableOpacity>
          <Text style={styles.rememberMeText}>Remember Me</Text>
        </View>
        <TouchableOpacity>
          <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
        </TouchableOpacity>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.loginButton,
          (!emailAddress || !password || fetchStatus === 'fetching') && styles.checkboxChecked,
          pressed && styles.checkboxChecked,
        ]}
        onPress={handleSubmit}
        disabled={!emailAddress || !password || fetchStatus === 'fetching'}
      >
        <Text style={styles.loginButtonText}>Login</Text>
      </Pressable>

      <View style={styles.dividerContainer}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>Or Continue With</Text>
        <View style={styles.divider} />
      </View>

      <View style={styles.socialContainer}>
        <TouchableOpacity
          style={styles.facebookButton}
          onPress={() => startOAuth('facebook')}
          disabled={activeProvider !== null}
        >
          <Ionicons name="logo-facebook" size={20} color={Colors.white} />
          <Text style={styles.facebookButtonText}>Facebook</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.googleButton}
          onPress={() => startOAuth('google')}
          disabled={activeProvider !== null}
        >
          <Image
            source={require('../../assets/logo/google_logo.png')}
            style={styles.socialIcon}
            resizeMode="contain"
          />
          <Text style={styles.googleButtonText}>Google</Text>
        </TouchableOpacity>
      </View>

      <View nativeID="clerk-captcha" />
    </AuthLayout>
  );
};

export default LoginScreen;
