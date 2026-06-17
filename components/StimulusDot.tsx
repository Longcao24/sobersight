import { Animated, StyleSheet, View } from 'react-native';
import { COLORS, DOT_SIZE } from '@/lib/theme';

// Teal stimulus dot with a soft glow. Rendered inside an Animated.View by the
// gaze runners (which supply the transform), or statically centered for PLR.

export function StimulusDotStatic() {
  return (
    <View style={styles.glow}>
      <View style={styles.dot} />
    </View>
  );
}

// Animated wrapper — caller passes a transform style for movement.
export function StimulusDotAnimated({ style }: { style: Animated.WithAnimatedValue<object> }) {
  return (
    <Animated.View style={[styles.glow, styles.absolute, style]}>
      <View style={styles.dot} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  absolute: {
    position: 'absolute',
  },
  glow: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Soft glow.
    shadowColor: COLORS.accent,
    shadowOpacity: 0.9,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 16,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: COLORS.accent,
  },
});
