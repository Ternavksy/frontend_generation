import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from 'react-konva';

const FALLBACK_CANVAS_WIDTH = 1200;
const FALLBACK_CANVAS_HEIGHT = 720;
const POLYGON_CORRECTION_MIN_SCREEN_DISTANCE = 4;
const POLYGON_CORRECTION_HIT_SCREEN_DISTANCE = 34;

export type ToolMode = 'select' | 'box' | 'polygon' | 'zoom' | 'move' | 'brush' | 'eraser' | 'split';
export type ActiveToolMode = ToolMode | null;

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PolygonPoint {
  x: number;
  y: number;
}

interface PolygonCorrectionDraft {
  target: 'draft' | 'object';
  objectId?: AnnotationObject['id'];
  startIndex: number;
  points: PolygonPoint[];
  hasMoved: boolean;
}

interface PolygonDraftHit {
  index: number;
  distance: number;
}

export interface AnnotationObject {
  id: number | string;
  label: string;
  color: string;
  type: 'box' | 'polygon' | 'brush';
  operation?: 'paint' | 'erase';
  source: 'manual' | 'imported' | 'model';
  modelName?: string;
  score?: number;
  area?: Area;
  points?: PolygonPoint[];
}

export type CompareViewMode = 'single' | 'split';

interface WorkspaceCanvasProps {
  activeTool: ActiveToolMode;
  onToolChange: (tool: ActiveToolMode) => void;
  activeLabel: string;
  maskOpacity: number;
  onMaskOpacityChange: (opacity: number) => void;
  compareViewMode: CompareViewMode;
  compareLeftSource: string;
  compareRightSource: string;
  imageName: string;
  imageSrc: string;
  imageIndex: number;
  imageCount: number;
  canUndo: boolean;
  canRedo: boolean;
  statusMessage: string;
  isMenuOpen: boolean;
  hasSavedDraft: boolean;
  selectedObjectId: AnnotationObject['id'] | null;
  objects: AnnotationObject[];
  hiddenLabels: string[];
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFirstImage: () => void;
  onPreviousImage: () => void;
  onNextImage: () => void;
  onLastImage: () => void;
  onSelectImageByIndex: (index: number) => void;
  onOpenImagePicker: () => void;
  onLoadSaved: () => void;
  onExportProject: () => void;
  onResetAnnotations: () => void;
  onSelectObject: (id: AnnotationObject['id'] | null) => void;
  onCreateObject: (object: Omit<AnnotationObject, 'id'>) => void;
  onUpdateObject: (id: AnnotationObject['id'], patch: Partial<AnnotationObject>) => void;
  onSplitObject: (id: AnnotationObject['id'], splitX: number) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getPolygonBounds = (points: PolygonPoint[]): Area => {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
};

const dedupeConsecutivePoints = (points: PolygonPoint[]) =>
  points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.5;
  });

const replacePolygonSegment = (
  points: PolygonPoint[],
  startIndex: number,
  endIndex: number,
  correctionPoints: PolygonPoint[]
) => {
  if (
    startIndex < 0 ||
    endIndex < 0 ||
    startIndex >= points.length ||
    endIndex >= points.length ||
    startIndex === endIndex
  ) {
    return points;
  }

  const path = dedupeConsecutivePoints([
    points[startIndex],
    ...correctionPoints.slice(1),
    points[endIndex]
  ]);

  if (startIndex < endIndex) {
    return [
      ...points.slice(0, startIndex),
      ...path,
      ...points.slice(endIndex + 1)
    ];
  }

  return [
    ...path,
    ...points.slice(endIndex + 1, startIndex)
  ];
};

const getObjectSourceKey = (object: AnnotationObject) => {
  if (object.source === 'model') {
    return object.modelName ?? 'Model';
  }

  if (object.source === 'imported') {
    return 'Imported';
  }

  return 'Manual';
};

