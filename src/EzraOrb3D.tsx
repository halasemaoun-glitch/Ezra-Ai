import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

type OrbStatus = { status: string; level?: number };

function OrbScene({ status, level = 0 }: OrbStatus) {
  const core = useRef<THREE.Mesh>(null);
  const coreMaterial = useRef<THREE.MeshPhysicalMaterial>(null);
  const halo = useRef<THREE.Mesh>(null);
  const orbitA = useRef<THREE.Mesh>(null);
  const orbitB = useRef<THREE.Mesh>(null);
  const particles = useRef<THREE.Points>(null);
  const pinkLight = useRef<THREE.PointLight>(null);
  const violetLight = useRef<THREE.PointLight>(null);
  const burgundyLight = useRef<THREE.PointLight>(null);
  const pulseRing = useRef<THREE.Mesh>(null);
  const rimRing = useRef<THREE.Mesh>(null);
  const smoothedLevel = useRef(0);
  const smoothedActivity = useRef(0.28);
  const smoothedSpeed = useRef(0.12);
  const listening = status.includes('يستمع');
  const thinking = status.includes('أفكر');
  const speaking = status.includes('يتحدث');
  const speed = speaking ? 0.8 : listening ? 0.52 : thinking ? 0.2 : 0.12;
  const particleGeometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 110; i += 1) {
      const y = 1 - (i / 109) * 2;
      const radius = Math.sqrt(1 - y * y);
      const angle = Math.PI * (3 - Math.sqrt(5)) * i;
      const spread = 1.55 + ((i * 17) % 13) / 35;
      points.push(new THREE.Vector3(Math.cos(angle) * radius * spread, y * spread, Math.sin(angle) * radius * spread));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, []);

  useEffect(() => () => particleGeometry.dispose(), [particleGeometry]);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    smoothedLevel.current = THREE.MathUtils.damp(smoothedLevel.current, level, 9, delta);
    const targetActivity = listening ? 0.42 + smoothedLevel.current * 0.72 : speaking ? 1 : thinking ? 0.48 : 0.28;
    smoothedActivity.current = THREE.MathUtils.damp(smoothedActivity.current, targetActivity, 4.5, delta);
    smoothedSpeed.current = THREE.MathUtils.damp(smoothedSpeed.current, speed, 3.5, delta);
    const activity = smoothedActivity.current;
    const motionLevel = smoothedLevel.current;
    const motionSpeed = smoothedSpeed.current;
    if (core.current) {
      core.current.rotation.y = t * motionSpeed;
      core.current.rotation.x = Math.sin(t * 0.22) * 0.12;
      const breath = 1 + Math.sin(t * (0.9 + activity * 2.8)) * (0.018 + activity * 0.027);
      core.current.scale.setScalar(breath);
    }
    if (halo.current) {
      halo.current.rotation.y = -t * motionSpeed * 0.42;
    }
    if (orbitA.current) orbitA.current.rotation.z = t * motionSpeed * 0.72;
    if (orbitB.current) orbitB.current.rotation.x = 0.9 + t * motionSpeed * 0.5;
    if (rimRing.current) rimRing.current.rotation.set(1.05 + Math.sin(t * 0.16) * 0.08, t * motionSpeed * 0.32, -0.35);
    if (pulseRing.current) {
      const wave = (Math.sin(t * (speaking ? 3.2 : listening ? 2.1 : 0.9)) + 1) * 0.5;
      pulseRing.current.scale.setScalar(1.02 + wave * (0.045 + activity * 0.17));
      const material = pulseRing.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.1 + (1 - wave) * (0.1 + activity * 0.24);
    }
    if (particles.current) {
      particles.current.rotation.y = -t * (0.025 + activity * 0.095);
      particles.current.rotation.x = Math.sin(t * 0.18) * 0.08;
    }
    if (coreMaterial.current) {
      const glow = speaking ? 1.12 : listening ? 0.92 : thinking ? 0.82 : 0.68;
      const targetGlow = glow + Math.sin(t * (0.9 + activity * 3.1)) * (0.04 + activity * 0.18) + (listening ? motionLevel * 0.42 : 0);
      coreMaterial.current.emissiveIntensity = THREE.MathUtils.damp(coreMaterial.current.emissiveIntensity, targetGlow, 5, delta);
    }
    const pulse = 0.88 + (Math.sin(t * (speaking ? 4.8 : listening ? 2.8 : 1.35)) + 1) * 0.09;
    if (pinkLight.current) {
      const targetPink = speaking ? 4.1 : listening ? 3.1 + motionLevel * 1.25 : thinking ? 2.9 : 2.3;
      pinkLight.current.intensity = THREE.MathUtils.damp(pinkLight.current.intensity, targetPink, 5, delta) * pulse;
    }
    if (violetLight.current) {
      const targetViolet = thinking ? 3.8 : speaking ? 2.9 : listening ? 3.1 : 2.5;
      violetLight.current.intensity = THREE.MathUtils.damp(violetLight.current.intensity, targetViolet, 3.5, delta) * (0.92 + Math.sin(t * 0.8 + 1.4) * 0.08);
    }
    if (burgundyLight.current) {
      const targetBurgundy = thinking ? 1.45 : speaking ? 1.25 : listening ? 1.55 : 2.0;
      burgundyLight.current.intensity = THREE.MathUtils.damp(burgundyLight.current.intensity, targetBurgundy, 3.8, delta) * (0.94 + Math.sin(t * 0.66 + 2.1) * 0.06);
    }
    if (halo.current) halo.current.scale.setScalar(1.1 + activity * 0.035 + Math.sin(t * 1.15) * 0.018);
  });

  return (
    <>
      <ambientLight intensity={0.62} />
      <pointLight ref={pinkLight} position={[2.5, 2.2, 3]} color="#ff70c8" intensity={3.2} distance={8} />
      <pointLight ref={violetLight} position={[-2.8, -1.2, 2]} color="#7928ff" intensity={2.7} distance={7} />
      <pointLight ref={burgundyLight} position={[0, -2.6, 2.3]} color="#9e174e" intensity={1.8} distance={7} />
      <pointLight position={[0, 0, -3]} color="#e51b83" intensity={2.2} distance={6} />
      <pointLight position={[0, 2.8, 0.8]} color="#f7b4e4" intensity={1.25} distance={5} />
      <group>
        <mesh ref={halo}>
          <sphereGeometry args={[1.22, 48, 48]} />
          <meshBasicMaterial color="#a90b67" transparent opacity={0.105} side={THREE.BackSide} />
        </mesh>
        <mesh ref={pulseRing}>
          <torusGeometry args={[1.12, 0.012, 8, 160]} />
          <meshBasicMaterial color="#f65ab5" transparent opacity={0.2} />
        </mesh>
        <mesh ref={core}>
          <sphereGeometry args={[0.92, 72, 72]} />
          <meshPhysicalMaterial
            ref={coreMaterial}
            color={thinking ? '#230d3d' : '#35091f'}
            emissive={speaking ? '#c01877' : listening ? '#a51a69' : thinking ? '#6b2aa8' : '#70113f'}
            emissiveIntensity={speaking ? 1.15 : listening ? 0.9 : 0.68}
            metalness={0.32}
            roughness={0.22}
            clearcoat={1}
            clearcoatRoughness={0.12}
          />
        </mesh>
        <mesh scale={1.006}>
          <sphereGeometry args={[0.92, 48, 48]} />
          <meshBasicMaterial color="#f4a2db" transparent opacity={0.045} side={THREE.BackSide} />
        </mesh>
        <mesh scale={0.77}>
          <sphereGeometry args={[0.92, 48, 48]} />
          <meshBasicMaterial color="#ff6bbd" transparent opacity={0.09} />
        </mesh>
        <mesh ref={orbitA} rotation={[0.8, 0.2, 0.35]}>
          <torusGeometry args={[1.34, 0.009, 8, 180]} />
          <meshBasicMaterial color="#ff77c8" transparent opacity={0.72} />
        </mesh>
        <mesh ref={rimRing} rotation={[1.05, 0.2, -0.35]}>
          <torusGeometry args={[1.19, 0.0035, 6, 180]} />
          <meshBasicMaterial color="#f8b6e6" transparent opacity={0.34} />
        </mesh>
        <mesh ref={orbitB} rotation={[1.2, 0.4, -0.5]}>
          <torusGeometry args={[1.48, 0.006, 8, 180]} />
          <meshBasicMaterial color="#9b62ff" transparent opacity={0.58} />
        </mesh>
        <points ref={particles} geometry={particleGeometry}>
          <pointsMaterial color="#ffc0ed" size={0.025} transparent opacity={0.82} sizeAttenuation />
        </points>
      </group>
    </>
  );
}

