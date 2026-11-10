import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

type OrbStatus = { status: string; level?: number };

/**
 * GPU-safe EZRA orb.
 *
 * The previous implementation mounted a Three.js WebGL Canvas on the very
 * first app render. Some Android 13 devices (including lower-memory Adreno
 * configurations) can terminate the process while creating the GL context,
 * before React Native has rendered the first screen. This native-view version
 * keeps the same burgundy/pink/purple glowing-orb identity without requiring
 * an OpenGL context during startup.
 */
export default function EzraOrb3D({ status, level = 0 }: OrbStatus) {
  const listening = status.includes('يستمع');
  const thinking = status.includes('أفكر');
  const speaking = status.includes('يتحدث');
  const active = listening || thinking || speaking;
  const pulse = useRef(new Animated.Value(0)).current;
  const rotation = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: speaking ? 520 : listening ? 680 : thinking ? 1050 : 1700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: speaking ? 520 : listening ? 680 : thinking ? 1050 : 1700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    const rotationLoop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: speaking ? 6500 : listening ? 9000 : 18000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.48, duration: 1200, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();
    rotationLoop.start();
    glowLoop.start();
    return () => {
      pulseLoop.stop();
      rotationLoop.stop();
      glowLoop.stop();
      pulse.stopAnimation();
      rotation.stopAnimation();
      glow.stopAnimation();
    };
  }, [pulse, rotation, glow, speaking, listening, thinking]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, active ? 1.055 + Math.min(0.025, level * 0.025) : 1.025] });
  const ringRotation = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const reverseRotation = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  const haloOpacity = glow.interpolate({ inputRange: [0.48, 1], outputRange: [0.12, active ? 0.34 : 0.22] });
  const coreColor = thinking ? '#28103F' : speaking ? '#5B0B3D' : '#3B0B29';
  const glowColor = thinking ? '#8A55FF' : speaking ? '#FF5DB8' : '#D92C91';

  return (
    <View style={styles.stage}>
      <Animated.View pointerEvents="none" style={[styles.outerHalo, { opacity: haloOpacity, transform: [{ scale }] }]} />
      <Animated.View pointerEvents="none" style={[styles.orbit, styles.orbitPink, { transform: [{ rotate: ringRotation }] }]} />
      <Animated.View pointerEvents="none" style={[styles.orbit, styles.orbitViolet, { transform: [{ rotate: reverseRotation }, { scaleX: 0.72 }] }]} />
      <Animated.View pointerEvents="none" style={[styles.orbit, styles.orbitFine, { transform: [{ rotate: ringRotation }, { scaleX: 0.88 }] }]} />
      <Animated.View style={[styles.coreWrap, { transform: [{ scale }] }]}>
        <View style={[styles.core, { backgroundColor: coreColor, borderColor: glowColor, shadowColor: glowColor }]}>
          <View style={[styles.coreHighlight, { backgroundColor: glowColor }]} />
          <View style={styles.coreInnerGlow} />
          <View style={styles.coreBottomShade} />
        </View>
      </Animated.View>
      <View pointerEvents="none" style={styles.particles}>
        <View style={[styles.particle, styles.particleA, { backgroundColor: '#FFC0ED' }]} />
        <View style={[styles.particle, styles.particleB, { backgroundColor: '#A98AFF' }]} />
        <View style={[styles.particle, styles.particleC, { backgroundColor: '#F06AB8' }]} />
        <View style={[styles.particle, styles.particleD, { backgroundColor: '#D6B4FF' }]} />
        <View style={[styles.particle, styles.particleE, { backgroundColor: '#FF9BD6' }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', height: 344, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  outerHalo: { position: 'absolute', width: 236, height: 236, borderRadius: 118, backgroundColor: '#C51B83', shadowColor: '#E83CA8', shadowOpacity: 0.95, shadowRadius: 38, elevation: 16 },
  orbit: { position: 'absolute', width: 252, height: 112, borderRadius: 126, borderWidth: 1, backgroundColor: 'transparent' },
  orbitPink: { borderColor: 'rgba(255,119,200,0.78)', transform: [{ rotate: '28deg' }] },
  orbitViolet: { width: 276, height: 132, borderColor: 'rgba(155,98,255,0.62)', transform: [{ rotate: '-38deg' }] },
  orbitFine: { width: 226, height: 98, borderColor: 'rgba(248,182,230,0.34)', transform: [{ rotate: '78deg' }] },
  coreWrap: { width: 190, height: 190, alignItems: 'center', justifyContent: 'center' },
  core: { width: 176, height: 176, borderRadius: 88, borderWidth: 1.5, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.82, shadowRadius: 32, shadowOffset: { width: 0, height: 0 }, elevation: 20 },
  coreHighlight: { position: 'absolute', width: 90, height: 64, borderRadius: 50, top: 17, left: 26, opacity: 0.22, transform: [{ rotate: '-32deg' }] },
  coreInnerGlow: { width: 116, height: 116, borderRadius: 58, borderWidth: 1, borderColor: 'rgba(255,174,225,0.22)', backgroundColor: 'rgba(220,54,151,0.12)' },
  coreBottomShade: { position: 'absolute', width: 160, height: 70, borderRadius: 80, bottom: -35, backgroundColor: 'rgba(12,3,18,0.42)' },
  particles: { ...StyleSheet.absoluteFillObject },
  particle: { position: 'absolute', width: 5, height: 5, borderRadius: 3, shadowColor: '#F06AB8', shadowOpacity: 0.9, shadowRadius: 8, elevation: 5 },
  particleA: { top: 48, left: '49%' },
  particleB: { top: '39%', right: '12%', width: 4, height: 4 },
  particleC: { top: '34%', left: '12%', width: 4, height: 4 },
  particleD: { bottom: 49, right: '26%', width: 3, height: 3 },
  particleE: { bottom: 57, left: '25%', width: 3, height: 3 },
});
