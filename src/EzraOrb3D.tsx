import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
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
uniform vec3 uBaseColor;
uniform vec3 uAccentColor;
uniform vec3 uGlowColor;

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - uResolution) / min(uResolution.x, uResolution.y);
  float radial = length(p);
  vec3 background = vec3(0.018, 0.009, 0.025);

  float outerAura = exp(-pow(max(radial - 0.72, 0.0) * 3.8, 2.0));
  float innerAura = exp(-pow(radial * 1.65, 2.0));
  background += uGlowColor * outerAura * 0.20;
  background += uAccentColor * innerAura * 0.035;

  vec3 rayOrigin = vec3(0.0, 0.0, 2.75);
  vec3 rayDirection = normalize(vec3(p * 1.02, -2.45));
  float radius = 0.865 + sin(uTime * 1.15) * (0.006 + uEnergy * 0.012);
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
  float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.35);

  float flowA = sin(surface.x * 7.0 + surface.y * 5.0 - surface.z * 6.0 + uTime * 0.42);
  float flowB = sin(surface.z * 10.0 - surface.x * 4.0 + uTime * 0.25);
  float fluidVein = smoothstep(0.18, 0.92, 0.5 + 0.25 * flowA + 0.25 * flowB);
  float cloud = 0.5 + 0.5 * sin(surface.x * 5.0 - surface.y * 8.0 + surface.z * 4.0 + uTime * 0.18);

  vec3 body = mix(uBaseColor, uAccentColor, fluidVein * 0.48 + cloud * 0.13);
  vec3 color = body * (0.22 + diffuse * 0.92);
  color += uGlowColor * (fresnel * 0.78 + fluidVein * 0.10);
  color += vec3(1.0, 0.76, 0.94) * specular * 0.92;
  color += uAccentColor * broadSpecular * 0.19;

  float core = exp(-dot(position.xy, position.xy) * 5.8) * (0.10 + uEnergy * 0.12);
  color += uAccentColor * core;
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
  if (status.includes('يستمع')) return 'listening';
  if (status.includes('أفكر')) return 'thinking';
  if (status.includes('يتحدث')) return 'speaking';
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

      gl.useProgram(program);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform2f(resolutionLocation, gl.drawingBufferWidth, gl.drawingBufferHeight);

      const render = (timestamp: number) => {
        if (!alive) return;
        if (!startTime) startTime = timestamp;
        const state = getState(statusRef.current);
        const palette = palettes[state];
        const time = reducedMotionRef.current ? 0 : (timestamp - startTime) / 1000;
        const energy = Math.max(0, Math.min(1, levelRef.current));

        gl.clearColor(0.018, 0.009, 0.025, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        gl.uniform1f(timeLocation, time);
        gl.uniform1f(energyLocation, energy);
        gl.uniform3f(baseLocation, ...palette.base);
        gl.uniform3f(accentLocation, ...palette.accent);
        gl.uniform3f(glowLocation, ...palette.glow);
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
    <View style={styles.stage}>
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
    width: '100%',
    height: 344,
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
