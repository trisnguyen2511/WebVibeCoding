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
  onProgress: (progress: number, won: boolean) => void
}

// Physics lives here, inside the Canvas's own render loop (useFrame), so
// each player's simulation runs off real frame-delta time and never fights
// React's render cycle — only a throttled progress readout bubbles back up.
function ChestRig({ windCount, won, getRawAlpha, onProgress }: ChestRigProps) {
  const gradientMap = useMemo(() => makeToonGradient(), [])
  const stripeTex = useMemo(() => makeStripeTexture(), [])
  const chestGeo = useMemo(() => new THREE.BoxGeometry(1, 0.7, 0.7), [])
  const ropeGeo = useMemo(() => new THREE.CylinderGeometry(0.12, 0.12, 1.6, 16, 1, true), [])

  const chestGroupRef = useRef<THREE.Group>(null)
  const ropeMatRef = useRef<THREE.MeshBasicMaterial>(null)
  const torsionRef = useRef(createTorsionState(windCount))
  const paramsRef = useRef(difficultyParams(windCount))
  const lastAlphaRef = useRef<number | null>(null)
  const lastReportRef = useRef(0)

  useFrame((_, delta) => {
    const raw = getRawAlpha()
    if (raw !== null) {
      torsionRef.current.topAngle = unwrapDegreesToRadians(lastAlphaRef.current, torsionRef.current.topAngle, raw)
      lastAlphaRef.current = raw
    }
    torsionRef.current = stepTorsion(torsionRef.current, paramsRef.current, Math.min(delta, 0.05))

    const state = torsionRef.current
    if (chestGroupRef.current) chestGroupRef.current.rotation.y = state.chestAngle
    const map = ropeMatRef.current?.map
    if (map) map.offset.y = -(state.chestAngle - state.topAngle) / (Math.PI * 2)

    const now = performance.now()
    if (now - lastReportRef.current > 150) {
      lastReportRef.current = now
      onProgress(twistProgress(state, windCount), state.won)
    }
  })

  return (
    <group>
      <mesh position={[0, 1.9, 0]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshToonMaterial color="#52525B" gradientMap={gradientMap} />
      </mesh>

      <mesh position={[0, 1.05, 0]} geometry={ropeGeo}>
        <meshBasicMaterial ref={ropeMatRef} map={stripeTex} />
      </mesh>

      <group ref={chestGroupRef} position={[0, 0.15, 0]}>
        <OutlinedMesh geometry={chestGeo} color={won ? '#4ADE80' : '#A78BFA'} gradientMap={gradientMap} />
      </group>
    </group>
  )
}

export interface UntangleChestSceneProps {
  windCount: number
  won: boolean
  getRawAlpha: () => number | null
  onProgress: (progress: number, won: boolean) => void
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
