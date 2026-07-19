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

const CHAIN_RADIUS = 0.6      // how far the wrap sits from the box's center
const CHAIN_ANCHOR_Y = 1.25   // where the chain would reach if fully wound (matches the old fixed support chain)

// One continuous chain: a straight hang from the anchor down to where the
// wrap begins, then a spiral around the box for `turns` loops. Both the
// hang length and the turn count shrink with `turns`, so winding down to 0
// makes the *whole* chain — hanging part included — disappear together,
// instead of animating a separate "support chain" that never changes.
function buildChainCurve(turns: number, boxHalfHeight: number): THREE.CatmullRomCurve3 {
  const safeTurns = Math.max(0.001, turns)
  const hangLength = Math.min(CHAIN_ANCHOR_Y - boxHalfHeight, 0.22 * safeTurns)
  const topY = boxHalfHeight + hangLength
  const totalSpan = hangLength + boxHalfHeight * 2
  const hangFraction = totalSpan > 0 ? hangLength / totalSpan : 0
  const segments = Math.max(16, Math.round(safeTurns * 24) + 8)

  const points: THREE.Vector3[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
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

function buildChainGeometry(turns: number, boxHalfHeight: number): THREE.TubeGeometry {
  const safeTurns = Math.max(0.001, turns)
  const curve = buildChainCurve(safeTurns, boxHalfHeight)
  return new THREE.TubeGeometry(curve, Math.max(16, Math.round(safeTurns * 24) + 8), 0.05, 8, false)
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
  outlineScale = 1.06,
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
}

const BOX_HALF_HEIGHT = 0.35

// Physics lives here, inside the Canvas's own render loop (useFrame), so
// each player's simulation runs off real frame-delta time and never fights
// React's render cycle — only a throttled progress readout bubbles back up.
// The chain geometry itself rebuilds every frame (cheap at this vertex
// count) for smooth motion instead of the previous 150ms-stepped rebuild.
function ChestRig({ windCount, won, getRawOrientation, onProgress }: ChestRigProps) {
  const gradientMap = useMemo(() => makeToonGradient(), [])
  const chestGeo = useMemo(() => new THREE.BoxGeometry(1, 0.7, 0.7), [])
  const initialChainGeo = useMemo(() => buildChainGeometry(windCount, BOX_HALF_HEIGHT), [windCount])

  const chestGroupRef = useRef<THREE.Group>(null)
  const chainMeshRef = useRef<THREE.Mesh>(null)
  const chainGeoRef = useRef<THREE.BufferGeometry>(initialChainGeo)
  const torsionRef = useRef(createTorsionState(windCount))
  const paramsRef = useRef(difficultyParams(windCount))
  const lastAlphaRef = useRef<number | null>(null)
  const lastBetaRef = useRef<number | null>(null)
  const lastReportRef = useRef(0)
  const startTimeRef = useRef(performance.now())

  useFrame((_, delta) => {
    const raw = getRawOrientation()
    if (raw !== null) {
      const newYaw = unwrapDegreesToRadians(lastAlphaRef.current, torsionRef.current.yaw.topAngle, raw.alpha)
      torsionRef.current = applyYawRotation(torsionRef.current, newYaw)
      lastAlphaRef.current = raw.alpha

      const newPitch = unwrapDegreesToRadians(lastBetaRef.current, torsionRef.current.pitch.topAngle, raw.beta)
      torsionRef.current = applyPitchRotation(torsionRef.current, newPitch)
      lastBetaRef.current = raw.beta
    }
    torsionRef.current = stepTorsion(torsionRef.current, paramsRef.current, Math.min(delta, 0.05))

    const state = torsionRef.current
    if (chestGroupRef.current) {
      chestGroupRef.current.rotation.y = state.yaw.visualAngle
      chestGroupRef.current.rotation.x = state.pitch.visualAngle
    }

    const progress = twistProgress(state, windCount)
    if (chainMeshRef.current) {
      const nextGeo = buildChainGeometry(windCount * (1 - progress), BOX_HALF_HEIGHT)
      chainGeoRef.current.dispose()
      chainGeoRef.current = nextGeo
      chainMeshRef.current.geometry = nextGeo
    }

    const now = performance.now()
    if (now - lastReportRef.current > 150) {
      lastReportRef.current = now
      onProgress(progress, state.won, (now - startTimeRef.current) / 1000)
    }
  })

  return (
    <group ref={chestGroupRef} position={[0, 0.15, 0]}>
      <OutlinedMesh geometry={chestGeo} color={won ? '#4ADE80' : '#C9A063'} gradientMap={gradientMap} />
      <mesh ref={chainMeshRef} geometry={initialChainGeo}>
        <meshToonMaterial color="#71717A" gradientMap={gradientMap} />
      </mesh>
    </group>
  )
}

export interface UntangleChestSceneProps {
  windCount: number
  won: boolean
  getRawOrientation: () => RawOrientation | null
  onProgress: (progress: number, won: boolean, elapsedSeconds: number) => void
}

export function UntangleChestScene({ windCount, won, getRawOrientation, onProgress }: UntangleChestSceneProps) {
  return (
    <Canvas orthographic camera={{ zoom: 90, position: [3, 2, 4], near: 0.1, far: 20 }} dpr={[1, 1.5]}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 2]} intensity={1.1} />
      <CameraLookAt />
      <ChestRig windCount={windCount} won={won} getRawOrientation={getRawOrientation} onProgress={onProgress} />
    </Canvas>
  )
}
