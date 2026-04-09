import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Dimensions,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import styles, { Colors } from '../../styles/auth/auth_styles.js';

const { height } = Dimensions.get('window');



const SignUpScreen = ({ onLoginPress }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right','top']}>
      <View style={styles.container}>
        <View style={styles.headerSection}>
          <View style={styles.headerBackground}>
            <Image
              source={require('../../assets/logo/lectrum_logo_noBG.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />

            <View style={styles.decorativeElements} pointerEvents="none">
              <View style={[styles.decShape, { top: '60%', right: '10%' }]} />
              <View style={[styles.decShape, { bottom: '15%', left: '8%' }]} />
            </View>
          </View>
        </View>

        <View style={styles.signupCard}>
          <Text style={styles.signupTitle}>Sign Up</Text>
          <Text style={styles.signupSubtitle}>Create your account to continue</Text>

          <View style={styles.signUpContainer}>
            <Text style={styles.signUpText}>Already Have An Account? </Text>
            <TouchableOpacity onPress={onLoginPress}>
              <Text style={styles.signUpLink}>Login</Text>
            </TouchableOpacity>
          </View>

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
              value={email}
              onChangeText={setEmail}
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

          <TouchableOpacity style={styles.signupButton}>
            <Text style={styles.signupButtonText}>Sign Up</Text>
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>Or Continue With</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.socialContainer}>
            <TouchableOpacity style={styles.facebookButton}>
              <Ionicons name="logo-facebook" size={20} color={Colors.white} />
              <Text style={styles.facebookButtonText}>Facebook</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.googleButton}>
              <Image
                source={require('../../assets/logo/google_logo.png')}
                style={styles.socialIcon}
                resizeMode="contain"
              />
              <Text style={styles.googleButtonText}>Google</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default SignUpScreen;
