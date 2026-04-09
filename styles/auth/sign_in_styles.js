import { StyleSheet, Dimensions } from 'react-native';

const { height } = Dimensions.get('window');

export const Colors = {
  primary: '#8BBDD1',
  accent: '#F07167',
  gold: '#E9B464',
  white: '#FFFFFF',
  lightGray: '#F5F5F5',
  darkGray: '#666666',
  textDark: '#1A1A1A',
  borderColor: '#E8E8E8',
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.accent,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
  flexSpacer: {
    flex: 1,
  },
  headerSection: {
    height: height * 0.26,
    marginHorizontal: -16,
    marginTop: -16,
  },
  headerBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 50,
    overflow: 'visible',
    position: 'relative',
  },
  logoImage: {
    width: 225,
    height: 225,
  },
  decorativeElements: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  decShape: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: Colors.gold,
    opacity: 0.3,
  },
  loginCard: {
    backgroundColor: Colors.white,
    borderRadius: 35,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    marginHorizontal: -16,
    marginTop: 45,
    zIndex: 10,
    flex: 1,
  },
  loginTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.gold,
    textAlign: 'center',
    marginBottom: 12,
  },
  signUpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 28,
  },
  signUpText: {
    fontSize: 14,
    color: Colors.darkGray,
    fontWeight: '500',
  },
  signUpLink: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '700',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.lightGray,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.textDark,
    fontWeight: '500',
  },
  checkboxContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderColor: Colors.borderColor,
    marginRight: 8,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  checkboxChecked: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  checkboxInner: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: Colors.white,
  },
  rememberMeText: {
    fontSize: 14,
    color: Colors.darkGray,
    fontWeight: '500',
  },
  forgotPasswordText: {
    fontSize: 14,
    color: Colors.textDark,
    fontWeight: '700',
  },
  loginButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
    marginBottom: 24,
    elevation: 5,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.borderColor,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 14,
    color: Colors.darkGray,
    fontWeight: '500',
  },
  socialContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  facebookButton: {
    flex: 1,
    backgroundColor: '#1877F2',
    paddingVertical: 14,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  facebookButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  googleButton: {
    flex: 1,
    backgroundColor: Colors.lightGray,
    paddingVertical: 14,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.borderColor,
  },
  socialIcon: {
    width: 20,
    height: 20,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textDark,
  },
});

export default styles;