'use client'
import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  applyPitchRotation,
  applyYawRotation,
  createTorsionState,
  difficultyParams,
  stepTorsion,
  twistProgress,
  unwrapDegreesToRadians,
} from '@/lib/games/untangle-physics'
import { playCheckpointChime, playWinFanfare } from '@/lib/games/sound'

// Stepped grayscale ramp so MeshToonMaterial shades in flat cel bands
// instead of a smooth PBR gradient — this is what reads as "2D-drawn"
// despite the geometry being real 3D.
function makeToonGradient(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 1
  const ctx = canvas.getContext('2d')!
  ;[70, 130, 190, 255].forEach((v, i) => {
    ctx.fillStyle = `rgb(${v},${v},${v})`
    ctx.fillRect(i, 0, 1, 1)
  })
  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  return tex
}

const CHAIN_RADIUS = 0.62     // how far the wrap sits from the chest's center
const CHAIN_ANCHOR_Y = 1.25   // where the chain would reach if fully wound
const CHAIN_SEGMENTS = 160    // fixed tube resolution — varying this with turn count caused visible popping each time it rounded to a different integer

// One continuous chain: a straight hang from the anchor down to where the
// wrap begins, then a spiral around the chest for `turns` loops. Both the
// hang length and the turn count shrink with `turns`, so winding down to 0
// makes the *whole* chain — hanging part included — disappear together.
// Returns the curve itself too, so the caller can pin a "tip bead" to its
// loose end (the part nearest the anchor, which recedes as it unwinds).
function buildChainCurve(turns: number, chestHalfHeight: number): THREE.CatmullRomCurve3 {
  const safeTurns = Math.max(0.001, turns)
  const hangLength = Math.min(CHAIN_ANCHOR_Y - chestHalfHeight, 0.22 * safeTurns)
  const topY = chestHalfHeight + hangLength
  const totalSpan = hangLength + chestHalfHeight * 2
  const hangFraction = totalSpan > 0 ? hangLength / totalSpan : 0

  const points: THREE.Vector3[] = []
  for (let i = 0; i <= CHAIN_SEGMENTS; i++) {
    const t = i / CHAIN_SEGMENTS
    const y = topY - t * totalSpan
    let radius = 0
    let angle = 0
    if (t > hangFraction) {
      const wrapT = (t - hangFraction) / (1 - hangFraction)
      radius = CHAIN_RADIUS
      angle = wrapT * safeTurns * Math.PI * 2
    }
    points.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius))
  }
  return new THREE.CatmullRomCurve3(points)
}

function buildChainGeometry(curve: THREE.CatmullRomCurve3): THREE.TubeGeometry {
  return new THREE.TubeGeometry(curve, CHAIN_SEGMENTS, 0.05, 8, false)
}

function CameraLookAt() {
  const { camera } = useThree()
  useEffect(() => { camera.lookAt(0, 0.5, 0) }, [camera])
  return null
}

// "Inverted hull" outline: a slightly scaled-up backfacing black shell
// behind the real (front-facing) toon-shaded mesh — cheap cel-shading
// outline with no postprocessing pass required.
function OutlinedMesh({
  geometry,
  color,
  gradientMap,
  outlineScale = 1.05,
}: {
  geometry: THREE.BufferGeometry
  color: string
  gradientMap: THREE.Texture
  outlineScale?: number
}) {
  return (
    <group>
      <mesh geometry={geometry} scale={outlineScale}>
        <meshBasicMaterial color="#08080E" side={THREE.BackSide} />
      </mesh>
      <mesh geometry={geometry}>
        <meshToonMaterial color={color} gradientMap={gradientMap} />
      </mesh>
    </group>
  )
}

export interface RawOrientation {
  alpha: number // compass heading — left/right spin
  beta: number  // front-back tilt — up/down
}

interface ChestRigProps {
  windCount: number
  won: boolean
  getRawOrientation: () => RawOrientation | null
  onProgress: (progress: number, won: boolean, elapsedSeconds: number) => void
  onCheckpoint?: (step: number) => void
}

const CHEST_HALF_HEIGHT = 0.32
const CHECKPOINTS = [0.25, 0.5, 0.75]
const WOOD_COLOR = '#8B5A2B'
const GOLD_COLOR = '#E8B84B'
const WIN_GLOW_COLOR = '#FFD86B'

