'use client'
import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
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

// Diagonal barber-pole stripe — its vertical offset is driven by the twist
// angle each frame, giving the illusion of the rope coiling/uncoiling
// without rebuilding geometry every frame.
function makeStripeTexture(): THREE.Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#C9A063'
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = '#7C5A2E'
  ctx.lineWidth = size * 0.22
  for (let i = -size; i < size * 2; i += size * 0.4) {
    ctx.beginPath()
    ctx.moveTo(i, size)
    ctx.lineTo(i + size, 0)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1, 4)
  return tex
}

// A rope curve that spirals *around* the chest's own body (matching the
// reference clip: twine wound around the crate itself, not a rope hanging
// above it) — one static geometry per wind count, no per-frame rebuild.
function buildCoilCurve(turns: number, height: number, radius: number): THREE.CatmullRomCurve3 {
  const segments = Math.max(32, Math.round(turns * 24))
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const angle = t * turns * Math.PI * 2
    const y = height / 2 - t * height
    points.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius))
  }
  return new THREE.CatmullRomCurve3(points)
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

interface ChestRigProps {
  windCount: number
  won: boolean
  getRawAlpha: () => number | null
  onProgress: (progress: number, won: boolean, elapsedSeconds: number) => void
}

// Physics lives here, inside the Canvas's own render loop (useFrame), so
// each player's simulation runs off real frame-delta time and never fights
// React's render cycle — only a throttled progress readout bubbles back up.
function ChestRig({ windCount, won, getRawAlpha, onProgress }: ChestRigProps) {
  const gradientMap = useMemo(() => makeToonGradient(), [])
  const stripeTex = useMemo(() => makeStripeTexture(), [])
  const chestGeo = useMemo(() => new THREE.BoxGeometry(1, 0.7, 0.7), [])
  const coilGeo = useMemo(() => {
    const turns = Math.max(1, windCount)
    const curve = buildCoilCurve(turns, 0.74, 0.62)
    return new THREE.TubeGeometry(curve, Math.max(64, turns * 24), 0.045, 8, false)
  }, [windCount])

  const chestGroupRef = useRef<THREE.Group>(null)
  const coilMatRef = useRef<THREE.MeshBasicMaterial>(null)
  const torsionRef = useRef(createTorsionState(windCount))
  const paramsRef = useRef(difficultyParams(windCount))
  const lastAlphaRef = useRef<number | null>(null)
  const lastReportRef = useRef(0)
  const startTimeRef = useRef(performance.now())

  useFrame((_, delta) => {
    const raw = getRawAlpha()
    if (raw !== null) {
      torsionRef.current.topAngle = unwrapDegreesToRadians(lastAlphaRef.current, torsionRef.current.topAngle, raw)
      lastAlphaRef.current = raw
    }
    torsionRef.current = stepTorsion(torsionRef.current, paramsRef.current, Math.min(delta, 0.05))

    const state = torsionRef.current
    const progress = twistProgress(state, windCount)
    if (chestGroupRef.current) chestGroupRef.current.rotation.y = state.chestAngle
    if (coilMatRef.current) {
      const map = coilMatRef.current.map
      if (map) map.offset.y = -(state.chestAngle - state.topAngle) / (Math.PI * 2)
      // Twine visibly falls away as the wrap comes undone.
      coilMatRef.current.opacity = Math.max(0, 1 - progress)
    }

    const now = performance.now()
    if (now - lastReportRef.current > 150) {
      lastReportRef.current = now
      onProgress(progress, state.won, (now - startTimeRef.current) / 1000)
    }
  })

  return (
    <group>
      {/* Two support chains hinting the crate is suspended mid-air, like the reference clip */}
      <mesh position={[-0.35, 1.25, 0]} rotation={[0, 0, 0.22]}>
        <cylinderGeometry args={[0.02, 0.02, 1.3, 6]} />
        <meshBasicMaterial color="#3A3A46" />
      </mesh>
      <mesh position={[0.35, 1.25, 0]} rotation={[0, 0, -0.22]}>
        <cylinderGeometry args={[0.02, 0.02, 1.3, 6]} />
        <meshBasicMaterial color="#3A3A46" />
      </mesh>

      <group ref={chestGroupRef} position={[0, 0.15, 0]}>
        <OutlinedMesh geometry={chestGeo} color={won ? '#4ADE80' : '#C9A063'} gradientMap={gradientMap} />
        <mesh geometry={coilGeo}>
          <meshBasicMaterial ref={coilMatRef} map={stripeTex} transparent />
        </mesh>
      </group>
    </group>
  )
}

export interface UntangleChestSceneProps {
  windCount: number
  won: boolean
  getRawAlpha: () => number | null
  onProgress: (progress: number, won: boolean, elapsedSeconds: number) => void
}

export function UntangleChestScene({ windCount, won, getRawAlpha, onProgress }: UntangleChestSceneProps) {
  return (
    <Canvas orthographic camera={{ zoom: 90, position: [3, 2, 4], near: 0.1, far: 20 }} dpr={[1, 1.5]}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 2]} intensity={1.1} />
      <CameraLookAt />
      <ChestRig windCount={windCount} won={won} getRawAlpha={getRawAlpha} onProgress={onProgress} />
    </Canvas>
  )
}
