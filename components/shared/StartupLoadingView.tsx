import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight } from 'lucide-react-native';
import DevelopedByFooter from '@/components/shared/DevelopedByFooter';

interface Props {
  onEnter?: () => void;
}

/**
 * Opening/welcome screen — static composition with a tap-to-enter CTA.
 * Replaces the old auto-advancing loading spinner.
 */
export default function StartupLoadingView({ onEnter }: Props) {
  const haloPulse = useRef(new Animated.Value(0)).current;
  const orbitRotate = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const halo = Animated.loop(
      Animated.sequence([
        Animated.timing(haloPulse, {
          toValue: 1,
          duration: 2250,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(haloPulse, {
          toValue: 0,
          duration: 2250,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    const orbit = Animated.loop(
      Animated.timing(orbitRotate, {
        toValue: 1,
        duration: 28000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    halo.start();
    orbit.start();

    return () => {
      halo.stop();
      orbit.stop();
    };
  }, [fadeIn, haloPulse, orbitRotate]);

  const haloScale = haloPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.04],
  });
  const haloOpacity = haloPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.78, 1],
  });
  const rotate = orbitRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.root}>
      {/* Radial ambient background */}
      <LinearGradient
        colors={['rgba(52,211,153,0.18)', 'rgba(13,57,52,0.45)', '#14231F']}
        locations={[0, 0.45, 0.85]}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea}>
        <Animated.View style={[styles.container, { opacity: fadeIn }]}>
          {/* Top edition label */}
          <View style={styles.header}>
            <Text style={styles.editionLabel}>WEVYSYA · AI PLATFORM</Text>
          </View>

          {/* Emblem: orbital rings + medallion + logo */}
          <View style={styles.emblemBlock}>
            <View style={styles.emblem}>
              {/* Outer halo ring (pulsing) */}
              <Animated.View
                style={[
                  styles.haloRing,
                  { opacity: haloOpacity, transform: [{ scale: haloScale }] },
                ]}
              />
              {/* Middle dashed ring with orbiting dots */}
              <Animated.View style={[styles.orbitRing, { transform: [{ rotate }] }]}>
                <View style={[styles.orbitDot, styles.orbitDotTop]} />
                <View style={[styles.orbitDot, styles.orbitDotBottom]} />
              </Animated.View>
              {/* Inner medallion */}
              <View style={styles.medallionShadow}>
                <LinearGradient
                  colors={['rgba(13,57,52,0.88)', 'rgba(20,35,31,0.96)']}
                  style={styles.medallion}
                >
                  <Image
                    source={require('@/assets/images/wevysya_logo_r.png')}
                    style={styles.logo}
                    resizeMode="contain"
                  />
                </LinearGradient>
              </View>
            </View>

            {/* Wordmark + divider + tagline */}
            <View style={styles.wordmarkBlock}>
              <Text style={styles.wordmark}>WE VYSYA</Text>
              <LinearGradient
                colors={['#045C00', '#34D399', '#045C00']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.wordmarkDivider}
              />
              <Text style={styles.tagline}>Stop Thinking I, Start Thinking We!</Text>
            </View>
          </View>

          {/* Bottom glass launch card */}
          <View style={styles.footer}>
            <View style={styles.launchCard}>
              <Text style={styles.cardCopy}>
                Your entrepreneurial network, events, and links in one intelligent space.
              </Text>

              <Pressable
                onPress={onEnter}
                style={({ pressed }) => [
                  styles.ctaWrapper,
                  pressed && styles.ctaPressed,
                ]}
              >
                <LinearGradient
                  colors={['#045C00', '#0D3934', '#317559']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.cta}
                >
                  <Text style={styles.ctaText}>Enter WeVysya</Text>
                  <ArrowRight size={16} color="#FFFFFF" strokeWidth={2.2} />
                </LinearGradient>
              </Pressable>

              <Text style={styles.website}>www.wevysya.com</Text>
            </View>
            <DevelopedByFooter prominent />
          </View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const EMBLEM_SIZE = 316;
const MEDALLION_SIZE = 184;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#14231F',
  },
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  header: {
    alignItems: 'center',
    paddingTop: 8,
  },
  editionLabel: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    letterSpacing: 2.5,
    color: '#34D399',
    textTransform: 'uppercase',
  },
  emblemBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  emblem: {
    width: EMBLEM_SIZE,
    height: EMBLEM_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloRing: {
    position: 'absolute',
    width: EMBLEM_SIZE,
    height: EMBLEM_SIZE,
    borderRadius: EMBLEM_SIZE / 2,
    borderWidth: 1,
    borderColor: 'rgba(49,117,89,0.4)',
    shadowColor: '#34D399',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 22,
    elevation: 8,
  },
  orbitRing: {
    position: 'absolute',
    width: EMBLEM_SIZE - 44,
    height: EMBLEM_SIZE - 44,
    borderRadius: (EMBLEM_SIZE - 44) / 2,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(52,211,153,0.28)',
  },
  orbitDot: {
    position: 'absolute',
    borderRadius: 999,
  },
  orbitDotTop: {
    width: 12,
    height: 12,
    backgroundColor: '#34D399',
    top: -6,
    left: '50%',
    marginLeft: -6,
    shadowColor: '#34D399',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 4,
  },
  orbitDotBottom: {
    width: 8,
    height: 8,
    backgroundColor: '#317559',
    bottom: -4,
    left: '50%',
    marginLeft: -4,
  },
  medallionShadow: {
    shadowColor: '#34D399',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 32,
    elevation: 12,
  },
  medallion: {
    width: MEDALLION_SIZE,
    height: MEDALLION_SIZE,
    borderRadius: MEDALLION_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(52,211,153,0.55)',
  },
  logo: {
    width: 128,
    height: 128,
  },
  wordmarkBlock: {
    alignItems: 'center',
    gap: 8,
  },
  wordmark: {
    fontFamily: 'Poppins-Bold',
    fontSize: 28,
    letterSpacing: 6,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  wordmarkDivider: {
    width: 64,
    height: 4,
    borderRadius: 2,
    marginTop: 4,
  },
  tagline: {
    fontFamily: 'Poppins-Medium',
    fontSize: 18,
    lineHeight: 26,
    color: '#34D399',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
  },
  footer: {
    paddingTop: 8,
  },
  launchCard: {
    backgroundColor: 'rgba(13,57,52,0.75)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(49,117,89,0.6)',
    padding: 24,
    gap: 16,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.4,
    shadowRadius: 36,
    elevation: 8,
  },
  cardCopy: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    lineHeight: 22,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  ctaWrapper: {
    width: '100%',
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#34D399',
    shadowColor: '#34D399',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 6,
  },
  ctaPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  ctaText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    letterSpacing: 0.3,
    color: '#FFFFFF',
  },
  website: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: '#34D399',
  },
});
