import { Stage, Layer, Rect, Image as KonvaImage, Text } from 'react-konva';
import { useEffect, useRef, useState } from 'react';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 675;

const usePlaceholderImage = () => {
  const [image, setImage] = useState<HTMLImageElement | HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      setImage(img);
      setLoading(false);
    };
    img.onerror = () => {
      // Fallback: create a simple colored rectangle
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        gradient.addColorStop(0, '#3b82f6');
        gradient.addColorStop(1, '#1e40af');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = '#ffffff';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Загрузка...', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      }
      setImage(canvas);
      setLoading(false);
    };
    img.crossOrigin = 'anonymous';
    img.src = 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80';
  }, []);

  return { image, loading };
};

interface ObjectData {
  id: number;
  class: string;
  coords: { x: number; y: number; width: number; height: number };
}

interface WorkspaceCanvasProps {
  selectedObject: number | null;
  objects: ObjectData[];
  classVisibility: Record<string, boolean>;
  classOpacity: Record<string, number>;
  selectedTool: string | null;
  onObjectSelect: (id: number) => void;
  onObjectChange: (id: number, coords: ObjectData['coords']) => void;
  onObjectDelete: (id: number) => void;
}

const WorkspaceCanvas: React.FC<WorkspaceCanvasProps> = ({ 
  selectedObject, 
  objects, 
  classVisibility, 
  classOpacity,
  selectedTool,
  onObjectSelect,
  onObjectChange,
  onObjectDelete
}) => {
  const { image, loading } = usePlaceholderImage();
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(CANVAS_WIDTH);

  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return undefined;
    }

    const updateStageSize = () => {
      setStageWidth(Math.min(element.clientWidth, CANVAS_WIDTH));
    };

    updateStageSize();

    const resizeObserver = new ResizeObserver(updateStageSize);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  const stageHeight = Math.round((stageWidth / CANVAS_WIDTH) * CANVAS_HEIGHT);

  return (
    <div className="min-w-0 rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="mb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Рабочая область</h2>
          <p className="text-sm text-slate-400">Интерактивный холст для редактирования масок и bounding box.</p>
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative min-w-0 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900"
      >
        <div className="flex justify-center">
          <Stage width={stageWidth} height={stageHeight} className="h-auto max-w-full bg-slate-700 border border-red-500">
            <Layer scaleX={stageWidth / CANVAS_WIDTH} scaleY={stageHeight / CANVAS_HEIGHT}>
              {/* Background rectangle */}
              <Rect
                x={0}
                y={0}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                fill="#64748b"
              />
              {image && <KonvaImage image={image} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} opacity={0.92} />}
              {loading && (
                <Rect
                  x={0}
                  y={0}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  fill="#f59e0b"
                />
              )}
              {/* Test text */}
              <Text
                x={50}
                y={50}
                text={loading ? "Загрузка..." : "Изображение загружено"}
                fontSize={24}
                fill="#ffffff"
              />
              {objects.map((obj) => {
                const isVisible = classVisibility[obj.class] !== false;
                const isSelected = selectedObject === obj.id;
                const opacity = isVisible ? (isSelected ? 1 : classOpacity[obj.class] || 0.7) : 0.2;
                return (
                  <Rect
                    key={obj.id}
                    x={obj.coords.x}
                    y={obj.coords.y}
                    width={obj.coords.width}
                    height={obj.coords.height}
                    stroke={isSelected ? "#38bdf8" : "#f472b6"}
                    strokeWidth={isSelected ? 4 : 3}
                    opacity={opacity}
                    dash={isSelected ? [10, 6] : undefined}
                    draggable={isVisible && selectedTool !== 'Ластик'}
                    onClick={() => {
                      if (!isVisible) return;
                      if (selectedTool === 'Ластик') {
                        onObjectDelete(obj.id);
                        return;
                      }
                      onObjectSelect(obj.id);
                    }}
                    onTap={() => {
                      if (!isVisible) return;
                      onObjectSelect(obj.id);
                    }}
                    onDragEnd={(event) => {
                      if (!isVisible) return;
                      onObjectChange(obj.id, {
                        ...obj.coords,
                        x: Math.round(event.target.x()),
                        y: Math.round(event.target.y())
                      });
                    }}
                  />
                );
              })}
            </Layer>
          </Stage>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-3xl bg-gradient-to-t from-slate-950/95 to-transparent p-4 text-sm text-slate-200">
          Режим: <span className="font-semibold text-white">Редактирование масок</span>
          {selectedTool && <span className="ml-4 text-brand-200">Инструмент: {selectedTool}</span>}
          {loading && <span className="ml-4 text-yellow-400">Загрузка изображения...</span>}
        </div>
      </div>
    </div>
  );
};

export default WorkspaceCanvas;
