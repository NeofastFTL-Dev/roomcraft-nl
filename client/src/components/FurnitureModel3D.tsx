import { Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { FurnitureDimensions, Placement, Product } from '@shared/types';
import { ErrorBoundary } from './ErrorBoundary';

interface Props {
  placement: Placement;
  product?: Product;
  selected?: boolean;
  onSelect?: (additive: boolean) => void;
}

export function FurnitureModel3D({ placement, product, selected, onSelect }: Props) {
  const color = placement.color ?? product?.color ?? '#8d8880';
  const dimensions = placement.dimensions;

  const content = product?.modelUrl ? (
    <ErrorBoundary
      fallback={<ProceduralFurniture category={product.category} dimensions={dimensions} color={color} product={product} />}
    >
      <Suspense fallback={<ProceduralFurniture category={product.category} dimensions={dimensions} color={color} product={product} />}>
        <GltfModel url={product.modelUrl} dimensions={dimensions} />
      </Suspense>
    </ErrorBoundary>
  ) : (
    <ProceduralFurniture
      category={product?.category ?? 'decor'}
      dimensions={dimensions}
      color={color}
      product={product}
    />
  );

  return (
    <group
      onClick={(event) => {
        if (!onSelect) return;
        event.stopPropagation();
        onSelect(Boolean(event.nativeEvent.shiftKey));
      }}
    >
      {content}
      {selected ? (
        <mesh position={[0, dimensions.height / 2, 0]}>
          <boxGeometry
            args={[
              dimensions.width + 0.05,
              dimensions.height + 0.05,
              dimensions.depth + 0.05,
            ]}
          />
          <meshBasicMaterial color="#e0a35c" wireframe transparent opacity={0.5} />
        </mesh>
      ) : null}
    </group>
  );
}

interface GltfProps {
  url: string;
  dimensions: FurnitureDimensions;
}

function GltfModel({ url, dimensions }: GltfProps) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const scale = Math.min(
      dimensions.width / Math.max(size.x, 0.001),
      dimensions.height / Math.max(size.y, 0.001),
      dimensions.depth / Math.max(size.z, 0.001),
    );
    const center = box.getCenter(new THREE.Vector3());
    return {
      scale,
      offset: [-center.x * scale, -box.min.y * scale, -center.z * scale] as [number, number, number],
    };
  }, [cloned, dimensions.width, dimensions.depth, dimensions.height]);

  return (
    <group position={fit.offset}>
      <group scale={fit.scale}>
        <primitive object={cloned} />
      </group>
    </group>
  );
}

interface ProceduralProps {
  category: Product['category'];
  dimensions: FurnitureDimensions;
  color: string;
  product?: Product;
}

