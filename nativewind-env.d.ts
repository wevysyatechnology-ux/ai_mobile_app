/// <reference types="react-native" />

// Pragmatic shim: allows `className` on React Native components so TypeScript
// stops erroring on NativeWind-style calls in the codebase.
// NativeWind is not actually installed; className strings do nothing at runtime.
// Remove this file once NativeWind is added, or the className usages are
// rewritten to StyleSheet.
import 'react-native';

declare module 'react-native' {
  interface ViewProps {
    className?: string;
  }
  interface TextProps {
    className?: string;
  }
  interface ImageProps {
    className?: string;
  }
  interface ScrollViewProps {
    className?: string;
  }
  interface PressableProps {
    className?: string;
  }
  interface TextInputProps {
    className?: string;
  }
  interface SwitchProps {
    className?: string;
  }
  interface FlatListProps<ItemT> {
    className?: string;
  }
}
