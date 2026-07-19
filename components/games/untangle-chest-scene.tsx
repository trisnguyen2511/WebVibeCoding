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

// A chain curve that spirals *around* the chest's own body (matching the
// reference clip: a chain wound around the crate itself, not a rope hanging
// above it), for `turns` full loops from top to bottom.
function buildCoilCurve(turns: number, height: number, radius: number): THREE.CatmullRomCurve3 {
  const segments = Math.max(16, Math.round(turns * 24))
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const angle = t * turns * Math.PI * 2
    const y = height / 2 - t * height
    points.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius))
  }
  return new THREE.CatmullRomCurve3(points)
}

function buildCoilGeometry(turns: number): THREE.TubeGeometry {
  const safeTurns = Math.max(0.02, turns)
  return new THREE.TubeGeometry(buildCoilCurve(safeTurns, 0.74, 0.6), Math.max(16, Math.round(safeTurns * 24)), 0.055, 8, false)
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
  const chestGeo = useMemo(() => new THREE.BoxGeometry(1, 0.7, 0.7), [])
  const initialCoilGeo = useMemo(() => buildCoilGeometry(windCount), [windCount])

  const chestGroupRef = useRef<THREE.Group>(null)
  const coilMeshRef = useRef<THREE.Mesh>(null)
  const coilGeoRef = useRef<THREE.BufferGeometry>(initialCoilGeo)
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
    if (chestGroupRef.current) chestGroupRef.current.rotation.y = state.chestAngle

    const progress = twistProgress(state, windCount)
    const now = performance.now()
    if (now - lastReportRef.current > 150) {
      lastReportRef.current = now
      // Rebuild the chain with fewer physical loops as progress climbs —
      // wraps visibly coming undone, not just a fading texture.
      if (coilMeshRef.current) {
        const nextGeo = buildCoilGeometry(windCount * (1 - progress))
        coilGeoRef.current.dispose()
        coilGeoRef.current = nextGeo
        coilMeshRef.current.geometry = nextGeo
      }
      onProgress(progress, state.won, (now - startTimeRef.current) / 1000)
    }
  })

  return (
    <group>
      {/* Single support chain — the crate hangs from one line, like the reference clip */}
      <mesh position={[0, 1.25, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 1.3, 6]} />
        <meshBasicMaterial color="#3A3A46" />
      </mesh>

      <group ref={chestGroupRef} position={[0, 0.15, 0]}>
        <OutlinedMesh geometry={chestGeo} color={won ? '#4ADE80' : '#C9A063'} gradientMap={gradientMap} />
        <mesh ref={coilMeshRef} geometry={initialCoilGeo}>
          <meshToonMaterial color="#71717A" gradientMap={gradientMap} />
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
