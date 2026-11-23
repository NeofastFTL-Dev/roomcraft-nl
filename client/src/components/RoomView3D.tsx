import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  deg,
  normalizeAngle,
  rad,
  roomBounds,
  roomCentroid,
  wallAngle,
  wallLength,
} from '@shared/geometry';
import type { Placement, RoomSpec, Wall } from '@shared/types';
import { useEditorStore } from '@/stores/editorStore';
import { FurnitureModel3D } from './FurnitureModel3D';

type GizmoMode = 'translate' | 'rotate';

export function RoomView3D() {
  const design = useEditorStore((state) => state.design);
  const products = useEditorStore((state) => state.products);
  const selection = useEditorStore((state) => state.selection);
  const showCeiling = useEditorStore((state) => state.showCeiling);
  const setShowCeiling = useEditorStore((state) => state.setShowCeiling);
  const select = useEditorStore((state) => state.select);
  const updatePlacement = useEditorStore((state) => state.updatePlacement);
  const pushHistory = useEditorStore((state) => state.pushHistory);

  const [mode, setMode] = useState<GizmoMode>('translate');
  const [resetToken, setResetToken] = useState(0);

  const bounds = useMemo(() => roomBounds(design.room), [design.room]);
  const center = useMemo(() => roomCentroid(design.room), [design.room]);
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 3);

  const selected =
    selection.length === 1
      ? design.placements.find((placement) => placement.id === selection[0]) ?? null
      : null;

  const cameraPosition: [number, number, number] = [
    center.x + span * 0.95,
    Math.max(2.4, span * 0.9),
    center.z + span * 1.2,
  ];

  return (
    <div className="canvas-host" id="roomcraft-3d" style={{ position: 'relative' }}>
      <Canvas
        shadows={{ enabled: true, type: THREE.PCFShadowMap }}
        dpr={[1, 1.75]}
        camera={{ position: cameraPosition, fov: 45, near: 0.05, far: 200 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        onPointerMissed={() => select(null)}
      >
        <color attach="background" args={['#13100b']} />
        <CameraRig token={resetToken} center={center} span={span} />
        <ambientLight intensity={0.55} />
        <hemisphereLight args={['#fff2dd', '#241d16', 0.55]} />
        <directionalLight
          castShadow
          position={[center.x + span * 0.9, span * 1.8, center.z + span * 0.8]}
          intensity={1.7}
          color="#fff0d8"
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-span}
          shadow-camera-right={span}
          shadow-camera-top={span}
          shadow-camera-bottom={-span}
          shadow-camera-near={0.1}
          shadow-camera-far={span * 4}
          shadow-bias={-0.0005}
        />
        <pointLight
          position={[center.x, Math.max(2, design.room.ceilingHeight - 0.3), center.z]}
          intensity={0.35}
          color="#ffd9a0"
          distance={span * 1.6}
        />

        <Suspense fallback={null}>
          <RoomShell room={design.room} showCeiling={showCeiling} />
          <group>
            {design.placements.map((placement) => {
              const product = products.find((entry) => entry.id === placement.productId);
              return (
                <group
                  key={placement.id}
                  position={[placement.position.x, placement.elevation, placement.position.z]}
                  rotation={[0, -rad(placement.rotation), 0]}
                >
                  <FurnitureModel3D
                    placement={placement}
                    product={product}
                    selected={selection.includes(placement.id)}
                    onSelect={(additive) => select(placement.id, additive)}
                  />
                </group>
              );
            })}
          </group>
        </Suspense>

        {selected ? (
          <SelectionGizmo
            placement={selected}
            mode={mode}
            onCommitStart={pushHistory}
            onMove={(position, rotation) => updatePlacement(selected.id, { position, rotation }, false)}
          />
        ) : null}

        <OrbitControls
          makeDefault
          target={[center.x, 0.9, center.z]}
          maxPolarAngle={Math.PI / 2.04}
          minDistance={1}
          maxDistance={span * 4}
          enableDamping
          dampingFactor={0.08}
        />
        <gridHelper
          args={[Math.max(span * 3, 12), Math.max(24, Math.round(span * 3) * 2), '#2e2720', '#1c1712']}
          position={[center.x, -0.002, center.z]}
        />
        <mesh position={[center.x, -0.07, center.z]} receiveShadow>
          <boxGeometry args={[span + 1.6, 0.12, span + 1.6]} />
          <meshStandardMaterial color="#241e17" roughness={0.9} />
        </mesh>
      </Canvas>

      <div className="view-pane-header">
        <span className="view-badge">3D-weergave</span>
      </div>

      <div className="stage-toolbar">
        <button
          type="button"
          className={`btn btn-sm ${mode === 'translate' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setMode('translate')}
          title="Meubel verplaatsen"
        >
          Verplaatsen
        </button>
        <button
          type="button"
          className={`btn btn-sm ${mode === 'rotate' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setMode('rotate')}
          title="Meubel draaien"
        >
          Draaien
        </button>
        <button
          type="button"
          className={`btn btn-sm ${showCeiling ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setShowCeiling(!showCeiling)}
          title="Plafond tonen of verbergen"
        >
          Plafond
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setResetToken((token) => token + 1)}
        >
          Camera herstellen
        </button>
      </div>
      <div className="stage-hint">Sleep om te draaien · scroll om te zoomen</div>
    </div>
  );
}

function CameraRig({
  token,
  center,
  span,
}: {
  token: number;
  center: { x: number; z: number };
  span: number;
}) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as
    | { target: THREE.Vector3; update: () => void }
    | null;

  useEffect(() => {
    camera.position.set(center.x + span * 0.95, Math.max(2.4, span * 0.9), center.z + span * 1.2);
    camera.lookAt(center.x, 0.9, center.z);
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(center.x, 0.9, center.z);
      controls.update();
    }
    // Only react to explicit resets and room geometry changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, center.x, center.z, span]);

  return null;
}

function RoomShell({ room, showCeiling }: { room: RoomSpec; showCeiling: boolean }) {
  return (
    <group>
      <FloorMesh room={room} />
      {room.walls.map((wall) => (
        <WallMesh key={wall.id} wall={wall} color={room.wallColor} />
      ))}
      {showCeiling ? (
        <mesh position={[0, room.ceilingHeight, 0]} receiveShadow>
          <CeilingGeometry room={room} />
          <meshStandardMaterial
            color={room.ceilingColor}
            roughness={0.95}
            side={THREE.DoubleSide}
            transparent
            opacity={0.55}
          />
        </mesh>
      ) : null}
    </group>
  );
}

function FloorMesh({ room }: { room: RoomSpec }) {
  const geometry = useMemo(() => {
    const points = room.walls.filter((wall) => wall.kind === 'exterior').map((wall) => wall.start);
    if (points.length < 3) return null;
    const shape = new THREE.Shape();
    points.forEach((point, index) => {
      if (index === 0) shape.moveTo(point.x, -point.z);
      else shape.lineTo(point.x, -point.z);
    });
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    return geo;
  }, [room.walls]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={room.floor.color} roughness={0.72} metalness={0.02} />
    </mesh>
  );
}

function CeilingGeometry({ room }: { room: RoomSpec }) {
  const geometry = useMemo(() => {
    const points = room.walls.filter((wall) => wall.kind === 'exterior').map((wall) => wall.start);
    if (points.length < 3) return null;
    const shape = new THREE.Shape();
    points.forEach((point, index) => {
      if (index === 0) shape.moveTo(point.x, -point.z);
      else shape.lineTo(point.x, -point.z);
    });
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [room.walls]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;
  return <primitive object={geometry} attach="geometry" />;
}

function WallMesh({ wall, color }: { wall: Wall; color: string }) {
  const geometry = useMemo(() => {
    const length = wallLength(wall);
    const shape = new THREE.Shape();
    shape.moveTo(-length / 2, 0);
    shape.lineTo(length / 2, 0);
    shape.lineTo(length / 2, wall.height);
    shape.lineTo(-length / 2, wall.height);
    shape.closePath();

    for (const opening of wall.openings) {
      const x0 = opening.center - length / 2 - opening.width / 2;
      const x1 = x0 + opening.width;
      const y0 = opening.sillHeight;
      const y1 = Math.min(wall.height, y0 + opening.height);
      if (x1 <= x0 || y1 <= y0) continue;
      const hole = new THREE.Path();
      hole.moveTo(x0, y0);
      hole.lineTo(x1, y0);
      hole.lineTo(x1, y1);
      hole.lineTo(x0, y1);
      hole.closePath();
      shape.holes.push(hole);
    }

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: wall.thickness,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geo.translate(0, 0, -wall.thickness / 2);
    geo.computeVertexNormals();
    return geo;
  }, [wall]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const midpoint = {
    x: (wall.start.x + wall.end.x) / 2,
    z: (wall.start.z + wall.end.z) / 2,
  };

  return (
    <mesh
      geometry={geometry}
      position={[midpoint.x, 0, midpoint.z]}
      rotation={[0, -rad(wallAngle(wall)), 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={color}
        roughness={0.95}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function SelectionGizmo({
  placement,
  mode,
  onMove,
  onCommitStart,
}: {
  placement: Placement;
  mode: GizmoMode;
  onMove: (position: { x: number; z: number }, rotation: number) => void;
  onCommitStart: () => void;
}) {
  const [object, setObject] = useState<THREE.Object3D | null>(null);

  return (
    <>
      <group
        ref={setObject}
        position={[placement.position.x, 0.05, placement.position.z]}
        rotation={[0, -rad(placement.rotation), 0]}
      />
      {object ? (
        <TransformControls
          object={object}
          mode={mode}
          space={mode === 'translate' ? 'world' : 'local'}
          showY={mode === 'rotate'}
          translationSnap={0.05}
          rotationSnap={Math.PI / 12}
          size={0.8}
          onMouseDown={onCommitStart}
          onObjectChange={() => {
            const position = object.position;
            const rotation = normalizeAngle(-deg(object.rotation.y));
            if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) return;
            onMove({ x: Math.round(position.x * 1000) / 1000, z: Math.round(position.z * 1000) / 1000 }, Math.round(rotation));
          }}
        />
      ) : null}
    </>
  );
}
