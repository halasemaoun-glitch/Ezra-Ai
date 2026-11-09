import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

type OrbStatus = { status: string };

function OrbScene({ status }: OrbStatus) {
  const core = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const orbitA = useRef<THREE.Mesh>(null);
  const orbitB = useRef<THREE.Mesh>(null);
  const particles = useRef<THREE.Points>(null);
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

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (core.current) {
      core.current.rotation.y = t * speed;
      core.current.rotation.x = Math.sin(t * 0.22) * 0.12;
      const breath = 1 + Math.sin(t * (speaking ? 3.8 : listening ? 2.4 : 1.15)) * (speaking ? 0.045 : 0.022);
      core.current.scale.setScalar(breath);
    }
    if (halo.current) {
      halo.current.rotation.y = -t * speed * 0.42;
      halo.current.scale.setScalar(1.12 + Math.sin(t * 1.1) * (listening || speaking ? 0.055 : 0.025));
    }
    if (orbitA.current) orbitA.current.rotation.z = t * speed * 0.72;
    if (orbitB.current) orbitB.current.rotation.x = 0.9 + t * speed * 0.5;
    if (particles.current) {
      particles.current.rotation.y = -t * (speaking ? 0.12 : listening ? 0.075 : 0.035);
      particles.current.rotation.x = Math.sin(t * 0.18) * 0.08;
    }
  });

  return (
    <>
      <ambientLight intensity={0.62} />
      <pointLight position={[2.5, 2.2, 3]} color="#ff70c8" intensity={3.2} distance={8} />
      <pointLight position={[-2.8, -1.2, 2]} color="#7928ff" intensity={2.7} distance={7} />
      <pointLight position={[0, 0, -3]} color="#e51b83" intensity={2.2} distance={6} />
      <group>
        <mesh ref={halo}>
          <sphereGeometry args={[1.22, 48, 48]} />
          <meshBasicMaterial color="#a90b67" transparent opacity={0.105} side={THREE.BackSide} />
        </mesh>
        <mesh ref={core}>
          <sphereGeometry args={[0.92, 72, 72]} />
          <meshPhysicalMaterial
            color={thinking ? '#230d3d' : '#35091f'}
            emissive={speaking ? '#b50b70' : listening ? '#8f145f' : '#64106d'}
            emissiveIntensity={speaking ? 1.15 : listening ? 0.9 : 0.68}
            metalness={0.32}
            roughness={0.22}
            clearcoat={1}
            clearcoatRoughness={0.12}
          />
        </mesh>
        <mesh scale={0.77}>
          <sphereGeometry args={[0.92, 48, 48]} />
          <meshBasicMaterial color="#ff6bbd" transparent opacity={0.09} />
        </mesh>
        <mesh ref={orbitA} rotation={[0.8, 0.2, 0.35]}>
          <torusGeometry args={[1.34, 0.009, 8, 180]} />
          <meshBasicMaterial color="#ff77c8" transparent opacity={0.72} />
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

export default function EzraOrb3D({ status }: OrbStatus) {
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
        <OrbScene status={status} />
      </Canvas>
      <View pointerEvents="none" style={styles.emojiLayer}>
        <Text style={[styles.emoji, styles.emojiTop, (listening || speaking) && styles.emojiActive]}>✦</Text>
        <Text style={[styles.emoji, styles.emojiRight]}>💜</Text>
        <Text style={[styles.emoji, styles.emojiLeft]}>✨</Text>
        <Text style={[styles.emoji, styles.emojiBottom, thinking && styles.emojiActive]}>♡</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', height: 292, alignItems: 'center', justifyContent: 'center' },
  canvas: { backgroundColor: 'transparent' },
  emojiLayer: { ...StyleSheet.absoluteFillObject },
  emoji: { position: 'absolute', color: '#f4b7e2', fontSize: 22, opacity: 0.66, textShadowColor: '#d51a93', textShadowRadius: 13 },
  emojiTop: { top: 12, left: '48%' },
  emojiRight: { right: '8%', top: '43%', fontSize: 17 },
  emojiLeft: { left: '8%', top: '35%', fontSize: 19 },
  emojiBottom: { bottom: 18, right: '24%', fontSize: 25 },
  emojiActive: { opacity: 1, textShadowRadius: 20 },
});
