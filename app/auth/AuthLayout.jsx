import { Animated, View, Text, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import styles from '../../styles/auth/auth_styles.js';

const AuthLayout = ({
  cardAnimatedStyle,
  cardStyle,
  title,
  subtitle,
  topText,
  linkText,
  onLinkPress,
  children,
}) => {
  const showLinkRow = topText && linkText && onLinkPress;

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'top']}>
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

        <Animated.View style={[cardStyle, cardAnimatedStyle]}>
          <Text style={styles.authTitle}>{title}</Text>
          {subtitle ? <Text style={styles.authSubtitle}>{subtitle}</Text> : null}

          {showLinkRow ? (
            <View style={styles.authLinkRow}>
              <Text style={styles.authLinkText}>{topText} </Text>
              <TouchableOpacity onPress={onLinkPress}>
                <Text style={styles.authLink}>{linkText}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {children}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
};

export default AuthLayout;
