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
import { useAuth, useSignUp } from '@clerk/expo';
import { useRouter } from 'expo-router';
import AuthLayout from './AuthLayout';
import styles, { Colors } from '../../styles/auth/auth_styles.js';
import useSocialOAuth from './useSocialOAuth';



const SignUpScreen = ({ onLoginPress, cardAnimatedStyle }) => {
  const { signUp, errors, fetchStatus } = useSignUp();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const handleLoginPress = onLoginPress ?? (() => router.push('/auth/sign_in'));
  const { activeProvider, startOAuth } = useSocialOAuth();

  if (signUp.status === 'complete' || isSignedIn) {
    return null;
  }

  const showVerificationStep =
    signUp.status === 'missing_requirements' &&
    signUp.unverifiedFields.includes('email_address') &&
    signUp.missingFields.length === 0;

  const handleSubmit = async () => {
    if (!acceptTerms || password !== confirmPassword) {
      return;
    }

    const { error } = await signUp.password({
      emailAddress,
      password,
    });

    if (error) {
      console.error(JSON.stringify(error, null, 2));
      return;
    }

    if (!error) {
      await signUp.verifications.sendEmailCode();
    }
  };

  const handleVerify = async () => {
    await signUp.verifications.verifyEmailCode({
      code,
    });

    if (signUp.status === 'complete') {
      await signUp.finalize({
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
      console.error('Sign-up attempt not complete:', signUp);
    }
  };

  if (showVerificationStep) {
    return (
      <AuthLayout
        cardAnimatedStyle={cardAnimatedStyle}
        cardStyle={styles.signupCard}
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
          <Text style={{ color: '#d32f2f', fontSize: 12, marginTop: -8 }}>
            {errors.fields.code.message}
          </Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.signupButton,
            fetchStatus === 'fetching' && styles.checkboxChecked,
            pressed && styles.checkboxChecked,
          ]}
          onPress={handleVerify}
          disabled={fetchStatus === 'fetching'}
        >
          <Text style={styles.signupButtonText}>Verify</Text>
        </Pressable>

        <TouchableOpacity onPress={() => signUp.verifications.sendEmailCode()}>
          <Text style={styles.googleButtonText}>I need a new code</Text>
        </TouchableOpacity>

        <View nativeID="clerk-captcha" />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      cardAnimatedStyle={cardAnimatedStyle}
      cardStyle={styles.signupCard}
      title="Sign Up"
      subtitle="Create your account to continue"
      topText="Already Have An Account?"
      linkText="Login"
      onLinkPress={handleLoginPress}
    >
      <View style={styles.inputContainer}>
        <Ionicons name="person" size={20} color={Colors.darkGray} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Enter your full name"
          placeholderTextColor={Colors.darkGray}
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
        />
      </View>

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

      <View style={styles.inputContainer}>
        <Ionicons name="lock-closed" size={20} color={Colors.darkGray} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Create a password"
          placeholderTextColor={Colors.darkGray}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.passwordToggle}
          onPress={() => setShowPassword((currentValue) => !currentValue)}
          accessibilityRole="button"
        >
          <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={Colors.darkGray} />
        </TouchableOpacity>
      </View>

      <View style={styles.inputContainer}>
        <Ionicons name="shield-checkmark" size={20} color={Colors.darkGray} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Re-enter your password"
          placeholderTextColor={Colors.darkGray}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showConfirmPassword}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.passwordToggle}
          onPress={() => setShowConfirmPassword((currentValue) => !currentValue)}
          accessibilityRole="button"
        >
          <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={20} color={Colors.darkGray} />
        </TouchableOpacity>
      </View>

      <View style={styles.checkboxContainer}>
        <View style={styles.rememberMeContainer}>
          <TouchableOpacity
            style={[styles.checkbox, acceptTerms && styles.checkboxChecked]}
            onPress={() => setAcceptTerms((currentValue) => !currentValue)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptTerms }}
          >
            {acceptTerms ? <View style={styles.checkboxInner} /> : null}
          </TouchableOpacity>
          <Text style={styles.rememberMeText}>I agree to the Terms and Privacy Policy</Text>
        </View>
      </View>

      {errors.fields.emailAddress ? (
        <Text style={{ color: '#d32f2f', fontSize: 12, marginTop: -8 }}>
          {errors.fields.emailAddress.message}
        </Text>
      ) : null}

      {errors.fields.password ? (
        <Text style={{ color: '#d32f2f', fontSize: 12, marginTop: -8 }}>
          {errors.fields.password.message}
        </Text>
      ) : null}

      {password !== confirmPassword && confirmPassword.length > 0 ? (
        <Text style={{ color: '#d32f2f', fontSize: 12, marginTop: -8 }}>
          Passwords do not match.
        </Text>
      ) : null}

      <Pressable
        style={({ pressed }) => [
          styles.signupButton,
          (!emailAddress || !password || !acceptTerms || fetchStatus === 'fetching') &&
            styles.checkboxChecked,
          pressed && styles.checkboxChecked,
        ]}
        onPress={handleSubmit}
        disabled={!emailAddress || !password || !acceptTerms || fetchStatus === 'fetching'}
      >
        <Text style={styles.signupButtonText}>Sign Up</Text>
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

export default SignUpScreen;