// Physics lives here, inside the Canvas's own render loop (useFrame), so
// each player's simulation runs off real frame-delta time and never fights
// React's render cycle — only a throttled progress readout bubbles back up.
function ChestRig({ windCount, won, getRawOrientation, onProgress, onCheckpoint }: ChestRigProps) {
  const gradientMap = useMemo(() => makeToonGradient(), [])

  // Rounded chest body (a squashed sphere reads as a chest, not a crate)
  // plus two brass reinforcement bands for a "bound treasure chest" look.
  const chestGeo = useMemo(() => {
    const geo = new THREE.SphereGeometry(0.5, 28, 20)
    geo.scale(1.05, 0.8, 0.92)
    return geo
  }, [])
  const bandGeo = useMemo(() => new THREE.TorusGeometry(0.46, 0.035, 8, 32), [])
  const tipGeo = useMemo(() => new THREE.SphereGeometry(0.07, 12, 12), [])

  const initialCurve = useMemo(() => buildChainCurve(windCount, CHEST_HALF_HEIGHT), [windCount])
  const initialChainGeo = useMemo(() => buildChainGeometry(initialCurve), [initialCurve])

  const chainGroupRef = useRef<THREE.Group>(null) // follows yaw only — never flips out of view
  const chestGroupRef = useRef<THREE.Group>(null) // follows yaw + pitch — the chest itself can tumble freely
  const chainMeshRef = useRef<THREE.Mesh>(null)
  const chainMatRef = useRef<THREE.MeshToonMaterial>(null)
  const tipMeshRef = useRef<THREE.Mesh>(null)
  const chainGeoRef = useRef<THREE.BufferGeometry>(initialChainGeo)
  const torsionRef = useRef(createTorsionState(windCount))
  const paramsRef = useRef(difficultyParams(windCount))
  const lastAlphaRef = useRef<number | null>(null)
  const lastBetaRef = useRef<number | null>(null)
  const lastReportRef = useRef(0)
  const startTimeRef = useRef(performance.now())
  const checkpointRef = useRef(0)
  const pulseRef = useRef(0)
  const wonSoundedRef = useRef(false)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const raw = getRawOrientation()
    if (raw !== null) {
      const newYaw = unwrapDegreesToRadians(lastAlphaRef.current, torsionRef.current.yaw.topAngle, raw.alpha)
      torsionRef.current = applyYawRotation(torsionRef.current, newYaw)
      lastAlphaRef.current = raw.alpha

      const newPitch = unwrapDegreesToRadians(lastBetaRef.current, torsionRef.current.pitch.topAngle, raw.beta)
      torsionRef.current = applyPitchRotation(torsionRef.current, newPitch)
      lastBetaRef.current = raw.beta
    }
    torsionRef.current = stepTorsion(torsionRef.current, paramsRef.current, dt)

    const state = torsionRef.current
    if (chainGroupRef.current) chainGroupRef.current.rotation.y = state.yaw.visualAngle
    if (chestGroupRef.current) {
      chestGroupRef.current.rotation.y = state.yaw.visualAngle
      chestGroupRef.current.rotation.x = state.pitch.visualAngle
      // Checkpoint bounce — a quick pop that decays back to normal size.
      pulseRef.current *= Math.max(0, 1 - dt * 6)
      const scale = 1 + pulseRef.current * 0.18
      chestGroupRef.current.scale.setScalar(scale)
    }

    const progress = twistProgress(state, windCount)
    if (chainMeshRef.current) {
      const curve = buildChainCurve(windCount * (1 - progress), CHEST_HALF_HEIGHT)
      const nextGeo = buildChainGeometry(curve)
      chainGeoRef.current.dispose()
      chainGeoRef.current = nextGeo
      chainMeshRef.current.geometry = nextGeo
      // The tip bead marks the chain's loose end — the point the player
      // should track — so it never gets to hide behind the chest.
      if (tipMeshRef.current) tipMeshRef.current.position.copy(curve.getPoint(0))
    }

    const reached = CHECKPOINTS.filter((c) => progress >= c).length
    if (reached > checkpointRef.current) {
      checkpointRef.current = reached
      playCheckpointChime(reached - 1)
      pulseRef.current = 1
      onCheckpoint?.(reached)
    }
    if (state.won && !wonSoundedRef.current) {
      wonSoundedRef.current = true
      playWinFanfare()
      pulseRef.current = 1
    }
    if (chainMatRef.current) chainMatRef.current.color.set(state.won ? WIN_GLOW_COLOR : GOLD_COLOR)

    const now = performance.now()
    if (now - lastReportRef.current > 150) {
      lastReportRef.current = now
      onProgress(progress, state.won, (now - startTimeRef.current) / 1000)
    }
  })

  return (
    <group position={[0, 0.15, 0]}>
      <group ref={chainGroupRef}>
        <mesh ref={chainMeshRef} geometry={initialChainGeo}>
          <meshToonMaterial ref={chainMatRef} color={GOLD_COLOR} gradientMap={gradientMap} />
        </mesh>
        <mesh ref={tipMeshRef} geometry={tipGeo}>
          <meshToonMaterial color={WIN_GLOW_COLOR} gradientMap={gradientMap} />
        </mesh>
      </group>

      <group ref={chestGroupRef}>
        <OutlinedMesh geometry={chestGeo} color={won ? WIN_GLOW_COLOR : WOOD_COLOR} gradientMap={gradientMap} />
        <mesh geometry={bandGeo} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
          <meshToonMaterial color={GOLD_COLOR} gradientMap={gradientMap} />
        </mesh>
        <mesh geometry={bandGeo} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.14, 0]}>
          <meshToonMaterial color={GOLD_COLOR} gradientMap={gradientMap} />
        </mesh>
      </group>
    </group>
  )
}

export interface UntangleChestSceneProps {
  windCount: number
  won: boolean
  getRawOrientation: () => RawOrientation | null
  onProgress: (progress: number, won: boolean, elapsedSeconds: number) => void
  onCheckpoint?: (step: number) => void
}

export function UntangleChestScene({ windCount, won, getRawOrientation, onProgress, onCheckpoint }: UntangleChestSceneProps) {
  return (
    <Canvas orthographic camera={{ zoom: 90, position: [3, 2, 4], near: 0.1, far: 20 }} dpr={[1, 1.5]}>
      <ambientLight intensity={0.75} />
      <directionalLight position={[3, 5, 2]} intensity={1.1} />
      <CameraLookAt />
      <ChestRig
        windCount={windCount}
        won={won}
        getRawOrientation={getRawOrientation}
        onProgress={onProgress}
        onCheckpoint={onCheckpoint}
      />
    </Canvas>
  )
}
