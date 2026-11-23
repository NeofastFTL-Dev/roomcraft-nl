import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Circle, Group, Layer, Line, Path, Rect, Stage, Text } from 'react-konva';
import {
  clamp,
  distance,
  inwardNormal,
  normalize,
  perpendicular,
  roomBounds,
  roomOutline,
  roundTo,
  wallAngle,
  wallLength,
} from '@shared/geometry';
import type { Opening, Placement, Vec2, Wall } from '@shared/types';
import { useEditorStore } from '@/stores/editorStore';
import { registerPlanStage } from '@/lib/planStage';

const MIN_ZOOM = 18;
const MAX_ZOOM = 320;

interface Viewport {
  zoom: number;
  offset: { x: number; y: number };
}

export function RoomCanvas2D() {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<Viewport>({ zoom: 90, offset: { x: 60, y: 60 } });
  const fittedRef = useRef(false);

  const design = useEditorStore((state) => state.design);
  const products = useEditorStore((state) => state.products);
  const selection = useEditorStore((state) => state.selection);
  const selectedWallId = useEditorStore((state) => state.selectedWallId);
  const tool = useEditorStore((state) => state.tool);
  const wallDraft = useEditorStore((state) => state.wallDraft);
  const measurePoints = useEditorStore((state) => state.measurePoints);
  const pendingProposal = useEditorStore((state) => state.pendingProposal);
  const fitRequest = useEditorStore((state) => state.fitRequest);

  const select = useEditorStore((state) => state.select);
  const selectWall = useEditorStore((state) => state.selectWall);
  const updatePlacement = useEditorStore((state) => state.updatePlacement);
  const pushHistory = useEditorStore((state) => state.pushHistory);
  const addOpening = useEditorStore((state) => state.addOpening);
  const addPartitionWall = useEditorStore((state) => state.addPartitionWall);
  const setWallDraft = useEditorStore((state) => state.setWallDraft);
  const setMeasurePoints = useEditorStore((state) => state.setMeasurePoints);

  const { room } = design;
  const { zoom, offset } = viewport;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const fitToRoom = useCallback(() => {
    if (size.width === 0 || size.height === 0) return;
    const bounds = roomBounds(room);
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const depth = Math.max(1, bounds.maxZ - bounds.minZ);
    const nextZoom = clamp(
      Math.min((size.width - 90) / (width + 1.4), (size.height - 90) / (depth + 1.4)),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    setViewport({
      zoom: nextZoom,
      offset: {
        x: (size.width - width * nextZoom) / 2 - bounds.minX * nextZoom,
        y: (size.height - depth * nextZoom) / 2 - bounds.minZ * nextZoom,
      },
    });
  }, [room, size.width, size.height]);

  useEffect(() => {
    if (!fittedRef.current && size.width > 0 && size.height > 0) {
      fittedRef.current = true;
      fitToRoom();
    }
  }, [size.width, size.height, fitToRoom]);

  // Importing or restoring a design can bring a very different room; refit so
  // it does not open off-screen. Only explicit replacements count, because
  // `fitToRoom` gets a new identity on every room edit.
  useEffect(() => {
    if (fitRequest > 0) fitToRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest]);

  useEffect(() => {
    registerPlanStage(stageRef.current);
    return () => registerPlanStage(null);
  }, [size.width, size.height]);

  const screenToWorld = useCallback(
    (point: { x: number; y: number }): Vec2 => ({
      x: (point.x - offset.x) / zoom,
      z: (point.y - offset.y) / zoom,
    }),
    [offset.x, offset.y, zoom],
  );

  const pointerWorld = useCallback((): Vec2 | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    return screenToWorld(pointer);
  }, [screenToWorld]);

  const handleWheel = (event: KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const world = screenToWorld(pointer);
    const direction = event.evt.deltaY > 0 ? -1 : 1;
    const nextZoom = clamp(zoom * (direction > 0 ? 1.1 : 1 / 1.1), MIN_ZOOM, MAX_ZOOM);
    setViewport({
      zoom: nextZoom,
      offset: { x: pointer.x - world.x * nextZoom, y: pointer.y - world.z * nextZoom },
    });
  };

  const handleStagePointer = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const clickedEmpty = event.target === stage;
    if (!clickedEmpty) return;

    const world = pointerWorld();
    if (!world) return;
    const snapped = {
      x: roundTo(world.x, room.gridSnap),
      z: roundTo(world.z, room.gridSnap),
    };

    if (tool === 'select' || tool === 'pan') {
      select(null);
      selectWall(null);
      return;
    }
    if (tool === 'wall') {
      if (wallDraft.length === 0) {
        setWallDraft([snapped]);
      } else {
        addPartitionWall(wallDraft[0], snapped);
        setWallDraft([]);
      }
      return;
    }
    if (tool === 'measure') {
      if (measurePoints.length !== 1) setMeasurePoints([snapped]);
      else setMeasurePoints([measurePoints[0], snapped]);
      return;
    }
    if (tool === 'door' || tool === 'window') {
      useEditorStore.getState().notify('info', 'Klik op een muur om de opening te plaatsen.');
    }
  };

  const handleWallClick = (event: KonvaEventObject<Event>, wall: Wall) => {
    event.cancelBubble = true;
    if (tool !== 'door' && tool !== 'window') {
      selectWall(wall.id);
      return;
    }
    const world = pointerWorld();
    if (!world) return;
    const direction = normalize({ x: wall.end.x - wall.start.x, z: wall.end.z - wall.start.z });
    const offsetAlongWall =
      (world.x - wall.start.x) * direction.x + (world.z - wall.start.z) * direction.z;
    addOpening(wall.id, tool, clamp(offsetAlongWall, 0.2, wallLength(wall) - 0.2));
  };

  const outlinePoints = useMemo(() => {
    const points = roomOutline(room).points;
    return points.flatMap((point) => [point.x, point.z]);
  }, [room]);

  const gridLines = useMemo(() => {
    const bounds = roomBounds(room);
    const min = { x: bounds.minX - 1, z: bounds.minZ - 1 };
    const max = { x: bounds.maxX + 1, z: bounds.maxZ + 1 };
    const lines: Array<{ points: number[]; major: boolean }> = [];
    const step = 0.5;
    for (let x = Math.ceil(min.x / step) * step; x <= max.x; x += step) {
      lines.push({
        points: [x, min.z, x, max.z],
        major: Math.abs(x - Math.round(x)) < 0.001,
      });
    }
    for (let z = Math.ceil(min.z / step) * step; z <= max.z; z += step) {
      lines.push({
        points: [min.x, z, max.x, z],
        major: Math.abs(z - Math.round(z)) < 0.001,
      });
    }
    return lines;
  }, [room]);

  const stroke = 1.2 / zoom;
  const fontSmall = Math.min(0.24, 14 / zoom);

  const renderWall = (wall: Wall) => {
    const length = wallLength(wall);
    const angle = wallAngle(wall);
    const mid = { x: (wall.start.x + wall.end.x) / 2, z: (wall.start.z + wall.end.z) / 2 };
    const selected = selectedWallId === wall.id;
    const direction = normalize({ x: wall.end.x - wall.start.x, z: wall.end.z - wall.start.z });
    const leftNormal = perpendicular(direction);
    const inward = inwardNormal(room, wall);
    const side = inward.x * leftNormal.x + inward.z * leftNormal.z >= 0 ? 1 : -1;

    return (
      <Group key={wall.id} x={mid.x} y={mid.z} rotation={angle} listening>
        <Rect
          x={-length / 2}
          y={-wall.thickness / 2}
          width={length}
          height={wall.thickness}
          fill={selected ? '#6b5539' : wall.kind === 'exterior' ? '#3b342c' : '#332d27'}
          stroke={selected ? '#e0a35c' : '#6b6156'}
          strokeWidth={selected ? 2.4 / zoom : stroke}
          onClick={(event) => handleWallClick(event, wall)}
          onTap={(event) => handleWallClick(event as unknown as KonvaEventObject<Event>, wall)}
        />
        {wall.openings.map((opening) => {
          const x = opening.center - length / 2 - opening.width / 2;
          const isDoor = opening.kind === 'door';
          return (
            <Group key={opening.id}>
              <Rect
                x={x}
                y={-wall.thickness / 2}
                width={opening.width}
                height={wall.thickness}
                fill={isDoor ? '#100e0c' : '#7aa3c4'}
                opacity={isDoor ? 1 : 0.42}
                stroke={isDoor ? '#5c5247' : '#a9c6dd'}
                strokeWidth={stroke}
                onClick={(event) => handleWallClick(event, wall)}
              />
              {isDoor ? (
                <DoorSwing
                  opening={opening}
                  centerX={opening.center - length / 2}
                  side={side}
                  zoom={zoom}
                />
              ) : (
                <Line
                  points={[x, -wall.thickness / 2, x + opening.width, -wall.thickness / 2]}
                  stroke="#cfe2f0"
                  strokeWidth={1.6 / zoom}
                  listening={false}
                />
              )}
            </Group>
          );
        })}
      </Group>
    );
  };

  const renderPlacement = (placement: Placement) => {
    const product = products.find((entry) => entry.id === placement.productId);
    const selected = selection.includes(placement.id);
    const color = placement.color ?? product?.color ?? '#8d8880';
    const width = placement.dimensions.width;
    const depth = placement.dimensions.depth;
    const label = placement.label;
    const showLabel = zoom > 48 && width * zoom > 42;

    return (
      <Group
        key={placement.id}
        x={placement.position.x}
        y={placement.position.z}
        rotation={placement.rotation}
        draggable={tool === 'select' && !placement.locked}
        onClick={(event) => {
          event.cancelBubble = true;
          select(placement.id, event.evt.shiftKey);
        }}
        onTap={(event) => {
          event.cancelBubble = true;
          select(placement.id);
        }}
        onDragStart={() => {
          pushHistory();
          select(placement.id);
        }}
        onDragEnd={(event) => {
          const node = event.target;
          const snapped = {
            x: roundTo(node.x(), room.gridSnap),
            z: roundTo(node.y(), room.gridSnap),
          };
          node.position({ x: snapped.x, y: snapped.z });
          updatePlacement(placement.id, { position: snapped }, false);
        }}
        onDragMove={(event) => {
          const node = event.target;
          updatePlacement(
            placement.id,
            {
              position: {
                x: roundTo(node.x(), room.gridSnap),
                z: roundTo(node.y(), room.gridSnap),
              },
            },
            false,
          );
        }}
      >
        <Rect
          x={-width / 2}
          y={-depth / 2}
          width={width}
          height={depth}
          fill={color}
          opacity={product?.category === 'rugs' ? 0.55 : 0.94}
          cornerRadius={product?.category === 'seating' ? 0.05 : 0.012}
          stroke={selected ? '#f0b673' : 'rgba(12,10,8,0.55)'}
          strokeWidth={selected ? 3 / zoom : 1.4 / zoom}
          shadowColor="#000"
          shadowBlur={selected ? 12 : 5}
          shadowOpacity={0.35}
        />
        {product?.category === 'seating' ? (
          <Rect
            x={-width / 2}
            y={-depth / 2}
            width={width}
            height={Math.max(0.08, depth * 0.22)}
            fill="rgba(0,0,0,0.14)"
            cornerRadius={0.03}
            listening={false}
          />
        ) : null}
        {showLabel ? (
          <Text
            text={label}
            x={-width / 2 + 0.03}
            y={-fontSmall * 0.55}
            width={width - 0.06}
            align="center"
            fontSize={fontSmall}
            fill="rgba(20,16,12,0.85)"
            listening={false}
            ellipsis
            wrap="none"
          />
        ) : null}
        {selected ? (
          <>
            <Rect
              x={-width / 2 - 0.08}
              y={-depth / 2 - 0.08}
              width={width + 0.16}
              height={depth + 0.16}
              stroke="#e0a35c"
              strokeWidth={1.2 / zoom}
              dash={[4 / zoom, 4 / zoom]}
              listening={false}
            />
            <Text
              text={`${width.toFixed(2).replace('.', ',')} × ${depth.toFixed(2).replace('.', ',')} m`}
              x={-1.2}
              y={depth / 2 + 0.12}
              width={2.4}
              align="center"
              fontSize={fontSmall * 0.85}
              fill="#e0a35c"
              listening={false}
            />
            <Circle
              x={0}
              y={-depth / 2 - 0.42}
              radius={0.13}
              fill="#e0a35c"
              stroke="#1a1309"
              strokeWidth={1 / zoom}
              draggable
              onDragStart={() => pushHistory()}
              onDragMove={(event) => {
                const stage = stageRef.current;
                if (!stage) return;
                const pointer = stage.getPointerPosition();
                if (!pointer) return;
                const world = screenToWorld(pointer);
                const angle =
                  (Math.atan2(world.z - placement.position.z, world.x - placement.position.x) *
                    180) /
                    Math.PI +
                  90;
                const snapped = Math.round(angle / 15) * 15;
                updatePlacement(placement.id, { rotation: snapped }, false);
                event.target.position({ x: 0, y: -depth / 2 - 0.42 });
              }}
            />
            <Line
              points={[0, -depth / 2 - 0.05, 0, -depth / 2 - 0.29]}
              stroke="#e0a35c"
              strokeWidth={1 / zoom}
              listening={false}
            />
          </>
        ) : null}
      </Group>
    );
  };

  return (
    <div
      className="canvas-host"
      ref={hostRef}
      id="roomcraft-2d"
      style={{ cursor: tool === 'select' ? 'default' : tool === 'pan' ? 'grab' : 'crosshair' }}
    >
      {size.width > 0 ? (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          scaleX={zoom}
          scaleY={zoom}
          x={offset.x}
          y={offset.y}
          draggable={tool === 'pan'}
          onDragEnd={(event) => {
            setViewport((current) => ({
              ...current,
              offset: { x: event.target.x(), y: event.target.y() },
            }));
          }}
          onWheel={handleWheel}
          onClick={handleStagePointer}
          onTap={handleStagePointer}
        >
          <Layer listening={false}>
            {gridLines.map((line, index) => (
              <Line
                key={`grid-${index}`}
                points={line.points}
                stroke={line.major ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.035)'}
                strokeWidth={0.9 / zoom}
              />
            ))}
            {outlinePoints.length >= 6 ? (
              <Line
                points={outlinePoints}
                closed
                fill={room.floor.color}
                opacity={0.22}
                stroke={room.floor.color}
                strokeWidth={1 / zoom}
              />
            ) : null}
          </Layer>

          <Layer>{room.walls.map(renderWall)}</Layer>

          <Layer>
            {[...design.placements]
              .sort((a, b) => {
                const aRug = products.find((p) => p.id === a.productId)?.category === 'rugs' ? 0 : 1;
                const bRug = products.find((p) => p.id === b.productId)?.category === 'rugs' ? 0 : 1;
                return aRug - bRug || a.elevation - b.elevation;
              })
              .map(renderPlacement)}
          </Layer>

          {pendingProposal ? (
            <Layer listening={false} opacity={0.85}>
              {pendingProposal.placements.map((placement) => (
                <Group
                  key={`ghost-${placement.id}`}
                  x={placement.position.x}
                  y={placement.position.z}
                  rotation={placement.rotation}
                >
                  <Rect
                    x={-placement.dimensions.width / 2}
                    y={-placement.dimensions.depth / 2}
                    width={placement.dimensions.width}
                    height={placement.dimensions.depth}
                    fill="rgba(127,168,139,0.25)"
                    stroke="#7fa88b"
                    strokeWidth={1.6 / zoom}
                    dash={[6 / zoom, 4 / zoom]}
                    cornerRadius={0.02}
                  />
                  <Text
                    text={placement.label}
                    x={-placement.dimensions.width / 2}
                    y={-fontSmall * 0.5}
                    width={placement.dimensions.width}
                    align="center"
                    fontSize={fontSmall * 0.9}
                    fill="#cfe6d7"
                    wrap="none"
                    ellipsis
                  />
                </Group>
              ))}
            </Layer>
          ) : null}

          <Layer listening={false}>
            {wallDraft.length === 1 ? (
              <Circle x={wallDraft[0].x} y={wallDraft[0].z} radius={0.09} fill="#e0a35c" />
            ) : null}
            {measurePoints.length === 2 ? (
              <>
                <Line
                  points={[
                    measurePoints[0].x,
                    measurePoints[0].z,
                    measurePoints[1].x,
                    measurePoints[1].z,
                  ]}
                  stroke="#7aa3c4"
                  strokeWidth={2 / zoom}
                  dash={[6 / zoom, 4 / zoom]}
                />
                <Text
                  text={`${distance(measurePoints[0], measurePoints[1]).toFixed(2).replace('.', ',')} m`}
                  x={(measurePoints[0].x + measurePoints[1].x) / 2 - 0.5}
                  y={(measurePoints[0].z + measurePoints[1].z) / 2 - 0.36}
                  width={1}
                  align="center"
                  fontSize={0.22}
                  fill="#cfe2f0"
                />
              </>
            ) : null}
            {measurePoints.length === 1 ? (
              <Circle x={measurePoints[0].x} y={measurePoints[0].z} radius={0.09} fill="#7aa3c4" />
            ) : null}
          </Layer>
        </Stage>
      ) : null}

      <div className="stage-toolbar">
        <button
          type="button"
          className="icon-btn"
          title="Inzoomen"
          onClick={() =>
            setViewport((current) => {
              const next = clamp(current.zoom * 1.2, MIN_ZOOM, MAX_ZOOM);
              const center = { x: size.width / 2, y: size.height / 2 };
              const world = screenToWorld(center);
              return {
                zoom: next,
                offset: { x: center.x - world.x * next, y: center.y - world.z * next },
              };
            })
          }
        >
          +
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Uitzoomen"
          onClick={() =>
            setViewport((current) => {
              const next = clamp(current.zoom / 1.2, MIN_ZOOM, MAX_ZOOM);
              const center = { x: size.width / 2, y: size.height / 2 };
              const world = screenToWorld(center);
              return {
                zoom: next,
                offset: { x: center.x - world.x * next, y: center.y - world.z * next },
              };
            })
          }
        >
          −
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={fitToRoom}>
          Passend maken
        </button>
      </div>

      <div className="stage-hint">
        {tool === 'wall'
          ? 'Klik twee punten voor een scheidingswand'
          : tool === 'door'
            ? 'Klik op een muur voor een deur'
            : tool === 'window'
              ? 'Klik op een muur voor een raam'
              : tool === 'measure'
                ? 'Klik twee punten om te meten'
                : tool === 'pan'
                  ? 'Sleep om te verschuiven'
                  : 'Sleep meubels · shift-klik voor meerdere'}
      </div>
    </div>
  );
}

function DoorSwing({
  opening,
  centerX,
  side,
  zoom,
}: {
  opening: Opening;
  centerX: number;
  side: number;
  zoom: number;
}) {
  const hingeX = opening.hinge === 'left' ? centerX - opening.width / 2 : centerX + opening.width / 2;
  const otherX = opening.hinge === 'left' ? centerX + opening.width / 2 : centerX - opening.width / 2;
  const sweep = (opening.hinge === 'left') === (side > 0) ? 1 : 0;
  const leafEnd = { x: hingeX, y: side * opening.width };

  return (
    <>
      <Path
        data={`M ${hingeX} 0 L ${leafEnd.x} ${leafEnd.y}`}
        stroke="#cdbfa9"
        strokeWidth={2 / zoom}
        listening={false}
      />
      <Path
        data={`M ${otherX} 0 A ${opening.width} ${opening.width} 0 0 ${sweep} ${leafEnd.x} ${leafEnd.y}`}
        stroke="rgba(205,191,169,0.4)"
        strokeWidth={1.2 / zoom}
        dash={[4 / zoom, 4 / zoom]}
        listening={false}
      />
    </>
  );
}
