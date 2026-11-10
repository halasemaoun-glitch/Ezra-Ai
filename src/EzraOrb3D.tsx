import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

type OrbStatus = { status: string; level?: number };

/**
 * Native-view 3D-style EZRA orb.
 * Uses only React Native transforms/opacity with the native animation driver:
 * no WebGL context, canvas, or extra runtime dependency during app startup.
 */
export default function EzraOrb3D({ status, level = 0 }: OrbStatus) {
  const listening = status.includes('يستمع');
  const thinking = status.includes('أفكر');
  const speaking = status.includes('يتحدث');
  const active = listening || thinking || speaking;

  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1,
        duration: speaking ? 480 : listening ? 620 : thinking ? 900 : 1550,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        toValue: 0,
        duration: speaking ? 480 : listening ? 620 : thinking ? 900 : 1550,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]));
    const spinLoop = Animated.loop(Animated.timing(spin, {
      toValue: 1,
      duration: speaking ? 5200 : listening ? 7600 : 14500,
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    const tiltLoop = Animated.loop(Animated.sequence([
      Animated.timing(tilt, { toValue: 1, duration: 3100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(tilt, { toValue: -1, duration: 6200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(tilt, { toValue: 0, duration: 3100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    const shimmerLoop = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 1, duration: 1750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(shimmer, { toValue: 0, duration: 1750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    const breatheLoop = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));

    pulseLoop.start();
    spinLoop.start();
    tiltLoop.start();
    shimmerLoop.start();
    breatheLoop.start();
    return () => {
      [pulseLoop, spinLoop, tiltLoop, shimmerLoop, breatheLoop].forEach(loop => loop.stop());
      [pulse, spin, tilt, shimmer, breathe].forEach(value => value.stopAnimation());
    };
  }, [pulse, spin, tilt, shimmer, breathe, speaking, listening, thinking]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, active ? 1.045 + Math.min(0.02, level * 0.02) : 1.018] });
  const spinForward = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const spinBackward = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  const tiltX = tilt.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-17deg', '0deg', '17deg'] });
  const tiltY = tilt.interpolate({ inputRange: [-1, 0, 1], outputRange: ['12deg', '0deg', '-12deg'] });
  const shineX = shimmer.interpolate({ inputRange: [0, 1], outputRange: ['-34deg', '34deg'] });
  const shineOpacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.42] });
  const haloOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.16, active ? 0.43 : 0.28] });
  const coreColor = thinking ? '#25103D' : speaking ? '#570B3A' : '#350A2B';
  const accent = thinking ? '#9B70FF' : speaking ? '#FF65BD' : '#E344A8';

  return (
    <View style={styles.stage}>
      <Animated.View pointerEvents="none" style={[styles.halo, { opacity: haloOpacity, transform: [{ scale }] }]} />
      <Animated.View pointerEvents="none" style={[styles.haloSoft, { opacity: haloOpacity }]} />

      <Animated.View pointerEvents="none" style={[styles.orbitBack, { transform: [{ rotate: spinBackward }, { scaleY: 0.58 }] }]} />
      <Animated.View pointerEvents="none" style={[styles.orbitBackFine, { transform: [{ rotate: spinForward }, { scaleY: 0.74 }] }]} />

      <Animated.View style={[styles.sphereAssembly, { transform: [{ perspective: 900 }, { rotateX: tiltX }, { rotateY: tiltY }, { scale }] }]}>
        <View style={[styles.sphereShadow, { backgroundColor: accent }]} />
        <View style={[styles.sphere, { backgroundColor: coreColor, borderColor: accent, shadowColor: accent }]}>
          <View style={styles.sphereDepth} />
          <View style={styles.sphereLowerShade} />
          <Animated.View style={[styles.gloss, { opacity: shineOpacity, transform: [{ rotate: shineX }] }]} />
          <Animated.View style={[styles.surfaceArc, styles.surfaceArcOne, { transform: [{ rotate: spinForward }, { scaleY: 0.42 }] }]} />
          <Animated.View style={[styles.surfaceArc, styles.surfaceArcTwo, { transform: [{ rotate: spinBackward }, { scaleY: 0.72 }] }]} />
          <View style={styles.highlightLarge} />
          <View style={styles.highlightSmall} />
          <View style={styles.innerCore}>
            <View style={[styles.innerCoreGlow, { backgroundColor: accent }]} />
          </View>
        </View>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.orbitFront, { transform: [{ rotate: spinForward }, { scaleY: 0.46 }] }]} />
      <Animated.View pointerEvents="none" style={[styles.orbitFrontFine, { transform: [{ rotate: spinBackward }, { scaleY: 0.78 }] }]} />

      <View pointerEvents="none" style={styles.particles}>
        <View style={[styles.particle, styles.particleA, { backgroundColor: '#FFD0F0' }]} />
        <View style={[styles.particle, styles.particleB, { backgroundColor: '#B9A0FF' }]} />
        <View style={[styles.particle, styles.particleC, { backgroundColor: '#FF79C9' }]} />
        <View style={[styles.particle, styles.particleD, { backgroundColor: '#D8C4FF' }]} />
        <View style={[styles.particle, styles.particleE, { backgroundColor: '#FFB5E2' }]} />
        <View style={[styles.particle, styles.particleF, { backgroundColor: '#A98AFF' }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', height: 344, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  halo: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: '#B51C82', shadowColor: '#EC45B5', shadowOpacity: 1, shadowRadius: 46, elevation: 18 },
  haloSoft: { position: 'absolute', width: 306, height: 306, borderRadius: 153, borderWidth: 1, borderColor: 'rgba(195,83,255,0.2)' },
  orbitBack: { position: 'absolute', width: 280, height: 130, borderRadius: 140, borderWidth: 1.2, borderColor: 'rgba(172,112,255,0.66)' },
  orbitBackFine: { position: 'absolute', width: 242, height: 110, borderRadius: 121, borderWidth: 1, borderColor: 'rgba(255,170,224,0.32)' },
  sphereAssembly: { width: 210, height: 210, alignItems: 'center', justifyContent: 'center' },
  sphereShadow: { position: 'absolute', width: 190, height: 190, borderRadius: 95, opacity: 0.2, shadowOpacity: 1, shadowRadius: 36, elevation: 22 },
  sphere: { width: 184, height: 184, borderRadius: 92, borderWidth: 1.5, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.95, shadowRadius: 34, shadowOffset: { width: 0, height: 0 }, elevation: 24 },
  sphereDepth: { position: 'absolute', width: 168, height: 168, borderRadius: 84, borderWidth: 1, borderTopColor: 'rgba(255,222,246,0.35)', borderLeftColor: 'rgba(255,160,220,0.14)', borderRightColor: 'rgba(122,65,190,0.42)', borderBottomColor: 'rgba(8,2,17,0.78)' },
  sphereLowerShade: { position: 'absolute', width: 184, height: 104, bottom: -30, borderRadius: 92, backgroundColor: 'rgba(7,2,16,0.58)' },
  gloss: { position: 'absolute', width: 54, height: 230, top: -24, left: 62, borderRadius: 40, backgroundColor: 'rgba(255,202,239,0.48)' },
  surfaceArc: { position: 'absolute', width: 170, height: 150, borderRadius: 90, borderWidth: 1 },
  surfaceArcOne: { borderColor: 'rgba(255,153,218,0.42)' },
  surfaceArcTwo: { width: 148, height: 170, borderColor: 'rgba(168,124,255,0.42)' },
  highlightLarge: { position: 'absolute', width: 78, height: 40, borderRadius: 40, top: 18, left: 30, backgroundColor: 'rgba(255,226,246,0.18)', transform: [{ rotate: '-32deg' }] },
  highlightSmall: { position: 'absolute', width: 30, height: 14, borderRadius: 14, top: 25, left: 47, backgroundColor: 'rgba(255,255,255,0.3)', transform: [{ rotate: '-32deg' }] },
  innerCore: { width: 92, height: 92, borderRadius: 46, borderWidth: 1, borderColor: 'rgba(255,191,231,0.22)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(210,45,153,0.12)' },
  innerCoreGlow: { width: 42, height: 42, borderRadius: 21, opacity: 0.18 },
  orbitFront: { position: 'absolute', width: 266, height: 116, borderRadius: 133, borderWidth: 1.5, borderColor: 'rgba(255,118,202,0.84)' },
  orbitFrontFine: { position: 'absolute', width: 226, height: 94, borderRadius: 113, borderWidth: 1, borderColor: 'rgba(236,187,255,0.28)' },
  particles: { ...StyleSheet.absoluteFillObject },
  particle: { position: 'absolute', width: 5, height: 5, borderRadius: 3, shadowColor: '#F06AB8', shadowOpacity: 0.95, shadowRadius: 9, elevation: 6 },
  particleA: { top: 40, left: '49%' },
  particleB: { top: '35%', right: '13%', width: 4, height: 4 },
  particleC: { top: '32%', left: '12%', width: 4, height: 4 },
  particleD: { bottom: 44, right: '25%', width: 3, height: 3 },
  particleE: { bottom: 54, left: '24%', width: 3, height: 3 },
  particleF: { top: '58%', right: '9%', width: 3, height: 3 },
});
