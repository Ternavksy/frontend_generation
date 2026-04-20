import { Stage, Layer, Rect, Image as KonvaImage } from 'react-konva';
import { useMemo } from 'react';

const usePlaceholderImage = () => {
  return useMemo(() => {
    const img = new window.Image();
    img.src = 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80';
    return img;
  }, []);
};

const WorkspaceCanvas = () => {
  const image = usePlaceholderImage();

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Рабочая область</h2>
          <p className="text-sm text-slate-400">Интерактивный холст для редактирования масок и bounding box.</p>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <span>Прозрачность</span>
          <input type="range" min="0" max="100" defaultValue="70" className="h-2 w-32 accent-brand-500" />
        </div>
      </div>
      <div className="relative aspect-[16/9] overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
        <Stage width={1200} height={675} className="h-full w-full">
          <Layer>
            <KonvaImage image={image} width={1200} height={675} opacity={0.92} />
            <Rect x={120} y={100} width={320} height={220} stroke="#38bdf8" strokeWidth={3} dash={[10, 6]} />
            <Rect x={540} y={250} width={260} height={180} stroke="#f472b6" strokeWidth={3} opacity={0.7} />
          </Layer>
        </Stage>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-3xl bg-gradient-to-t from-slate-950/95 to-transparent p-4 text-sm text-slate-200">
          Режим: <span className="font-semibold text-white">Редактирование масок</span>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceCanvas;