export default function EzraOrb3D({ status, level = 0 }: OrbStatus) {
  const listening = status.includes('يستمع');
  const thinking = status.includes('أفكر');
  const speaking = status.includes('يتحدث');
  return (
    <View style={styles.stage}>
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 38 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
        style={styles.canvas}
      >
        <OrbScene status={status} level={level} />
      </Canvas>
      <View pointerEvents="none" style={styles.ornamentLayer}>
        <View style={[styles.orbitSpark, styles.sparkTop, (listening || speaking) && styles.sparkActive]} />
        <View style={[styles.orbitSpark, styles.sparkRight]} />
        <View style={[styles.orbitSpark, styles.sparkLeft, thinking && styles.sparkActive]} />
        <View style={[styles.orbitSpark, styles.sparkBottom]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', height: 344, alignItems: 'center', justifyContent: 'center' },
  canvas: { backgroundColor: 'transparent' },
  ornamentLayer: { ...StyleSheet.absoluteFillObject },
  orbitSpark: { position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: '#E9A6D5', opacity: 0.58, shadowColor: '#E83CA8', shadowOpacity: 0.9, shadowRadius: 9, elevation: 4 },
  sparkTop: { top: 18, left: '49%' },
  sparkRight: { right: '9%', top: '43%', width: 3, height: 3, backgroundColor: '#B69AFF' },
  sparkLeft: { left: '9%', top: '35%', width: 4, height: 4, backgroundColor: '#D86AB7' },
  sparkBottom: { bottom: 22, right: '25%', width: 3, height: 3, backgroundColor: '#B69AFF' },
  sparkActive: { opacity: 1, transform: [{ scale: 1.45 }] },
});
