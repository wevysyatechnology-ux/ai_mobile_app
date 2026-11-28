import { Image, StyleSheet, Text, View, ViewStyle } from 'react-native';

interface Props {
  /** Optional outer style (e.g. extra margin) */
  style?: ViewStyle;
  /** Make the footer a bit more prominent (splash/auth screens) */
  prominent?: boolean;
}

/**
 * "Developed by Yaadvi AI Labs" attribution.
 * Designed to sit at the end of a screen's scroll content, or at the bottom
 * of an auth screen. The Yaadvi mark is tinted white so it reads on the
 * app's dark background.
 */
export default function DevelopedByFooter({ style, prominent = false }: Props) {
  return (
    <View style={[styles.wrapper, prominent && styles.wrapperProminent, style]}>
      <Text style={[styles.label, prominent && styles.labelProminent]}>
        Developed by
      </Text>
      <Image
        source={require('@/assets/images/yaadvi_ai_labs.webp')}
        style={[styles.logo, prominent && styles.logoProminent]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    opacity: 0.55,
  },
  wrapperProminent: {
    opacity: 0.85,
    paddingVertical: 20,
  },
  label: {
    fontFamily: 'Poppins-Regular',
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#FFFFFF',
  },
  labelProminent: {
    fontSize: 11,
  },
  // The source image is black-on-white. Tint it to white and let the parent opacity mute it.
  logo: {
    width: 84,
    height: 20,
    tintColor: '#FFFFFF',
  },
  logoProminent: {
    width: 110,
    height: 26,
  },
});
