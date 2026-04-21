import { Stage, Layer, Rect, Image as KonvaImage } from 'react-konva';
import { useEffect, useMemo, useRef, useState } from 'react';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 675;

const usePlaceholderImage = () => {
  return useMemo(() => {
    const img = new window.Image();
    img.src = 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80';
    return img;
  }, []);
};

const WorkspaceCanvas = () => {
  const image = usePlaceholderImage();
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
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Рабочая область</h2>
          <p className="text-sm text-slate-400">Интерактивный холст для редактирования масок и bounding box.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-slate-400">
          <span>Прозрачность</span>
          <input type="range" min="0" max="100" defaultValue="70" className="h-2 w-32 accent-brand-500" />
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative min-w-0 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900"
      >
        <div className="flex justify-center">
          <Stage width={stageWidth} height={stageHeight} className="h-auto max-w-full">
            <Layer scaleX={stageWidth / CANVAS_WIDTH} scaleY={stageHeight / CANVAS_HEIGHT}>
              <KonvaImage image={image} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} opacity={0.92} />
              <Rect x={120} y={100} width={320} height={220} stroke="#38bdf8" strokeWidth={3} dash={[10, 6]} />
              <Rect x={540} y={250} width={260} height={180} stroke="#f472b6" strokeWidth={3} opacity={0.7} />
            </Layer>
          </Stage>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-3xl bg-gradient-to-t from-slate-950/95 to-transparent p-4 text-sm text-slate-200">
          Режим: <span className="font-semibold text-white">Редактирование масок</span>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceCanvas;