function ProceduralFurniture({ category, dimensions, color, product }: ProceduralProps) {
  const { width: w, depth: d, height: h } = dimensions;
  const dark = new THREE.Color(color).multiplyScalar(0.72).getStyle();
  const light = new THREE.Color(color).multiplyScalar(1.12).getStyle();

  const material = (materialColor: string) => (
    <meshStandardMaterial color={materialColor} roughness={0.8} metalness={0.05} />
  );

  switch (category) {
    case 'seating': {
      const seatTop = h * 0.45;
      const backHeight = h - seatTop;
      return (
        <group>
          <mesh position={[0, seatTop / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, seatTop, d]} />
            {material(dark)}
          </mesh>
          <mesh position={[0, seatTop + (backHeight * 0.02) / 2, 0]} castShadow>
            <boxGeometry args={[w * 0.97, h * 0.14, d * 0.97]} />
            {material(light)}
          </mesh>
          <mesh position={[0, seatTop + backHeight / 2, -d / 2 + 0.09]} castShadow>
            <boxGeometry args={[w, backHeight, 0.18]} />
            {material(dark)}
          </mesh>
          {w >= 1.4 ? (
            <>
              <mesh position={[-w / 2 + 0.08, seatTop + h * 0.12, 0]} castShadow>
                <boxGeometry args={[0.16, h * 0.24, d * 0.94]} />
                {material(dark)}
              </mesh>
              <mesh position={[w / 2 - 0.08, seatTop + h * 0.12, 0]} castShadow>
                <boxGeometry args={[0.16, h * 0.24, d * 0.94]} />
                {material(dark)}
              </mesh>
            </>
          ) : null}
          {product?.tags.includes('office') ? (
            <mesh position={[0, h * 0.05, 0]}>
              <cylinderGeometry args={[0.28, 0.28, 0.05, 16]} />
              {material('#2b2b2b')}
            </mesh>
          ) : (
            [0, 1, 2, 3].map((index) => (
              <mesh
                key={index}
                position={[
                  index % 2 === 0 ? -w / 2 + 0.07 : w / 2 - 0.07,
                  0.06,
                  index < 2 ? -d / 2 + 0.07 : d / 2 - 0.07,
                ]}
              >
                <boxGeometry args={[0.05, 0.12, 0.05]} />
                {material('#4a3a2a')}
              </mesh>
            ))
          )}
        </group>
      );
    }
    case 'tables': {
      const topThickness = 0.045;
      const round = product?.tags.includes('round');
      return (
        <group>
          {round ? (
            <mesh position={[0, h - topThickness / 2, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[w / 2, w / 2, topThickness, 32]} />
              {material(color)}
            </mesh>
          ) : (
            <mesh position={[0, h - topThickness / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[w, topThickness, d]} />
              {material(color)}
            </mesh>
          )}
          {round ? (
            <>
              <mesh position={[0, (h - topThickness) / 2, 0]} castShadow>
                <cylinderGeometry args={[0.04, 0.04, h - topThickness, 12]} />
                {material('#3c3730')}
              </mesh>
              <mesh position={[0, 0.02, 0]} castShadow>
                <cylinderGeometry args={[w * 0.22, w * 0.24, 0.04, 20]} />
                {material('#3c3730')}
              </mesh>
            </>
          ) : (
            [0, 1, 2, 3].map((index) => (
              <mesh
                key={index}
                position={[
                  index % 2 === 0 ? -w / 2 + 0.06 : w / 2 - 0.06,
                  (h - topThickness) / 2,
                  index < 2 ? -d / 2 + 0.06 : d / 2 - 0.06,
                ]}
                castShadow
              >
                <boxGeometry args={[0.055, h - topThickness, 0.055]} />
                {material('#3c3730')}
              </mesh>
            ))
          )}
        </group>
      );
    }
    case 'storage':
      return (
        <group>
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, h, d]} />
            {material(color)}
          </mesh>
          <mesh position={[0, h / 2, d / 2 + 0.008]}>
            <boxGeometry args={[w * 0.96, h * 0.94, 0.012]} />
            {material(dark)}
          </mesh>
          <mesh position={[0, h * 0.52, d / 2 + 0.02]}>
            <boxGeometry args={[0.016, h * 0.9, 0.012]} />
            {material('#1c1712')}
          </mesh>
          <mesh position={[-w * 0.06, h * 0.52, d / 2 + 0.035]}>
            <boxGeometry args={[0.02, 0.14, 0.02]} />
            {material('#c9a24a')}
          </mesh>
          <mesh position={[w * 0.06, h * 0.52, d / 2 + 0.035]}>
            <boxGeometry args={[0.02, 0.14, 0.02]} />
            {material('#c9a24a')}
          </mesh>
        </group>
      );
    case 'beds':
      return (
        <group>
          <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, 0.3, d]} />
            {material(color)}
          </mesh>
          <mesh position={[0, 0.41, 0]} castShadow>
            <boxGeometry args={[w * 0.94, 0.22, d * 0.94]} />
            {material('#efe6d8')}
          </mesh>
          <mesh position={[0, h / 2, -d / 2 + 0.05]} castShadow>
            <boxGeometry args={[w, h, 0.1]} />
            {material(dark)}
          </mesh>
          <mesh position={[0, 0.56, -d / 2 + 0.42]} castShadow>
            <boxGeometry args={[w * 0.42, 0.09, 0.34]} />
            {material('#f7f1e6')}
          </mesh>
          <mesh position={[0, 0.55, d * 0.12]} castShadow>
            <boxGeometry args={[w * 0.98, 0.05, d * 0.55]} />
            {material(light)}
          </mesh>
        </group>
      );
    case 'lighting': {
      const pendant = product?.tags.includes('pendant') || product?.tags.includes('ceiling');
      if (pendant) {
        return (
          <group>
            <mesh position={[0, 0.5, 0]}>
              <cylinderGeometry args={[0.006, 0.006, 1, 6]} />
              {material('#2c2a26')}
            </mesh>
            <mesh position={[0, 0.12, 0]} castShadow>
              <coneGeometry args={[w / 2, 0.24, 24, 1, true]} />
              <meshStandardMaterial
                color={color}
                roughness={0.5}
                metalness={0.4}
                side={THREE.DoubleSide}
                emissive="#ffd9a0"
                emissiveIntensity={0.25}
              />
            </mesh>
            <pointLight position={[0, 0.1, 0]} intensity={0.6} distance={4} color="#ffd9a0" />
          </group>
        );
      }
      const shadeY = h * 0.82;
      return (
        <group>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[w * 0.3, w * 0.34, 0.04, 18]} />
            {material('#2f2c27')}
          </mesh>
          <mesh position={[0, h * 0.42, 0]} castShadow>
            <cylinderGeometry args={[0.014, 0.014, h * 0.82, 8]} />
            {material('#2f2c27')}
          </mesh>
          <mesh position={[0, shadeY + 0.14, 0]} castShadow>
            <coneGeometry args={[w * 0.46, 0.28, 24, 1, true]} />
            <meshStandardMaterial
              color={color}
              roughness={0.65}
              side={THREE.DoubleSide}
              emissive="#ffd9a0"
              emissiveIntensity={0.35}
            />
          </mesh>
          <pointLight position={[0, shadeY, 0]} intensity={0.5} distance={3.5} color="#ffd9a0" />
        </group>
      );
    }
    case 'rugs':
      return (
        <mesh position={[0, 0.007, 0]} receiveShadow>
          <boxGeometry args={[w, 0.014, d]} />
          <meshStandardMaterial color={color} roughness={1} />
        </mesh>
      );
    case 'plants': {
      const potHeight = Math.min(0.36, h * 0.3);
      return (
        <group>
          <mesh position={[0, potHeight / 2, 0]} castShadow>
            <cylinderGeometry args={[w * 0.32, w * 0.26, potHeight, 18]} />
            {material('#b98a72')}
          </mesh>
          <mesh position={[0, potHeight + h * 0.28, 0]} castShadow>
            <sphereGeometry args={[w * 0.42, 18, 14]} />
            <meshStandardMaterial color="#3f6a4a" roughness={0.9} />
          </mesh>
          <mesh position={[w * 0.22, potHeight + h * 0.45, 0.06]} castShadow>
            <sphereGeometry args={[w * 0.3, 16, 12]} />
            <meshStandardMaterial color="#4d7a55" roughness={0.9} />
          </mesh>
          <mesh position={[-w * 0.2, potHeight + h * 0.5, -0.04]} castShadow>
            <sphereGeometry args={[w * 0.26, 16, 12]} />
            <meshStandardMaterial color="#355c40" roughness={0.9} />
          </mesh>
        </group>
      );
    }
    case 'decor':
    default: {
      const isMirror = product?.tags.includes('mirror');
      return (
        <group>
          <mesh position={[0, h / 2, 0]} castShadow>
            <boxGeometry args={[w, h, Math.max(0.03, d)]} />
            {material(isMirror ? '#cfd6d8' : color)}
          </mesh>
          <mesh position={[0, h / 2, -Math.max(0.03, d) / 2 - 0.006]}>
            <boxGeometry args={[w * 1.06, h * 1.04, 0.012]} />
            {material('#3b342c')}
          </mesh>
        </group>
      );
    }
  }
}
