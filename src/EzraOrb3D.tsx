import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GLView } from 'expo-gl';

type OrbStatus = { status: string; level?: number };

type Palette = {
  base: [number, number, number];
  accent: [number, number, number];
  glow: [number, number, number];
};

const vertexShader = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uEnergy;
uniform float uPulse;
uniform float uMode;
uniform vec3 uBaseColor;
uniform vec3 uAccentColor;
uniform vec3 uGlowColor;

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - uResolution) / min(uResolution.x, uResolution.y);
  float radial = length(p);
  vec3 background = vec3(0.018, 0.009, 0.025);

  float auraFalloff = max(radial - 0.58, 0.0);
  float outerAura = exp(-pow(auraFalloff * 3.15, 2.0));
  float innerAura = exp(-pow(radial * 1.48, 2.0));
  float haloBloom = exp(-pow((radial - 0.91) * 5.2, 2.0));
  background += uGlowColor * outerAura * 0.24;
  background += uAccentColor * innerAura * 0.045;
  background += uGlowColor * haloBloom * (0.045 + uPulse * 0.035);

  // Each state has its own rhythm: quiet breathing, listening response,
  // slow thought cycles, and a lively speaking cadence.
  float speakingBeat = 0.5 + 0.5 * sin(uTime * 5.4);
  float thinkingWave = 0.5 + 0.5 * sin(uTime * 1.15 + 0.7);
  float stateActivity = uMode > 2.5 ? 0.34 + speakingBeat * 0.66
    : uMode > 1.5 ? 0.30 + thinkingWave * 0.30
    : uMode > 0.5 ? uPulse
    : 0.18 + 0.08 * sin(uTime * 0.72);
  // Keep all three energy rings inside the square GL viewport so they remain
  // continuous on phone screens instead of being clipped at the canvas edges.
  float ringTravel = uMode > 1.5 ? 0.009 : 0.016;
  float ringPhase = radial - (0.895 + ringTravel * sin(uTime * (uMode > 2.5 ? 3.1 : 2.0)));
  float ringOne = exp(-pow(ringPhase * 48.0, 2.0));
  float ringTwo = exp(-pow((radial - 0.935 - ringTravel * 0.72 * sin(uTime * 1.55 + 1.2)) * 42.0, 2.0));
  float ringThree = exp(-pow((radial - 0.975 - ringTravel * 0.48 * sin(uTime * 1.25 + 2.1)) * 36.0, 2.0));
  float ringStrength = (0.018 + stateActivity * 0.112) * (0.72 + 0.28 * sin(uTime * (uMode > 2.5 ? 5.4 : 2.2)));
  background += uAccentColor * (ringOne * ringStrength + ringTwo * ringStrength * 0.72 + ringThree * ringStrength * 0.48);

  // Small luminous particles orbit around the orb at different depths and speeds.
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float orbitSpeed = uMode > 2.5 ? 0.145 : uMode > 1.5 ? 0.052 : 0.085;
    float angle = fi * 0.5236 + uTime * (orbitSpeed + fi * 0.004);
    float orbit = 0.915 + 0.065 * sin(fi * 1.91 + uTime * (uMode > 1.5 ? 0.18 : 0.31));
    vec2 particle = vec2(cos(angle), sin(angle)) * orbit;
    float particleSize = 0.0065 + 0.0045 * mod(fi, 3.0);
    float particleGlow = exp(-pow(length(p - particle) / particleSize, 2.0));
    vec3 particleColor = mod(fi, 2.0) < 1.0 ? uAccentColor : uGlowColor;
    background += particleColor * particleGlow * (0.22 + uPulse * 0.36);
  }

  vec3 rayOrigin = vec3(0.0, 0.0, 2.75);
  vec3 rayDirection = normalize(vec3(p * 1.02, -2.45));
  float breathRate = uMode > 2.5 ? 2.7 : uMode > 1.5 ? 0.48 : 0.72;
  float breath = sin(uTime * breathRate) * (0.006 + stateActivity * 0.006);
  float radius = 0.865 + breath + uEnergy * 0.009;
  float b = dot(rayOrigin, rayDirection);
  float c = dot(rayOrigin, rayOrigin) - radius * radius;
  float discriminant = b * b - c;

  if (discriminant < 0.0) {
    gl_FragColor = vec4(background, 1.0);
    return;
  }

  float distanceToSphere = -b - sqrt(discriminant);
  vec3 position = rayOrigin + rayDirection * distanceToSphere;
  vec3 normal = normalize(position);
  float rotation = uTime * 0.105;
  float cs = cos(rotation);
  float sn = sin(rotation);
  vec3 surface = vec3(
    normal.x * cs - normal.z * sn,
    normal.y,
    normal.x * sn + normal.z * cs
  );

  vec3 lightDirection = normalize(vec3(-0.85, 1.15, 2.4));
  vec3 viewDirection = normalize(-position);
  float diffuse = max(dot(normal, lightDirection), 0.0);
  float specular = pow(max(dot(reflect(-lightDirection, normal), viewDirection), 0.0), 54.0);
  float broadSpecular = pow(max(dot(reflect(-lightDirection, normal), viewDirection), 0.0), 12.0);
  // A softer secondary light separates the sphere from its dark background
  // and adds a second, restrained reflection across the glass-like surface.
  vec3 fillDirection = normalize(vec3(1.25, -0.48, 1.7));
  float fillDiffuse = max(dot(normal, fillDirection), 0.0);
  float fillSpecular = pow(max(dot(reflect(-fillDirection, normal), viewDirection), 0.0), 38.0);
  float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.35);

  // Surface currents use a different tempo for each state: calm at rest,
  // responsive while listening, deliberate while thinking, and vivid in speech.
  float surfaceRate = uMode > 2.5 ? 0.58 : uMode > 1.5 ? 0.105 : uMode > 0.5 ? 0.28 + uEnergy * 0.42 : 0.19;
  float surfaceTime = uTime * surfaceRate;
  float surfaceWarp = uMode > 2.5 ? 1.22 : uMode > 1.5 ? 0.72 : uMode > 0.5 ? 0.92 + uEnergy * 0.34 : 0.78;
  float warp = sin(surface.x * 3.2 + surface.z * 2.7 + surfaceTime * 0.12) * 0.11 * surfaceWarp;
  vec3 fluid = surface + vec3(warp, warp * 0.7, -warp);
  float flowA = sin(fluid.x * 8.0 + fluid.y * 5.5 - fluid.z * 7.0 + surfaceTime * 0.34);
  float flowB = sin(fluid.z * 12.0 - fluid.x * 5.0 + fluid.y * 3.0 + surfaceTime * 0.23);
  float flowC = sin(fluid.y * 14.0 + fluid.x * 4.0 - surfaceTime * 0.16);
  float flowD = sin(fluid.x * 18.0 + fluid.z * 13.0 + fluid.y * 9.0 + surfaceTime * 0.19);
  float turbulence = flowA * 0.34 + flowB * 0.29 + flowC * 0.21 + flowD * 0.16;
  float fluidVein = 1.0 - smoothstep(0.018, 0.145, abs(turbulence));
  float cloudA = 0.5 + 0.5 * sin(fluid.x * 5.5 - fluid.y * 8.5 + fluid.z * 4.5 + surfaceTime * 0.15);
  float cloudB = 0.5 + 0.5 * sin(fluid.z * 3.6 + fluid.x * 4.2 - fluid.y * 5.1 - surfaceTime * 0.11);
  float cloud = cloudA * 0.62 + cloudB * 0.38;
  float innerCurrent = 0.5 + 0.5 * sin(fluid.x * 3.0 + fluid.z * 5.0 - surfaceTime * 0.24);

  vec3 body = mix(uBaseColor, uAccentColor, 0.12 + fluidVein * 0.54 + cloud * 0.18);
  body = mix(body, uGlowColor, innerCurrent * 0.22);
  vec3 color = body * (0.16 + diffuse * 1.08 + fillDiffuse * 0.16);
  float rimLight = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.1);
  color += uGlowColor * (fresnel * 0.82 + rimLight * 0.34 + fluidVein * (0.13 + uEnergy * 0.20));
  color += vec3(1.0, 0.82, 0.97) * specular * 1.18;
  color += vec3(1.0, 0.88, 1.0) * fillSpecular * 0.34;
  color += uAccentColor * broadSpecular * 0.28;
  color += mix(uAccentColor, uGlowColor, cloud) * cloud * 0.12;

  // A layered inner glow gives the sphere depth; microphone energy gently lifts its core.
  float coreFalloff = exp(-dot(position.xy, position.xy) * 4.6);
  float core = coreFalloff * (0.10 + uEnergy * 0.30 + uPulse * 0.035);
  color += uAccentColor * core;
  color += uGlowColor * exp(-dot(position.xy, position.xy) * 1.85) * (0.045 + uPulse * 0.045);
  color = pow(max(color, 0.0), vec3(0.88));

  gl_FragColor = vec4(color, 1.0);
}
`;

const toRgb = (hex: string): [number, number, number] => {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
};

const palettes: Record<'idle' | 'listening' | 'thinking' | 'speaking', Palette> = {
  idle: {
    base: toRgb('#350A2C'),
    accent: toRgb('#D65BAF'),
    glow: toRgb('#8E286F'),
  },
  listening: {
    base: toRgb('#430B35'),
    accent: toRgb('#FF73C8'),
    glow: toRgb('#C12B8C'),
  },
  thinking: {
    base: toRgb('#241039'),
    accent: toRgb('#B18AFF'),
    glow: toRgb('#7547C5'),
  },
  speaking: {
    base: toRgb('#4A0A34'),
    accent: toRgb('#FF91D2'),
    glow: toRgb('#D83D9E'),
  },
};

function getState(status: string): keyof typeof palettes {
  if (status.includes('يستمع') || status.includes('أستمع')) return 'listening';
  if (status.includes('أفكر')) return 'thinking';
  if (status.includes('يتحدث') || status.includes('أتحدث')) return 'speaking';
  return 'idle';
}

function compileShader(gl: any, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create EZRA orb shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'EZRA orb shader compilation failed';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

export default function EzraOrb3D({ status, level = 0 }: OrbStatus) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const stageSize = Math.max(260, Math.min(344, screenWidth - 64, screenHeight - 440));
  const statusRef = useRef(status);
  const levelRef = useRef(level);
  const reducedMotionRef = useRef(false);
  const disposeRef = useRef<(() => void) | null>(null);
  const [rendererFailed, setRendererFailed] = useState(false);

  statusRef.current = status;
  levelRef.current = level;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (mounted) reducedMotionRef.current = value; })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      reducedMotionRef.current = value;
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => () => {
    disposeRef.current?.();
    disposeRef.current = null;
  }, []);

  const onContextCreate = useCallback((gl: any) => {
    disposeRef.current?.();
    let alive = true;
    let frameHandle = 0;
    let startTime = 0;
    let lastFrame = 0;
    let program: any;
    let buffer: any;

    try {
      const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShader);
      const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
      program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'EZRA orb program linking failed');
      }

      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
      );

      const positionLocation = gl.getAttribLocation(program, 'position');
      const resolutionLocation = gl.getUniformLocation(program, 'uResolution');
      const timeLocation = gl.getUniformLocation(program, 'uTime');
      const energyLocation = gl.getUniformLocation(program, 'uEnergy');
      const baseLocation = gl.getUniformLocation(program, 'uBaseColor');
      const accentLocation = gl.getUniformLocation(program, 'uAccentColor');
      const glowLocation = gl.getUniformLocation(program, 'uGlowColor');
      const pulseLocation = gl.getUniformLocation(program, 'uPulse');
      const modeLocation = gl.getUniformLocation(program, 'uMode');

      gl.useProgram(program);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform2f(resolutionLocation, gl.drawingBufferWidth, gl.drawingBufferHeight);

      const currentPalette: Palette = {
        base: [...palettes.idle.base],
        accent: [...palettes.idle.accent],
        glow: [...palettes.idle.glow],
      };
      let smoothedEnergy = 0;
      let smoothedPulse = 0.18;
      const render = (timestamp: number) => {
        if (!alive) return;
        if (timestamp - lastFrame < 33) {
          frameHandle = requestAnimationFrame(render);
          return;
        }
        const deltaSeconds = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 0.1) : 1 / 30;
        lastFrame = timestamp;
        if (!startTime) startTime = timestamp;
        const state = getState(statusRef.current);
        const stateMode = state === 'listening' ? 1 : state === 'thinking' ? 2 : state === 'speaking' ? 3 : 0;
        const targetPalette = palettes[state];
        const blend = reducedMotionRef.current ? 1 : 1 - Math.exp(-deltaSeconds * 4.8);
        for (let channel = 0; channel < 3; channel += 1) {
          currentPalette.base[channel] += (targetPalette.base[channel] - currentPalette.base[channel]) * blend;
          currentPalette.accent[channel] += (targetPalette.accent[channel] - currentPalette.accent[channel]) * blend;
          currentPalette.glow[channel] += (targetPalette.glow[channel] - currentPalette.glow[channel]) * blend;
        }
        const statePulse = state === 'listening' ? 0.78 : state === 'speaking' ? 0.86 : state === 'thinking' ? 0.42 : 0.16;
        const targetEnergy = state === 'listening' ? Math.max(0, Math.min(1, levelRef.current)) : 0;
        const energyBlend = 1 - Math.exp(-deltaSeconds * (targetEnergy > smoothedEnergy ? 12 : 5));
        smoothedEnergy += (targetEnergy - smoothedEnergy) * energyBlend;
        const targetPulse = Math.min(1, statePulse + smoothedEnergy * (state === 'listening' ? 0.48 : 0.10));
        const pulseBlend = 1 - Math.exp(-deltaSeconds * 4.2);
        smoothedPulse += (targetPulse - smoothedPulse) * pulseBlend;
        const energy = smoothedEnergy;
        const pulse = smoothedPulse;
        const time = reducedMotionRef.current ? 0 : (timestamp - startTime) / 1000;

        gl.clearColor(0.018, 0.009, 0.025, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        gl.uniform1f(timeLocation, time);
        gl.uniform1f(energyLocation, energy);
        gl.uniform1f(pulseLocation, pulse);
        gl.uniform1f(modeLocation, stateMode);
        gl.uniform3f(baseLocation, ...currentPalette.base);
        gl.uniform3f(accentLocation, ...currentPalette.accent);
        gl.uniform3f(glowLocation, ...currentPalette.glow);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.endFrameEXP();
        frameHandle = requestAnimationFrame(render);
      };

      frameHandle = requestAnimationFrame(render);
    } catch (error) {
      console.warn('EZRA orb renderer could not initialize:', error);
      setRendererFailed(true);
    }

    disposeRef.current = () => {
      alive = false;
      if (frameHandle) cancelAnimationFrame(frameHandle);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    };
  }, []);

  return (
    <View style={[styles.stage, { width: stageSize, height: stageSize }]}>
      {rendererFailed ? (
        <View style={styles.fallback}>
          <View style={styles.fallbackAura} />
          <View style={styles.fallbackSphere}>
            <View style={styles.fallbackHighlight} />
            <View style={styles.fallbackCore} />
          </View>
        </View>
      ) : (
        <GLView style={styles.canvas} onContextCreate={onContextCreate} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  canvas: {
    width: '100%',
    height: '100%',
  },
  fallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  fallbackAura: { position: 'absolute', width: 270, height: 270, borderRadius: 135, backgroundColor: '#8E286F', opacity: 0.24, shadowColor: '#E65AB9', shadowOpacity: 1, shadowRadius: 50, elevation: 20 },
  fallbackSphere: { width: 258, height: 258, borderRadius: 129, overflow: 'hidden', borderWidth: 2, borderColor: '#D65BAF', backgroundColor: '#350A2C', alignItems: 'center', justifyContent: 'center', shadowColor: '#D83D9E', shadowOpacity: 0.9, shadowRadius: 34, elevation: 24 },
  fallbackHighlight: { position: 'absolute', width: 110, height: 58, top: 26, left: 40, borderRadius: 60, backgroundColor: 'rgba(255,225,247,0.22)', transform: [{ rotate: '-32deg' }] },
  fallbackCore: { width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,115,200,0.2)', borderWidth: 1, borderColor: 'rgba(255,191,231,0.35)' },
});
