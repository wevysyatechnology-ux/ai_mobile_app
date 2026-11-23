import { useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/constants/theme';

interface FloatingLogoProps {
  size?: 'small' | 'medium' | 'large';
}

const SIZES = {
  small: { width: 100, height: 32 },
  medium: { width: 160, height: 52 },
  large: { width: 200, height: 66 },
};

export default function FloatingLogo({ size = 'medium' }: FloatingLogoProps) {
  // The logo itself stays still on every tab; only the glow breathes slowly.
  // (It used to bob and scale on a loop, which made each page feel restless.)
  const glowOpacity = useSharedValue(0.4);

  useEffect(() => {
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 3000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const dimensions = SIZES[size];

  return (
    <Animated.View style={styles.container}>
      <Animated.View style={[styles.glowContainer, glowStyle]}>
        <LinearGradient
          colors={[
            'rgba(110, 231, 183, 0.3)',
            'rgba(52, 211, 153, 0.2)',
            'transparent'
          ]}
          style={[styles.glow, { width: dimensions.width * 1.5, height: dimensions.height * 1.5 }]}
        />
      </Animated.View>
      <Image
        source={require('@/assets/images/wevysya_logo_r.png')}
        style={[styles.logo, dimensions]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    borderRadius: 9999,
  },
  logo: {
    opacity: 1,
  },
});
