"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MutableRefObject } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Vita's mascot: a compact take on the "robot-hero" design (speckled shell,
 * fresnel glass visor, bracket eyes that blink and turn into hearts when
 * clicked, antenna ears) sized for a corner orb. It looks toward the mouse
 * anywhere on the page and reacts to the agent's state.
 */
export type MascotState = "offline" | "idle" | "connecting" | "listening" | "thinking" | "speaking";

class HeartCurve extends THREE.Curve<THREE.Vector3> {
  // Curve's constructor is protected in three's types.
  constructor() {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(a), 3);
    const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
    return target.set(x * 0.002, (y + 6) * 0.002, 0);
  }
}
const heartCurve = new HeartCurve();

function GlassVisor({ color }: { color: string }) {
  const uniforms = useMemo(
    () => ({
      color: { value: new THREE.Color(color) },
      power: { value: 2.4 },
      intensity: { value: 0.7 },
    }),
    [color],
  );

  return (
    <mesh scale={[1.12, 0.86, 1]}>
      <sphereGeometry args={[0.3, 48, 48]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={`
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vViewPosition = -mvPosition.xyz;
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * mvPosition;
          }
        `}
        fragmentShader={`
          uniform vec3 color;
          uniform float power;
          uniform float intensity;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            float fresnel = pow(1.0 - max(dot(normalize(vViewPosition), normalize(vNormal)), 0.0), power);
            gl_FragColor = vec4(color, fresnel * intensity);
          }
        `}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

const earBaseMat = new THREE.MeshStandardMaterial({ color: "#f0f0f0", roughness: 0.5 });
const earRingMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3 });
const earCenterMat = new THREE.MeshStandardMaterial({ color: "#cccccc", roughness: 0.8 });
const antennaBaseMat = new THREE.MeshStandardMaterial({ color: "#999999", roughness: 0.4, metalness: 0.5 });
const antennaStickMat = new THREE.MeshStandardMaterial({ color: "#d0d0d0", roughness: 0.4, metalness: 0.2 });

function Ear({
  position,
  isLeft,
  tipRef,
}: {
  position: [number, number, number];
  isLeft: boolean;
  tipRef: MutableRefObject<THREE.MeshStandardMaterial | null>;
}) {
  const dir = isLeft ? -1 : 1;
  return (
    <group position={position} scale={1.3}>
      <mesh rotation={[0, 0, Math.PI / 2]} material={earBaseMat}>
        <cylinderGeometry args={[0.04, 0.04, 0.025, 32]} />
      </mesh>
      <mesh position={[dir * 0.012, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={earRingMat}>
        <torusGeometry args={[0.032, 0.008, 16, 32]} />
      </mesh>
      <mesh position={[dir * 0.012, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={earCenterMat}>
        <cylinderGeometry args={[0.03, 0.03, 0.005, 32]} />
      </mesh>
      <group position={[dir * 0.015, 0.035, 0]} rotation={[-0.4, 0, 0]}>
        <mesh position={[0, 0.01, 0]} material={antennaBaseMat}>
          <cylinderGeometry args={[0.006, 0.008, 0.02, 16]} />
        </mesh>
        <mesh position={[0, 0.06, 0]} material={antennaStickMat}>
          <cylinderGeometry args={[0.003, 0.003, 0.1, 8]} />
        </mesh>
        <mesh position={[0, 0.11, 0]}>
          <sphereGeometry args={[0.008, 16, 16]} />
          <meshStandardMaterial ref={tipRef} color="#ff3366" roughness={0.2} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function bracketPaths() {
  const w = 0.025;
  const h = 0.035;
  const r = 0.02;
  const g = 0.005;
  const half = (sign: 1 | -1) => {
    const p = new THREE.CurvePath<THREE.Vector3>();
    const v = (x: number, y: number) => new THREE.Vector3(x, sign * y, 0);
    p.add(new THREE.LineCurve3(v(-w, g), v(-w, h - r)));
    p.add(new THREE.QuadraticBezierCurve3(v(-w, h - r), v(-w, h), v(-w + r, h)));
    p.add(new THREE.LineCurve3(v(-w + r, h), v(w - r, h)));
    p.add(new THREE.QuadraticBezierCurve3(v(w - r, h), v(w, h), v(w, h - r)));
    p.add(new THREE.LineCurve3(v(w, h - r), v(w, g)));
    return p;
  };
  return { top: half(1), bottom: half(-1) };
}

function Eye({
  position,
  color,
  lovedRef,
  stateRef,
  levelRef,
  reducedMotion,
}: {
  position: [number, number, number];
  color: string;
  lovedRef: MutableRefObject<boolean>;
  stateRef: MutableRefObject<MascotState>;
  levelRef: MutableRefObject<number>;
  reducedMotion: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const normalRef = useRef<THREE.Group>(null);
  const heartRef = useRef<THREE.Mesh>(null);
  const { top, bottom } = useMemo(() => bracketPaths(), []);
  const eyeMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), toneMapped: false }),
    [color],
  );
  const heartMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ff3366", toneMapped: false }), []);

  useFrame(({ clock }) => {
    if (!groupRef.current || !normalRef.current || !heartRef.current) return;
    const loved = lovedRef.current;
    const state = stateRef.current;
    normalRef.current.visible = !loved;
    heartRef.current.visible = loved;

    let scaleY = 1;
    const cycle = clock.getElapsedTime() % 3.2;
    if (!loved && !reducedMotion && cycle < 0.3) {
      scaleY = Math.max(0.05, 1 - Math.sin((cycle / 0.3) * Math.PI));
    }
    if (state === "offline") scaleY = 0.15; // asleep
    if (state === "speaking") scaleY *= 0.75 + Math.min(1, levelRef.current * 4) * 0.45;
    const base = state === "listening" ? 1.25 : 1.1;
    groupRef.current.scale.set(base, base * scaleY, base);
    eyeMat.color.set(color).multiplyScalar(state === "offline" ? 0.5 : 1.6);
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh ref={heartRef} visible={false} material={heartMat}>
        <tubeGeometry args={[heartCurve, 64, 0.0035, 8, true]} />
      </mesh>
      <group ref={normalRef}>
        <mesh material={eyeMat}>
          <tubeGeometry args={[top, 20, 0.0035, 8, false]} />
        </mesh>
        <mesh material={eyeMat}>
          <tubeGeometry args={[bottom, 20, 0.0035, 8, false]} />
        </mesh>
      </group>
    </group>
  );
}

function makeSpeckleTextures() {
  const size = 256;
  const color = document.createElement("canvas");
  const bump = document.createElement("canvas");
  color.width = bump.width = size;
  color.height = bump.height = size;
  const c = color.getContext("2d");
  const b = bump.getContext("2d");
  if (c && b) {
    c.fillStyle = "#dcdcdc";
    c.fillRect(0, 0, size, size);
    b.fillStyle = "#808080";
    b.fillRect(0, 0, size, size);
    for (let i = 0; i < 2500; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 0.5 + Math.random() * 1.2;
      const dark = Math.random() > 0.15;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = dark ? "#222222" : "#dddddd";
      c.fill();
      b.beginPath();
      b.arc(x, y, r, 0, Math.PI * 2);
      b.fillStyle = dark ? "#000000" : "#ffffff";
      b.fill();
    }
  }
  const colorMap = new THREE.CanvasTexture(color);
  const bumpMap = new THREE.CanvasTexture(bump);
  for (const t of [colorMap, bumpMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 3);
  }
  return { colorMap, bumpMap };
}

const NECK = {
  baseR: 0.25, baseH: -0.01, midR: 0.23, midH: 0.02, lipBottomR: 0.27, lipBottomH: 0.025,
  lipTopR: 0.28, lipTopH: 0.05, innerR: 0.24, innerDropH: 0.03,
};

function Robot({
  color,
  screenColor,
  pointerRef,
  stateRef,
  levelRef,
  reducedMotion,
}: {
  color: string;
  screenColor: string;
  pointerRef: MutableRefObject<{ x: number; y: number }>;
  stateRef: MutableRefObject<MascotState>;
  levelRef: MutableRefObject<number>;
  reducedMotion: boolean;
}) {
  const bodyRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const lovedRef = useRef(false);
  const lovedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leftTip = useRef<THREE.MeshStandardMaterial | null>(null);
  const rightTip = useRef<THREE.MeshStandardMaterial | null>(null);
  // Client-only component (loaded with ssr: false), so document exists here.
  const [textures] = useState(makeSpeckleTextures);

  useEffect(
    () => () => {
      textures.colorMap.dispose();
      textures.bumpMap.dispose();
    },
    [textures],
  );

  useEffect(
    () => () => {
      if (lovedTimer.current) clearTimeout(lovedTimer.current);
    },
    [],
  );

  const neckProfile = useMemo(
    () => [
      new THREE.Vector2(NECK.innerR, NECK.baseH),
      new THREE.Vector2(NECK.baseR, NECK.baseH),
      new THREE.Vector2(NECK.midR, NECK.midH),
      new THREE.Vector2(NECK.lipBottomR, NECK.lipBottomH),
      new THREE.Vector2(NECK.lipTopR, NECK.lipTopH),
      new THREE.Vector2(NECK.innerR, NECK.lipTopH),
      new THREE.Vector2(NECK.innerR, NECK.lipTopH - NECK.innerDropH),
    ],
    [],
  );

  useFrame(({ clock }, delta) => {
    if (!bodyRef.current || !headRef.current) return;
    const dt = Math.min(delta, 0.1);
    const t = clock.getElapsedTime();
    const state = stateRef.current;
    const { x, y } = reducedMotion ? { x: 0, y: 0 } : pointerRef.current;

    const lerp = THREE.MathUtils.lerp;
    // Gentle turns: in a small orb a big yaw hides the face.
    bodyRef.current.rotation.y = lerp(bodyRef.current.rotation.y, x * 0.15, 8 * dt);
    bodyRef.current.rotation.x = lerp(bodyRef.current.rotation.x, -y * 0.08, 8 * dt);
    bodyRef.current.rotation.z = lerp(bodyRef.current.rotation.z, -x * 0.05, 8 * dt);

    let headY = x * 0.3;
    let headX = -y * 0.18;
    let headZ = 0;
    if (!reducedMotion) {
      if (state === "thinking" || state === "connecting") {
        headY += Math.sin(t * 2.2) * 0.25;
        headZ = Math.sin(t * 1.6) * 0.08;
      } else if (state === "listening") {
        headZ = 0.12; // attentive tilt
      } else if (state === "speaking") {
        headX += Math.sin(t * 9) * Math.min(1, levelRef.current * 4) * 0.06;
      } else if (state === "offline") {
        headX = 0.25; // dozing
      }
    }
    headRef.current.rotation.y = lerp(headRef.current.rotation.y, headY, 14 * dt);
    headRef.current.rotation.x = lerp(headRef.current.rotation.x, headX, 14 * dt);
    headRef.current.rotation.z = lerp(headRef.current.rotation.z, headZ, 10 * dt);

    // Antenna tips: steady when idle, blinking while thinking, glowing when listening.
    const blink = state === "thinking" || state === "connecting" ? (Math.sin(t * 8) > 0 ? 2.2 : 0.4) : 1;
    const glow = state === "listening" ? 2.4 : state === "offline" ? 0.3 : blink;
    for (const tip of [leftTip.current, rightTip.current]) {
      if (tip) tip.color.set(state === "listening" ? screenColor : "#ff3366").multiplyScalar(glow);
    }
  });

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    lovedRef.current = true;
    if (lovedTimer.current) clearTimeout(lovedTimer.current);
    lovedTimer.current = setTimeout(() => {
      lovedRef.current = false;
    }, 2000);
  };

  return (
    <group ref={bodyRef} position={[0, -0.47, 0]} onPointerDown={onPointerDown}>
      <mesh>
        <sphereGeometry args={[0.43, 48, 48, 0, Math.PI * 2, Math.PI * 0.15, Math.PI * 0.85]} />
        <meshStandardMaterial
          color={color}
          map={textures.colorMap}
          bumpMap={textures.bumpMap}
          bumpScale={0.005}
          roughness={1}
        />
      </mesh>
      <mesh position={[0, 0.38, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.21, 0.015, 16, 64]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.37, 0]}>
        <latheGeometry args={[neckProfile, 64]} />
        <meshStandardMaterial color="#9a9a9a" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>

      <group ref={headRef} position={[0, 0.6, 0]}>
        <mesh scale={[1.1, 0.84, 0.98]}>
          <sphereGeometry args={[0.3, 48, 48]} />
          <meshStandardMaterial color="#111111" roughness={0.35} metalness={0.1} />
        </mesh>
        <GlassVisor color={screenColor} />
        {([-0.07, 0.07] as const).map((x) => (
          <Eye
            key={x}
            position={[x, 0.01, 0.305]}
            color={screenColor}
            lovedRef={lovedRef}
            stateRef={stateRef}
            levelRef={levelRef}
            reducedMotion={reducedMotion}
          />
        ))}
        <Ear position={[-0.335, 0, 0]} isLeft tipRef={leftTip} />
        <Ear position={[0.335, 0, 0]} isLeft={false} tipRef={rightTip} />
      </group>
    </group>
  );
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

export function RobotMascot({
  state,
  levelRef,
  color = "#c4c4c4",
  screenColor = "#5b8cff",
  className,
}: {
  state: MascotState;
  /** 0..1 bot audio level, read every frame for speaking animation. */
  levelRef: MutableRefObject<number>;
  color?: string;
  screenColor?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const stateRef = useRef<MascotState>(state);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Track the mouse across the whole page, relative to the orb, so the robot
  // looks at whatever the user is pointing at.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      pointerRef.current = {
        x: THREE.MathUtils.clamp((e.clientX - cx) / (window.innerWidth / 2), -1, 1),
        y: THREE.MathUtils.clamp(-(e.clientY - cy) / (window.innerHeight / 2), -1, 1),
      };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <div ref={containerRef} className={className}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0.14, 1.95], fov: 32 }}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 3, 4]} intensity={1.6} />
        <directionalLight position={[-3, 1, -2]} intensity={0.6} color="#9db7ff" />
        <Robot
          color={color}
          screenColor={screenColor}
          pointerRef={pointerRef}
          stateRef={stateRef}
          levelRef={levelRef}
          reducedMotion={reducedMotion}
        />
      </Canvas>
    </div>
  );
}