const WorkspaceCanvas: React.FC<WorkspaceCanvasProps> = ({
  activeTool,
  onToolChange,
  activeLabel,
  maskOpacity,
  onMaskOpacityChange,
  compareViewMode,
  compareLeftSource,
  compareRightSource,
  imageName,
  imageSrc,
  imageIndex,
  imageCount,
  canUndo,
  canRedo,
  statusMessage,
  isMenuOpen,
  hasSavedDraft,
  selectedObjectId,
  objects,
  hiddenLabels,
  onToggleMenu,
  onCloseMenu,
  onSave,
  onUndo,
  onRedo,
  onFirstImage,
  onPreviousImage,
  onNextImage,
  onLastImage,
  onSelectImageByIndex,
  onOpenImagePicker,
  onLoadSaved,
  onExportProject,
  onResetAnnotations,
  onSelectObject,
  onCreateObject,
  onUpdateObject,
  onSplitObject
}) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageSize, setImageSize] = useState({
    width: FALLBACK_CANVAS_WIDTH,
    height: FALLBACK_CANVAS_HEIGHT
  });
  const [stageWidth, setStageWidth] = useState(FALLBACK_CANVAS_WIDTH);
  const [draftBox, setDraftBox] = useState<Area | null>(null);
  const [polygonDraft, setPolygonDraft] = useState<PolygonPoint[]>([]);
  const [brushDraft, setBrushDraft] = useState<PolygonPoint[]>([]);
  const [polygonCorrectionDraft, setPolygonCorrectionDraft] = useState<PolygonCorrectionDraft | null>(null);
  const [drawingStart, setDrawingStart] = useState<PolygonPoint | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [indexInput, setIndexInput] = useState(String(imageIndex + 1));
  const polygonCorrectionDraftRef = useRef<PolygonCorrectionDraft | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const nextImage = new window.Image();
    nextImage.src = imageSrc;
    nextImage.onload = () => {
      setImage(nextImage);
      setImageSize({
        width: nextImage.naturalWidth || FALLBACK_CANVAS_WIDTH,
        height: nextImage.naturalHeight || FALLBACK_CANVAS_HEIGHT
      });
    };
    nextImage.onerror = () => {
      setImage(null);
      setImageSize({
        width: FALLBACK_CANVAS_WIDTH,
        height: FALLBACK_CANVAS_HEIGHT
      });
    };

    return () => {
      setImage(null);
    };
  }, [imageSrc]);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setPolygonDraft([]);
    setPolygonCorrectionDraft(null);
    setBrushDraft([]);
    setDraftBox(null);
    setDrawingStart(null);
    polygonCorrectionDraftRef.current = null;
  }, [imageSrc]);

  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return undefined;
    }

    const updateStageSize = () => {
      setStageWidth(element.clientWidth);
    };

    updateStageSize();

    const resizeObserver = new ResizeObserver(updateStageSize);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    setIndexInput(String(imageIndex + 1));
  }, [imageIndex]);

  useEffect(() => {
    if (!isMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) {
        return;
      }

      onCloseMenu();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseMenu();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen, onCloseMenu]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setIsShiftPressed(true);
      }

      if (event.key === 'Escape') {
        updatePolygonCorrectionDraft(null);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    const handleWindowBlur = () => {
      setIsShiftPressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  const imageAspectRatio = imageSize.height / imageSize.width;
  const stageHeight = Math.round(stageWidth * imageAspectRatio);
  const baseScale = stageWidth / imageSize.width;
  const canvasScale = baseScale * zoom;
  const visibleObjects = useMemo(
    () => objects.filter((item) => !hiddenLabels.includes(item.label)),
    [objects, hiddenLabels]
  );
  const selectedPolygonObject = useMemo(
    () =>
      visibleObjects.find(
        (item) => item.id === selectedObjectId && item.type === 'polygon' && (item.points?.length ?? 0) >= 3
      ) ?? null,
    [selectedObjectId, visibleObjects]
  );
  const isPolygonCorrectionMode = activeTool === 'polygon' && (isShiftPressed || Boolean(polygonCorrectionDraft));
  const listedObjects = useMemo(
    () => visibleObjects.filter((item) => !(item.type === 'brush' && item.operation === 'erase')),
    [visibleObjects]
  );
  const getObjectsForSource = (sourceKey: string) =>
    visibleObjects.filter((item) => getObjectSourceKey(item) === sourceKey);

  const comparisonLeftObjects = useMemo(
    () => (compareViewMode === 'split' ? getObjectsForSource(compareLeftSource) : visibleObjects),
    [compareViewMode, compareLeftSource, visibleObjects]
  );
  const comparisonRightObjects = useMemo(
    () => getObjectsForSource(compareRightSource),
    [compareRightSource, visibleObjects]
  );

  const getPointer = (event: any): PolygonPoint | null => {
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();

    if (!pointer) {
      return null;
    }

    return {
      x: clamp((pointer.x - offset.x) / canvasScale, 0, imageSize.width),
      y: clamp((pointer.y - offset.y) / canvasScale, 0, imageSize.height)
    };
  };

  const zoomAtPointer = (screenX: number, screenY: number, direction: 1 | -1) => {
    const nextZoom = clamp(direction > 0 ? zoom * 1.15 : zoom / 1.15, 0.6, 4);
    const worldX = (screenX - offset.x) / canvasScale;
    const worldY = (screenY - offset.y) / canvasScale;

    setZoom(nextZoom);
    setOffset({
      x: screenX - worldX * baseScale * nextZoom,
      y: screenY - worldY * baseScale * nextZoom
    });
  };

  const appendPolygonDraftPoint = (point: PolygonPoint, minDistance = 0) => {
    setPolygonDraft((current) => {
      const lastPoint = current[current.length - 1];

      if (lastPoint && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < minDistance) {
        return current;
      }

      return [...current, point];
    });
  };

  const updatePolygonCorrectionDraft = (nextDraft: PolygonCorrectionDraft | null) => {
    polygonCorrectionDraftRef.current = nextDraft;
    setPolygonCorrectionDraft(nextDraft);
  };

  const findNearestPolygonPoint = (
    points: PolygonPoint[],
    point: PolygonPoint,
    maxDistance: number
  ): PolygonDraftHit | null => {
    let closest: PolygonDraftHit | null = null;

    points.forEach((draftPoint, index) => {
      const distance = Math.hypot(point.x - draftPoint.x, point.y - draftPoint.y);

      if (distance <= maxDistance && (!closest || distance < closest.distance)) {
        closest = { index, distance };
      }
    });

    return closest;
  };

  const getPolygonCorrectionTarget = (draft = polygonCorrectionDraftRef.current) => {
    if (draft?.target === 'object') {
      const object = visibleObjects.find(
        (item) => item.id === draft.objectId && item.type === 'polygon' && (item.points?.length ?? 0) >= 3
      );

      if (!object?.points) {
        return null;
      }

      return {
        target: 'object' as const,
        objectId: object.id,
        points: object.points
      };
    }

    if (polygonDraft.length >= 3) {
      return {
        target: 'draft' as const,
        points: polygonDraft
      };
    }

    if (selectedPolygonObject?.points) {
      return {
        target: 'object' as const,
        objectId: selectedPolygonObject.id,
        points: selectedPolygonObject.points
      };
    }

    return null;
  };

  const appendPolygonCorrectionPoint = (point: PolygonPoint) => {
    const draft = polygonCorrectionDraftRef.current;

    if (!draft) {
      return;
    }

    const lastPoint = draft.points[draft.points.length - 1];
    const minDistance = POLYGON_CORRECTION_MIN_SCREEN_DISTANCE / canvasScale;

    if (lastPoint && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < minDistance) {
      return;
    }

    updatePolygonCorrectionDraft({
      ...draft,
      points: [...draft.points, point],
      hasMoved: true
    });
  };

  const applyPolygonCorrection = (
    correctionDraft: PolygonCorrectionDraft,
    endIndex: number,
    correctionPoints: PolygonPoint[]
  ) => {
    const target = getPolygonCorrectionTarget(correctionDraft);

    if (!target) {
      return;
    }

    const nextPoints = replacePolygonSegment(
      target.points,
      correctionDraft.startIndex,
      endIndex,
      correctionPoints
    );

    if (nextPoints.length < 3) {
      return;
    }

    if (target.target === 'draft') {
      setPolygonDraft(nextPoints);
      return;
    }

    onUpdateObject(target.objectId, {
      points: nextPoints,
      area: getPolygonBounds(nextPoints)
    });
  };

  const startBox = (event: any) => {
    const pointer = getPointer(event);

    if (!pointer) {
      return;
    }

    setDrawingStart(pointer);
    setDraftBox({ x: pointer.x, y: pointer.y, width: 0, height: 0 });
    onSelectObject(null);
  };

  const updateBox = (event: any) => {
    const pointer = getPointer(event);

    if (!pointer || !drawingStart) {
      return;
    }

    const x = Math.min(pointer.x, drawingStart.x);
    const y = Math.min(pointer.y, drawingStart.y);
    const width = Math.abs(pointer.x - drawingStart.x);
    const height = Math.abs(pointer.y - drawingStart.y);

    setDraftBox({ x, y, width, height });
  };

  const finishBox = () => {
    if (activeTool === 'box' && draftBox && draftBox.width > 12 && draftBox.height > 12) {
      onCreateObject({
        type: 'box',
        label: activeLabel,
        color: '#7CFC8A',
        source: 'manual',
        area: {
          x: Math.round(draftBox.x),
          y: Math.round(draftBox.y),
          width: Math.round(draftBox.width),
          height: Math.round(draftBox.height)
        }
      });
    }

    setDraftBox(null);
    setDrawingStart(null);
  };

  const addPolygonPoint = (event: any) => {
    const pointer = getPointer(event);

    if (!pointer) {
      return;
    }

    if (polygonDraft.length >= 3) {
      const firstPoint = polygonDraft[0];
      const distance = Math.hypot(pointer.x - firstPoint.x, pointer.y - firstPoint.y);

      if (distance < 18) {
        onCreateObject({
          type: 'polygon',
          label: activeLabel,
          color: '#7CFC8A',
          source: 'manual',
          points: polygonDraft,
          area: getPolygonBounds(polygonDraft)
        });
        setPolygonDraft([]);
        return;
      }
    }

    appendPolygonDraftPoint(pointer);
    onSelectObject(null);
  };

  const startPolygonCorrection = (event: any) => {
    if (event.evt.button !== 0) {
      return;
    }

    const pointer = getPointer(event);

    if (!pointer) {
      return;
    }

    const target = getPolygonCorrectionTarget();

    if (!target) {
      return;
    }

    const nearest = findNearestPolygonPoint(target.points, pointer, POLYGON_CORRECTION_HIT_SCREEN_DISTANCE / canvasScale);

    if (!nearest) {
      return;
    }

    event.evt.preventDefault();
    updatePolygonCorrectionDraft({
      target: target.target,
      objectId: target.target === 'object' ? target.objectId : undefined,
      startIndex: nearest.index,
      points: dedupeConsecutivePoints([target.points[nearest.index], pointer]),
      hasMoved: false
    });
    if (target.target === 'draft') {
      onSelectObject(null);
    }
  };

  const updatePolygonCorrection = (event: any) => {
    if (!polygonCorrectionDraftRef.current) {
      return;
    }

    const pointer = getPointer(event);

    if (!pointer) {
      return;
    }

    appendPolygonCorrectionPoint(pointer);
  };

  const finishPolygonCorrection = (event: any) => {
    const correctionDraft = polygonCorrectionDraftRef.current;

    if (!correctionDraft) {
      return false;
    }

    const pointer = getPointer(event);

    if (!pointer) {
      return false;
    }

    const target = getPolygonCorrectionTarget(correctionDraft);
    const correctionPoints = dedupeConsecutivePoints([...correctionDraft.points, pointer]);

    if (!target) {
      return false;
    }

    const nearest = findNearestPolygonPoint(target.points, pointer, POLYGON_CORRECTION_HIT_SCREEN_DISTANCE / canvasScale);

    if (nearest && nearest.index !== correctionDraft.startIndex && correctionPoints.length > 1) {
      applyPolygonCorrection(correctionDraft, nearest.index, correctionPoints);
      updatePolygonCorrectionDraft(null);
      return true;
    }

    return false;
  };

  const finishPolygonDraft = () => {
    if (polygonDraft.length < 3) {
      return;
    }

    onCreateObject({
      type: 'polygon',
      label: activeLabel,
      color: '#7CFC8A',
      source: 'manual',
      points: polygonDraft,
      area: getPolygonBounds(polygonDraft)
    });
    setPolygonDraft([]);
  };

  const startBrush = (event: any) => {
    const pointer = getPointer(event);

    if (!pointer) {
      return;
    }

    setBrushDraft([pointer]);
    onSelectObject(null);
  };

  const updateBrush = (event: any) => {
    const pointer = getPointer(event);

    if (!pointer || brushDraft.length === 0) {
      return;
    }

    setBrushDraft((current) => [...current, pointer]);
  };

  const finishBrush = (operation: 'paint' | 'erase') => {
    if (brushDraft.length < 2) {
      setBrushDraft([]);
      return;
    }

    const bounds = getPolygonBounds(brushDraft);
    onCreateObject({
      type: 'brush',
      label: activeLabel,
      color: '#7CFC8A',
      operation,
      source: 'manual',
      points: brushDraft,
      area: bounds
    });
    setBrushDraft([]);
  };

  const pointInObject = (object: AnnotationObject, point: PolygonPoint) => {
    if (!object.area) {
      return false;
    }

    return (
      point.x >= object.area.x &&
      point.x <= object.area.x + object.area.width &&
      point.y >= object.area.y &&
      point.y <= object.area.y + object.area.height
    );
  };

  const splitAtPoint = (event: any) => {
    const pointer = getPointer(event);

    if (!pointer || !selectedObjectId) {
      return;
    }

    const selected = visibleObjects.find((object) => object.id === selectedObjectId);

    if (selected?.type === 'box' && selected.area && pointInObject(selected, pointer)) {
      onSplitObject(selected.id, pointer.x);
    }
  };

  const renderMaskAnnotations = (items: AnnotationObject[]) => {
    const localMaskObjects = items.filter((item) => item.type === 'polygon' || item.type === 'brush');
    const paintMaskObjects = localMaskObjects.filter(
      (item) => !(item.type === 'brush' && item.operation === 'erase')
    );

    return (
      <>
        {localMaskObjects.map((object) => {
          if (!object.points) {
            return null;
          }

          if (object.type === 'brush' && object.operation === 'erase') {
            return (
              <Line
                key={object.id}
                points={object.points.flatMap((point) => [point.x, point.y])}
                stroke="#000000"
                strokeWidth={24}
                lineCap="round"
                lineJoin="round"
                tension={0.25}
                globalCompositeOperation="destination-out"
                listening={false}
              />
            );
          }

          const isSelected = selectedObjectId === object.id;
          const stroke = isSelected ? '#8cfb95' : object.color;
          const fill = isSelected ? 'rgba(124, 252, 138, 0.28)' : 'rgba(124, 252, 138, 0.18)';
          const listedIndex = paintMaskObjects.findIndex((item) => item.id === object.id);

          if (object.type === 'polygon') {
            return (
              <Group key={object.id}>
                <Line
                  points={object.points.flatMap((point) => [point.x, point.y])}
                  closed
                  stroke={stroke}
                  strokeWidth={isSelected ? 3 : 2}
                  fill={fill}
                  opacity={maskOpacity}
                  onClick={() => onSelectObject(object.id)}
                />
                <Text
                  x={object.points[0]?.x ?? 0}
                  y={(object.points[0]?.y ?? 0) - 18}
                  text={`${listedIndex + 1} ${object.label}`}
                  fill="#152017"
                  fontSize={14}
                  padding={4}
                />
              </Group>
            );
          }

          if (object.type === 'brush') {
            return (
              <Group key={object.id}>
                <Line
                  points={object.points.flatMap((point) => [point.x, point.y])}
                  stroke={stroke}
                  strokeWidth={16}
                  lineCap="round"
                  lineJoin="round"
                  opacity={maskOpacity}
                  tension={0.25}
                  globalCompositeOperation="source-over"
                  onClick={() => onSelectObject(object.id)}
                />
                <Text
                  x={object.points[0]?.x ?? 0}
                  y={(object.points[0]?.y ?? 0) - 18}
                  text={`${listedIndex + 1} ${object.label}`}
                  fill="#d8ffe2"
                  fontSize={14}
                  padding={4}
                />
              </Group>
            );
          }

          return null;
        })}
      </>
    );
  };

  const renderDetectionAnnotations = (items: AnnotationObject[]) => {
    const localDetectionObjects = items.filter((item) => item.type === 'box');
    const localListedObjects = items.filter((item) => !(item.type === 'brush' && item.operation === 'erase'));

    return (
      <>
        {localDetectionObjects.map((object, index) => {
          const isSelected = selectedObjectId === object.id;
          const stroke = isSelected ? '#8cfb95' : object.color;
          const fill = isSelected ? 'rgba(124, 252, 138, 0.12)' : 'rgba(124, 252, 138, 0.06)';

          if (!object.area) {
            return null;
          }

          return (
            <Group key={object.id}>
              <Rect
                x={object.area.x}
                y={object.area.y}
                width={object.area.width}
                height={object.area.height}
                stroke={stroke}
                strokeWidth={isSelected ? 3 : 2}
                fill={fill}
                dash={isSelected ? [8, 4] : undefined}
                draggable={activeTool === 'select'}
                onClick={() => onSelectObject(object.id)}
                onDragEnd={(event) => {
                  onUpdateObject(object.id, {
                    area: {
                      ...object.area!,
                      x: Math.round(event.target.x()),
                      y: Math.round(event.target.y())
                    }
                  });
                }}
              />
              <Text
                x={object.area.x}
                y={Math.max(0, object.area.y - 20)}
                text={`${localListedObjects.filter((item) => item.type !== 'box').length + index + 1} ${object.label}`}
                fill="#d8ffe2"
                fontSize={14}
                padding={4}
              />
            </Group>
          );
        })}
      </>
    );
  };

  return (
    <div className="flex h-full min-h-[760px] min-w-0 flex-col rounded-[24px] border border-slate-800 bg-slate-900/95 shadow-[0_24px_80px_rgba(15,23,42,0.38)]">
      {activeTool === 'polygon' && (
        <div className="flex items-center justify-end border-b border-slate-800 bg-slate-950/90 px-5 py-3">
          <button
            type="button"
            onClick={finishPolygonDraft}
            disabled={polygonDraft.length < 3}
            className="h-9 rounded-lg bg-brand-500 px-5 text-sm font-semibold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            title="Завершить полигон"
          >
            Done
          </button>
        </div>
      )}

      <div className="relative z-30 flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 text-slate-300">
        <div className="flex items-center gap-2">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={onToggleMenu}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              isMenuOpen
                ? 'border-brand-500/40 bg-brand-500/10 text-brand-100'
                : 'border-slate-700 bg-slate-950 text-slate-100'
            }`}
          >
            Menu
          </button>
          <button type="button" onClick={onSave} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs">
            Save
          </button>
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            Redo
          </button>
        </div>

        <div className="flex flex-1 items-center gap-3">
          <div className="flex gap-1 text-lg">
            <button type="button" onClick={onFirstImage} className="rounded px-1 hover:bg-slate-800" title="Первое изображение">&#9198;</button>
            <button type="button" onClick={onPreviousImage} className="rounded px-1 hover:bg-slate-800" title="Предыдущее изображение">&#9664;</button>
            <button type="button" onClick={onNextImage} className="rounded px-1 hover:bg-slate-800" title="Следующее изображение">&#9654;</button>
            <button type="button" onClick={onLastImage} className="rounded px-1 hover:bg-slate-800" title="Последнее изображение">&#9197;</button>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, imageCount - 1)}
            value={imageIndex}
            onChange={(event) => onSelectImageByIndex(Number(event.target.value))}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-slate-800 accent-brand-500"
          />

          <input
            value={indexInput}
            onChange={(event) => setIndexInput(event.target.value)}
            onBlur={() => {
              const parsed = Number(indexInput);
              if (!Number.isNaN(parsed)) {
                onSelectImageByIndex(clamp(parsed - 1, 0, imageCount - 1));
              } else {
                setIndexInput(String(imageIndex + 1));
              }
            }}
            className="w-16 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-center text-xs text-slate-100"
          />
        </div>

        <button
          type="button"
          onClick={onOpenImagePicker}
          className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-200 transition hover:border-brand-500/40 hover:text-white"
        >
          {imageName}
        </button>

        {isMenuOpen && (
          <div
            ref={menuRef}
            className="absolute left-4 top-[calc(100%+0.5rem)] z-50 w-64 rounded-2xl border border-slate-700 bg-slate-950 p-3 shadow-2xl"
          >
            <div className="mb-2 text-xs uppercase tracking-[0.22em] text-slate-500">Workspace Menu</div>
            <div className="space-y-2">
              <button type="button" onClick={onOpenImagePicker} className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-left text-sm text-slate-200">
                Добавить изображения
              </button>
              <button
                type="button"
                onClick={onLoadSaved}
                disabled={!hasSavedDraft}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-left text-sm text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Загрузить сохранённый черновик
              </button>
              <button type="button" onClick={onExportProject} className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-left text-sm text-slate-200">
                Экспортировать проект
              </button>
              <button type="button" onClick={onResetAnnotations} className="w-full rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-left text-sm text-rose-100">
                Очистить аннотации текущего изображения
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setOffset({ x: 0, y: 0 });
                  onCloseMenu();
                }}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-left text-sm text-slate-200"
              >
                Сбросить zoom и pan
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[62px_minmax(0,1fr)] overflow-hidden rounded-b-[24px]">
        <div className="border-r border-slate-800 bg-slate-950/95 py-4">
          <div className="flex flex-col items-center gap-3">
            {[
              { id: 'select' as ToolMode, icon: '✥', label: 'Выбор', hint: 'Выбор и перемещение уже созданных объектов.' },
              { id: 'box' as ToolMode, icon: '▭', label: 'Box', hint: 'Создание прямоугольной области на изображении.' },
              { id: 'polygon' as ToolMode, icon: '⬠', label: 'Polygon', hint: 'Клики ставят точки. Shift подсвечивает точки; клик-точка, ведение, клик-точка заменяет участок.' },
              { id: 'brush' as ToolMode, icon: '🖌', label: 'Кисть', hint: 'Ручная дорисовка маски выбранного класса.' },
              { id: 'eraser' as ToolMode, icon: '⌫', label: 'Ластик', hint: 'Частичное стирание маски выбранного класса.' },
              { id: 'split' as ToolMode, icon: '✂', label: 'Разделение', hint: 'Разделение выбранного bounding box на две части.' },
              { id: 'zoom' as ToolMode, icon: '⌕', label: 'Zoom', hint: 'Приближение и отдаление рабочей области.' },
              { id: 'move' as ToolMode, icon: '✋', label: 'Move', hint: 'Перемещение холста внутри рабочей области.' }
            ].map((tool) => {
              const isActive = activeTool === tool.id;

              return (
                <div key={tool.id} className="group relative flex justify-center">
                  <button
                    type="button"
                    onClick={() => onToolChange(activeTool === tool.id ? null : tool.id)}
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border text-sm ${
                      isActive
                        ? 'border-brand-500/40 bg-brand-500/15 text-brand-100'
                        : 'border-slate-800 bg-slate-900 text-slate-300'
                    }`}
                    aria-label={tool.label}
                  >
                    {tool.icon}
                  </button>

                  <div className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 z-30 w-52 -translate-y-1/2 rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-left opacity-0 shadow-xl transition duration-150 group-hover:opacity-100">
                    <div className="text-xs font-semibold text-white">{tool.label}</div>
                    <div className="mt-1 text-[11px] leading-4 text-slate-400">{tool.hint}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_292px]">
          <div className="min-h-0 bg-slate-900 p-3">
            <div
              ref={containerRef}
              className="relative flex items-center justify-center overflow-hidden rounded-[18px] border border-slate-800 bg-slate-950"
              style={{ minHeight: stageHeight }}
            >
              <Stage
                width={stageWidth}
                height={stageHeight}
                onMouseDown={(event) => {
                  if (activeTool === 'box') {
                    startBox(event);
                    return;
                  }

                  if (activeTool === 'polygon') {
                    if (polygonCorrectionDraftRef.current) {
                      finishPolygonCorrection(event);
                      return;
                    }

                    if (event.evt.shiftKey || isShiftPressed) {
                      startPolygonCorrection(event);
                      return;
                    }

                    addPolygonPoint(event);
                    return;
                  }

                  if (activeTool === 'brush') {
                    startBrush(event);
                    return;
                  }

                  if (activeTool === 'eraser') {
                    startBrush(event);
                    return;
                  }

                  if (activeTool === 'split') {
                    splitAtPoint(event);
                    return;
                  }

                  if (activeTool === 'zoom') {
                    const stage = event.target.getStage();
                    const pointer = stage?.getPointerPosition();

                    if (pointer) {
                      zoomAtPointer(pointer.x, pointer.y, 1);
                    }
                    return;
                  }

                  if (activeTool === 'move') {
                    const stage = event.target.getStage();
                    const pointer = stage?.getPointerPosition();

                    if (pointer) {
                      setIsPanning(true);
                      setPanStart({ x: pointer.x - offset.x, y: pointer.y - offset.y });
                    }
                    return;
                  }

                  if (activeTool === 'select') {
                    onSelectObject(null);
                  }
                }}
                onMouseMove={(event) => {
                  if (activeTool === 'polygon') {
                    updatePolygonCorrection(event);
                    return;
                  }

                  if (activeTool === 'box') {
                    updateBox(event);
                    return;
                  }

                  if (activeTool === 'brush') {
                    updateBrush(event);
                    return;
                  }

                  if (activeTool === 'eraser') {
                    updateBrush(event);
                    return;
                  }

                  if (activeTool === 'move' && isPanning && panStart) {
                    const stage = event.target.getStage();
                    const pointer = stage?.getPointerPosition();

                    if (pointer) {
                      setOffset({ x: pointer.x - panStart.x, y: pointer.y - panStart.y });
                    }
                  }
                }}
                onMouseUp={(event) => {
                  if (activeTool === 'polygon') {
                    const correctionDraft = polygonCorrectionDraftRef.current;

                    if (correctionDraft?.hasMoved) {
                      const didFinish = finishPolygonCorrection(event);

                      if (!didFinish) {
                        updatePolygonCorrectionDraft(null);
                      }
                    }
                  }

                  if (activeTool === 'box') {
                    finishBox();
                  }

                  if (activeTool === 'brush') {
                    finishBrush('paint');
                  }

                  if (activeTool === 'eraser') {
                    finishBrush('erase');
                  }

                  setIsPanning(false);
                  setPanStart(null);
                }}
                onWheel={(event) => {
                  event.evt.preventDefault();

                  if (activeTool !== 'zoom') {
                    return;
                  }

                  const pointer = event.target.getStage()?.getPointerPosition();

                  if (!pointer) {
                    return;
                  }

                  zoomAtPointer(pointer.x, pointer.y, event.evt.deltaY < 0 ? 1 : -1);
                }}
              >
                <Layer x={offset.x} y={offset.y} scaleX={canvasScale} scaleY={canvasScale}>
                  <Rect x={0} y={0} width={imageSize.width} height={imageSize.height} fill="#0f172a" />
                  {image && <KonvaImage image={image} width={imageSize.width} height={imageSize.height} />}
                </Layer>

                <Layer x={offset.x} y={offset.y} scaleX={canvasScale} scaleY={canvasScale}>
                  {compareViewMode === 'split' ? (
                    <>
                      <Group clipX={0} clipY={0} clipWidth={imageSize.width / 2} clipHeight={imageSize.height}>
                        {renderMaskAnnotations(comparisonLeftObjects)}
                      </Group>
                      <Group
                        clipX={imageSize.width / 2}
                        clipY={0}
                        clipWidth={imageSize.width / 2}
                        clipHeight={imageSize.height}
                      >
                        {renderMaskAnnotations(comparisonRightObjects)}
                      </Group>
                    </>
                  ) : (
                    renderMaskAnnotations(visibleObjects)
                  )}
                </Layer>

                <Layer x={offset.x} y={offset.y} scaleX={canvasScale} scaleY={canvasScale}>
                  {compareViewMode === 'split' ? (
                    <>
                      <Group clipX={0} clipY={0} clipWidth={imageSize.width / 2} clipHeight={imageSize.height}>
                        {renderDetectionAnnotations(comparisonLeftObjects)}
                      </Group>
                      <Group
                        clipX={imageSize.width / 2}
                        clipY={0}
                        clipWidth={imageSize.width / 2}
                        clipHeight={imageSize.height}
                      >
                        {renderDetectionAnnotations(comparisonRightObjects)}
                      </Group>
                      <Line
                        points={[imageSize.width / 2, 0, imageSize.width / 2, imageSize.height]}
                        stroke="#f8fafc"
                        strokeWidth={2}
                        dash={[10, 8]}
                        opacity={0.8}
                      />
                      <Text x={24} y={20} text={compareLeftSource} fill="#f8fafc" fontSize={18} padding={6} />
                      <Text
                        x={imageSize.width / 2 + 24}
                        y={20}
                        text={compareRightSource}
                        fill="#f8fafc"
                        fontSize={18}
                        padding={6}
                      />
                    </>
                  ) : (
                    renderDetectionAnnotations(visibleObjects)
                  )}
                </Layer>

                <Layer x={offset.x} y={offset.y} scaleX={canvasScale} scaleY={canvasScale}>
                  {draftBox && (
                    <Rect
                      x={draftBox.x}
                      y={draftBox.y}
                      width={draftBox.width}
                      height={draftBox.height}
                      stroke="#52b5ff"
                      strokeWidth={2}
                      dash={[7, 5]}
                      fill="rgba(82, 181, 255, 0.12)"
                    />
                  )}

                  {selectedPolygonObject?.points &&
                    activeTool === 'polygon' &&
                    polygonDraft.length === 0 &&
                    (isShiftPressed ||
                      (polygonCorrectionDraft?.target === 'object' &&
                        polygonCorrectionDraft.objectId === selectedPolygonObject.id)) &&
                    selectedPolygonObject.points.map((point, index) => (
                      <Circle
                        key={`${selectedPolygonObject.id}-handle-${index}`}
                        x={point.x}
                        y={point.y}
                        radius={8 / canvasScale}
                        fill="#f8fafc"
                        stroke="#16a34a"
                        strokeWidth={2 / canvasScale}
                        listening={false}
                      />
                    ))}

                  {polygonDraft.length > 0 && (
                    <>
                      <Line points={polygonDraft.flatMap((point) => [point.x, point.y])} stroke="#52b5ff" strokeWidth={2} />
                      {polygonDraft.map((point, index) => (
                        <Circle
                          key={`${point.x}-${point.y}-${index}`}
                          x={point.x}
                          y={point.y}
                          radius={isPolygonCorrectionMode ? 8 / canvasScale : 4}
                          fill={isPolygonCorrectionMode ? '#f8fafc' : '#52b5ff'}
                          stroke={isPolygonCorrectionMode ? '#16a34a' : undefined}
                          strokeWidth={isPolygonCorrectionMode ? 2 / canvasScale : 0}
                        />
                      ))}
                    </>
                  )}

                  {polygonCorrectionDraft && (
                    <>
                      <Line
                        points={polygonCorrectionDraft.points.flatMap((point) => [point.x, point.y])}
                        stroke="#f8fafc"
                        strokeWidth={2}
                        dash={[6, 6]}
                      />
                      {polygonCorrectionDraft.points.map((point, index) => (
                        <Circle
                          key={`correction-${point.x}-${point.y}-${index}`}
                          x={point.x}
                          y={point.y}
                          radius={3.5}
                          fill="#f8fafc"
                          stroke="#334155"
                          strokeWidth={1}
                        />
                      ))}
                    </>
                  )}

                  {brushDraft.length > 0 && (
                    <Line
                      points={brushDraft.flatMap((point) => [point.x, point.y])}
                      stroke={activeTool === 'eraser' ? '#fca5a5' : '#7CFC8A'}
                      strokeWidth={activeTool === 'eraser' ? 24 : 16}
                      lineCap="round"
                      lineJoin="round"
                      opacity={activeTool === 'eraser' ? 0.45 : maskOpacity}
                      tension={0.25}
                    />
                  )}
                </Layer>
              </Stage>

              <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-lg bg-[rgba(22,22,22,0.76)] px-4 py-2 text-xs text-white">
                {activeTool === 'box' && 'Зажмите и протяните, чтобы создать bounding box.'}
                {activeTool === 'polygon' && 'Кликайте по контуру объекта. Для исправления нажмите Shift, кликните первую подсвеченную точку, проведите пунктир и кликните вторую точку. Esc отменяет.'}
                {activeTool === 'brush' && 'Зажмите мышь и рисуйте по изображению, чтобы дорисовать маску выбранного класса.'}
                {activeTool === 'eraser' && 'Зажмите мышь и стирайте фрагменты mask-layer выбранного класса.'}
                {activeTool === 'split' && 'Кликните внутри выбранного bounding box, чтобы разделить его на две части.'}
                {activeTool === 'select' && 'Выберите объект на изображении и перетащите его при необходимости.'}
                {activeTool === 'zoom' && 'Кликайте по холсту или используйте колесо мыши для zoom.'}
                {activeTool === 'move' && 'Зажмите мышь и перемещайте холст.'}
              </div>
            </div>
          </div>

          <aside className="border-l border-slate-800 bg-slate-900/95">
            <div className="border-b border-slate-800 bg-slate-950/80 px-4 py-3">
              <div className="flex items-center justify-between text-sm font-semibold text-slate-100">
                <span>Objects</span>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300">{listedObjects.length}</span>
              </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto p-3">
              {listedObjects.map((object, index) => {
                const isSelected = selectedObjectId === object.id;

                return (
                  <button
                    key={object.id}
                    type="button"
                        onClick={() => onSelectObject(object.id)}
                        className={`mb-2 w-full rounded-md border px-3 py-2 text-left ${
                          isSelected ? 'border-brand-500/40 bg-brand-500/10' : 'border-slate-800 bg-slate-950'
                        }`}
                  >
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-slate-500">
                      <span>{index + 1}</span>
                      <span>{object.type}</span>
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-100">{object.label}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {object.source === 'imported' && 'Импорт из аннотаций'}
                      {object.source === 'model' && `${object.modelName ?? 'Модель'}${object.score ? ` · ${Math.round(object.score * 100)}%` : ''}`}
                      {object.source === 'manual' && object.type === 'brush' && object.operation === 'paint' && 'Ручная маска'}
                      {object.source === 'manual' && object.type !== 'brush' && 'Ручная разметка'}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-slate-800 bg-slate-950/70 px-4 py-3">
              <div className="text-sm font-semibold text-slate-100">Appearance</div>
              <div className="mt-3 text-xs text-slate-400">
                Активный класс: <span className="font-semibold text-slate-100">{activeLabel}</span>
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Режим: <span className="font-semibold text-slate-100">{activeTool}</span>
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Zoom: <span className="font-semibold text-slate-100">{zoom.toFixed(2)}x</span>
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Прозрачность маски: <span className="font-semibold text-slate-100">{Math.round(maskOpacity * 100)}%</span>
              </div>
              <div className="mt-4">
                <div className="mb-2 text-xs text-slate-500">Opacity</div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={Math.round(maskOpacity * 100)}
                  onChange={(event) => onMaskOpacityChange(Number(event.target.value) / 100)}
                  className="w-full accent-brand-500"
                />
              </div>
              <div className="mt-4">
                <div className="mb-2 text-xs text-slate-500">Status</div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                  {statusMessage}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceCanvas;
