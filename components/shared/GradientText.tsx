import { useState } from 'react';
import { Text, TextStyle, View, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { colors } from '@/constants/theme';

interface GradientTextProps {
  children: string;
  style?: TextStyle;
  colors?: readonly [string, string, ...string[]];
}

export default function GradientText({
  children,
  style,
  colors: gradientColors = [colors.accent_green_glow, colors.accent_green_bright, colors.accent_green] as const
}: GradientTextProps) {
  const [width, setWidth] = useState(0);

  const fontSize = (style?.fontSize as number) ?? 24;
  const fontFamily = style?.fontFamily as string | undefined;
  const fontWeight = style?.fontWeight as TextStyle['fontWeight'] | undefined;
  const letterSpacing = style?.letterSpacing as number | undefined;
  const svgHeight = fontSize * 1.3;

  const handleLayout = (e: LayoutChangeEvent) => {
    const measuredWidth = e.nativeEvent.layout.width;
    if (measuredWidth && measuredWidth !== width) {
      setWidth(measuredWidth);
    }
  };

  return (
    <View style={styles.container}>
      {/* Invisible pass just to measure the rendered text width */}
      <Text style={[styles.text, style, styles.measure]} onLayout={handleLayout}>
        {children}
      </Text>

      {width > 0 && (
        // Small right-edge buffer: react-native-svg's SvgText can render this
        // custom bold font a few px wider than RN's own Text measurement
        // above (seen clipping the last character on iOS), and SVG clips
        // anything past its declared width by default. overflow="visible"
        // is a second safety net in case a glyph still runs past the buffer.
        <Svg width={width + 6} height={svgHeight} style={styles.svg} overflow="visible">
          <Defs>
            <SvgLinearGradient id="gradientTextFill" x1="0" y1="0" x2="1" y2="0">
              {gradientColors.map((c, i) => (
                <Stop key={i} offset={i / (gradientColors.length - 1)} stopColor={c} />
              ))}
            </SvgLinearGradient>
          </Defs>
          <SvgText
            x="0"
            y={fontSize}
            fontSize={fontSize}
            fontFamily={fontFamily}
            fontWeight={fontWeight}
            letterSpacing={letterSpacing}
            fill="url(#gradientTextFill)"
          >
            {children}
          </SvgText>
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: 'Poppins-Bold',
  },
  measure: {
    opacity: 0,
  },
  svg: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
