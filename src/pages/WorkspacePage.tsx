import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, FolderPlus, Sparkles, Tags, Upload, Wand2 } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import WorkspaceCanvas, {
  type ActiveToolMode,
  type AnnotationObject,
  type Area,
  type CompareViewMode,
  type PolygonPoint,
  type ToolMode,
  type WorkspaceNavItem
} from '../components/WorkspaceCanvas';
import defaultCatsImage from '../../cats.jpg';

interface ClassItem {
  name: string;
  source: 'imported' | 'manual' | 'model';
  color: string;
  visible: boolean;
}

interface WorkspaceImage {
  id: number;
  name: string;
  src: string;
  annotations: AnnotationObject[];
}

type NavKey = 'Projects' | 'Tasks' | 'Jobs' | 'Cloud Storages' | 'Requests' | 'Models';

interface WorkspaceState {
  projectName: string;
  taskName: string;
  images: WorkspaceImage[];
  currentImageIndex: number;
  selectedObjectId: number | null;
  classList: ClassItem[];
  activeTool: ActiveToolMode;
  activeLabel: string;
  maskOpacity: number;
  compareViewMode: CompareViewMode;
  compareLeftSource: string;
  compareRightSource: string;
  selectedSegmentationModels: string[];
  selectedDetectionModels: string[];
  activeNav: NavKey;
}

const STORAGE_KEY = 'seglabel-ai.workspace';

const makeArea = (x: number, y: number, width: number, height: number): Area => ({
  x,
  y,
  width,
  height
});

const makePoints = (points: Array<[number, number]>): PolygonPoint[] =>
  points.map(([x, y]) => ({ x, y }));

const initialObjects: AnnotationObject[] = [
  {
    id: 1,
    label: 'Kitten',
    color: '#7CFC8A',
    type: 'polygon',
    source: 'imported',
    points: makePoints([
      [26, 56],
      [98, 42],
      [160, 66],
      [188, 204],
      [170, 356],
      [182, 542],
      [142, 676],
      [64, 690],
      [22, 610],
      [16, 456],
      [20, 258]
    ]),
    area: makeArea(16, 42, 172, 648)
  },
  {
    id: 2,
    label: 'Kitten',
    color: '#7CFC8A',
    type: 'box',
    source: 'imported',
    area: makeArea(276, 108, 186, 498)
  },
  {
    id: 3,
    label: 'Kitten',
    color: '#7CFC8A',
    type: 'box',
    source: 'model',
    modelName: 'YOLO World',
    score: 0.94,
    area: makeArea(470, 126, 182, 470)
  },
  {
    id: 4,
    label: 'Kitten',
    color: '#7CFC8A',
    type: 'box',
    source: 'model',
    modelName: 'Grounding DINO',
    score: 0.92,
    area: makeArea(660, 100, 212, 510)
  }
];

const initialClasses: ClassItem[] = [
  { name: 'Kitten', source: 'imported', color: '#7CFC8A', visible: true },
  { name: 'Tail', source: 'manual', color: '#52b5ff', visible: true },
  { name: 'Ear', source: 'manual', color: '#ffb454', visible: true },
  { name: 'Background', source: 'model', color: '#ff8fb1', visible: false }
];

const navItems: WorkspaceNavItem[] = [
  { key: 'Projects', label: 'Projects' },
  { key: 'Tasks', label: 'Tasks' },
  { key: 'Jobs', label: 'Jobs' },
  { key: 'Cloud Storages', label: 'Cloud Storages' },
  { key: 'Requests', label: 'Requests' },
  { key: 'Models', label: 'Models' }
];

const segmentationModels = ['SAM 2', 'SEEM', 'X-Decoder'];
const detectionModels = ['YOLO World', 'Grounding DINO', 'RT-DETR'];

const toolOptions: Array<{ id: ToolMode; label: string }> = [
  { id: 'select', label: 'Выбор' },
  { id: 'box', label: 'Box' },
  { id: 'polygon', label: 'Polygon' },
  { id: 'brush', label: 'Кисть' },
  { id: 'eraser', label: 'Ластик' },
  { id: 'split', label: 'Разделение' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'move', label: 'Move' }
];

const cloneState = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const getObjectSourceKey = (object: AnnotationObject) => {
  if (object.source === 'model') {
    return object.modelName ?? 'Model';
  }

  if (object.source === 'imported') {
    return 'Imported';
  }

  return 'Manual';
};

const buildInitialState = (): WorkspaceState => ({
  projectName: 'Cat behavior dataset',
  taskName: 'cats_sequence_12',
  images: [
    {
      id: 1,
      name: 'cats.jpg',
      src: defaultCatsImage,
      annotations: initialObjects
    }
  ],
  currentImageIndex: 0,
  selectedObjectId: 1,
  classList: initialClasses,
  activeTool: 'polygon',
  activeLabel: 'Kitten',
  maskOpacity: 0.58,
  compareViewMode: 'single',
  compareLeftSource: 'Imported',
  compareRightSource: 'YOLO World',
  selectedSegmentationModels: ['SAM 2'],
  selectedDetectionModels: ['YOLO World'],
  activeNav: 'Projects'
});

const WorkspacePage = () => {
  const initialState = useMemo(buildInitialState, []);
  const [workspace, setWorkspace] = useState<WorkspaceState>(initialState);
  const [newClassName, setNewClassName] = useState('');
  const [statusMessage, setStatusMessage] = useState('Готово к разметке');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hasSavedDraft, setHasSavedDraft] = useState<boolean>(() => Boolean(localStorage.getItem(STORAGE_KEY)));
  const [history, setHistory] = useState<WorkspaceState[]>([cloneState(initialState)]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyRef = useRef<WorkspaceState[]>([cloneState(initialState)]);
  const historyIndexRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedUrlsRef = useRef<string[]>([]);

  const currentImage = workspace.images[workspace.currentImageIndex];
  const objects = currentImage?.annotations ?? [];
  const selectedObject = objects.find((item) => item.id === workspace.selectedObjectId) ?? null;

  const hiddenLabels = useMemo(
    () => workspace.classList.filter((item) => !item.visible).map((item) => item.name),
    [workspace.classList]
  );
  const comparisonOptions = useMemo(() => {
    const dynamic = new Set<string>();

    objects.forEach((object) => {
      dynamic.add(getObjectSourceKey(object));
    });

    ['Imported', 'Manual', ...workspace.selectedSegmentationModels, ...workspace.selectedDetectionModels].forEach((item) =>
      dynamic.add(item)
    );

    return Array.from(dynamic);
  }, [objects, workspace.selectedSegmentationModels, workspace.selectedDetectionModels]);

  useEffect(() => {
    return () => {
      uploadedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const pushHistory = (nextState: WorkspaceState) => {
    const snapshot = cloneState(nextState);
    const nextHistory = [...historyRef.current.slice(0, historyIndexRef.current + 1), snapshot];
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    setHistory(nextHistory);
    setHistoryIndex(historyIndexRef.current);
  };

  const updateWorkspace = (
    updater: (current: WorkspaceState) => WorkspaceState,
    options?: { recordHistory?: boolean; status?: string }
  ) => {
    setWorkspace((current) => {
      const next = updater(current);

      if (options?.recordHistory !== false) {
        pushHistory(next);
      }

      return next;
    });

    if (options?.status) {
      setStatusMessage(options.status);
    }
  };

  const replaceWorkspace = (nextState: WorkspaceState, status: string, recordHistory = true) => {
    setWorkspace(nextState);

    if (recordHistory) {
      pushHistory(nextState);
    }

    setStatusMessage(status);
  };

  const setCurrentImageIndex = (nextIndex: number) => {
    updateWorkspace(
      (current) => ({
        ...current,
        currentImageIndex: Math.max(0, Math.min(nextIndex, current.images.length - 1)),
        selectedObjectId: null
      }),
      { recordHistory: false, status: `Открыто изображение ${Math.max(1, Math.min(nextIndex + 1, workspace.images.length))}` }
    );
  };

  const handleUndo = () => {
    if (historyIndexRef.current === 0) {
      setStatusMessage('Больше нечего отменять');
      return;
    }

    const nextIndex = historyIndexRef.current - 1;
    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
    setWorkspace(cloneState(historyRef.current[nextIndex]));
    setStatusMessage('Последнее действие отменено');
  };

  const handleRedo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) {
      setStatusMessage('Больше нечего повторять');
      return;
    }

    const nextIndex = historyIndexRef.current + 1;
    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
    setWorkspace(cloneState(historyRef.current[nextIndex]));
    setStatusMessage('Действие повторено');
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cloneState(workspace)));
    setHasSavedDraft(true);
    setStatusMessage(`Черновик сохранён: ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`);
  };

  const handleLoadSaved = () => {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      setStatusMessage('Сохранённый черновик не найден');
      return;
    }

    const saved = JSON.parse(raw) as WorkspaceState;
    replaceWorkspace(saved, 'Черновик загружен');
    setIsMenuOpen(false);
  };

  const handleExportProject = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            projectName: workspace.projectName,
            taskName: workspace.taskName,
            images: workspace.images.map((image) => ({
              name: image.name,
              annotations: image.annotations
            })),
            classList: workspace.classList,
            selectedSegmentationModels: workspace.selectedSegmentationModels,
            selectedDetectionModels: workspace.selectedDetectionModels
          },
          null,
          2
        )
      ],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${workspace.projectName.replace(/\s+/g, '-').toLowerCase() || 'seglabel-project'}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatusMessage('Проект экспортирован в JSON');
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (!files.length) {
      return;
    }

    const nextImages: WorkspaceImage[] = files.map((file, index) => {
      const src = URL.createObjectURL(file);
      uploadedUrlsRef.current.push(src);

      return {
        id: Date.now() + index,
        name: file.name,
        src,
        annotations: []
      };
    });

    updateWorkspace(
      (current) => ({
        ...current,
        images: [...current.images, ...nextImages],
        currentImageIndex: current.images.length,
        taskName: files[0].name.replace(/\.[^.]+$/, ''),
        selectedObjectId: null
      }),
      { status: `Добавлено изображений: ${files.length}` }
    );

    event.target.value = '';
  };

  const createObject = (object: Omit<AnnotationObject, 'id'>) => {
    updateWorkspace(
      (current) => {
        const nextObject: AnnotationObject = { ...object, id: Date.now() };
        const images = current.images.map((image, index) =>
          index === current.currentImageIndex
            ? { ...image, annotations: [...image.annotations, nextObject] }
            : image
        );
        const hasClass = current.classList.some((item) => item.name === object.label);

        return {
          ...current,
          images,
          selectedObjectId: nextObject.id,
          classList: hasClass
            ? current.classList
            : [...current.classList, { name: object.label, source: 'manual', color: object.color, visible: true }]
        };
      },
      { status: `Создан объект ${object.label}` }
    );
  };

  const updateObject = (id: number, patch: Partial<AnnotationObject>) => {
    updateWorkspace(
      (current) => ({
        ...current,
        images: current.images.map((image, index) =>
          index === current.currentImageIndex
            ? {
                ...image,
                annotations: image.annotations.map((item) => (item.id === id ? { ...item, ...patch } : item))
              }
            : image
        )
      }),
      { status: `Объект ${id} обновлён` }
    );
  };

  const deleteObject = (id: number) => {
    updateWorkspace(
      (current) => ({
        ...current,
        images: current.images.map((image, index) =>
          index === current.currentImageIndex
            ? {
                ...image,
                annotations: image.annotations.filter((item) => item.id !== id)
              }
            : image
        ),
        selectedObjectId: current.selectedObjectId === id ? null : current.selectedObjectId
      }),
      { status: `Объект ${id} удалён` }
    );
  };

  const splitObject = (id: number, splitX: number) => {
    updateWorkspace(
      (current) => {
        const currentImage = current.images[current.currentImageIndex];
        const target = currentImage.annotations.find((item) => item.id === id);

        if (!target?.area || target.type !== 'box') {
          return current;
        }

        const minWidth = 24;
        const localSplitX = Math.max(
          target.area.x + minWidth,
          Math.min(splitX, target.area.x + target.area.width - minWidth)
        );
        const leftWidth = Math.round(localSplitX - target.area.x);
        const rightWidth = Math.round(target.area.width - leftWidth);

        if (leftWidth < minWidth || rightWidth < minWidth) {
          return current;
        }

        const leftObject: AnnotationObject = {
          ...target,
          id: Date.now(),
          area: {
            ...target.area,
            width: leftWidth
          }
        };

        const rightObject: AnnotationObject = {
          ...target,
          id: Date.now() + 1,
          area: {
            ...target.area,
            x: Math.round(localSplitX),
            width: rightWidth
          }
        };

        return {
          ...current,
          images: current.images.map((image, index) =>
            index === current.currentImageIndex
              ? {
                  ...image,
                  annotations: image.annotations.flatMap((item) =>
                    item.id === id ? [leftObject, rightObject] : [item]
                  )
                }
              : image
          ),
          selectedObjectId: leftObject.id
        };
      },
      { status: `Объект ${id} разделён` }
    );
  };

  const handleDeleteSelected = () => {
    if (!workspace.selectedObjectId) {
      setStatusMessage('Сначала выберите объект');
      return;
    }

    updateWorkspace(
      (current) => ({
        ...current,
        images: current.images.map((image, index) =>
          index === current.currentImageIndex
            ? {
                ...image,
                annotations: image.annotations.filter((item) => item.id !== current.selectedObjectId)
              }
            : image
        ),
        selectedObjectId: null
      }),
      { status: 'Выбранный объект удалён' }
    );
  };

  const handleResetCurrentAnnotations = () => {
    updateWorkspace(
      (current) => ({
        ...current,
        images: current.images.map((image, index) =>
          index === current.currentImageIndex ? { ...image, annotations: [] } : image
        ),
        selectedObjectId: null
      }),
      { status: 'Аннотации текущего изображения очищены' }
    );
    setIsMenuOpen(false);
  };

  const toggleClassVisibility = (name: string) => {
    updateWorkspace(
      (current) => ({
        ...current,
        classList: current.classList.map((item) =>
          item.name === name ? { ...item, visible: !item.visible } : item
        )
      }),
      { recordHistory: false, status: `Видимость класса ${name} переключена` }
    );
  };

  const addClass = () => {
    const value = newClassName.trim();

    if (!value) {
      setStatusMessage('Введите название класса');
      return;
    }

    if (workspace.classList.some((item) => item.name.toLowerCase() === value.toLowerCase())) {
      setStatusMessage('Такой класс уже существует');
      return;
    }

    updateWorkspace(
      (current) => ({
        ...current,
        classList: [...current.classList, { name: value, source: 'manual', color: '#52b5ff', visible: true }],
        activeLabel: value
      }),
      { status: `Класс ${value} добавлен` }
    );
    setNewClassName('');
  };

  const toggleModel = (model: string, kind: 'segmentation' | 'detection') => {
    updateWorkspace(
      (current) => {
        const key = kind === 'segmentation' ? 'selectedSegmentationModels' : 'selectedDetectionModels';
        const currentModels = current[key];

        return {
          ...current,
          [key]: currentModels.includes(model)
            ? currentModels.filter((item) => item !== model)
            : [...currentModels, model]
        };
      },
      { recordHistory: false, status: `Список моделей ${kind === 'segmentation' ? 'сегментации' : 'детекции'} обновлён` }
    );
  };

  const handleRunModels = () => {
    const activeModels = [...workspace.selectedSegmentationModels, ...workspace.selectedDetectionModels];

    if (!activeModels.length) {
      setStatusMessage('Выберите хотя бы одну модель');
      return;
    }

    const currentObjects = workspace.images[workspace.currentImageIndex]?.annotations ?? [];
    const nextId = currentObjects.reduce((maxId, item) => Math.max(maxId, item.id), 0) + 1;
    const generated: AnnotationObject[] = activeModels.map((model, index) => ({
      id: nextId + index,
      label: workspace.activeLabel,
      color: '#7CFC8A',
      type: index % 2 === 0 ? 'box' : 'polygon',
      source: 'model',
      modelName: model,
      score: Math.max(0.72, 0.93 - index * 0.03),
      area:
        index % 2 === 0
          ? makeArea(120 + index * 96, 120 + index * 24, 180, 240)
          : makeArea(240 + index * 68, 168, 180, 220),
      points:
        index % 2 === 0
          ? undefined
          : makePoints([
              [240 + index * 68, 168],
              [310 + index * 68, 144],
              [382 + index * 68, 182],
              [396 + index * 68, 310],
              [352 + index * 68, 388],
              [264 + index * 68, 360]
            ])
    }));

    updateWorkspace(
      (current) => ({
        ...current,
        images: current.images.map((image, index) =>
          index === current.currentImageIndex
            ? { ...image, annotations: [...image.annotations, ...generated] }
            : image
        ),
        selectedObjectId: generated[0].id
      }),
      { status: `Модели ${activeModels.join(', ')} добавили ${generated.length} результата` }
    );
  };

  return (
    <PageTransition>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageUpload}
        className="hidden"
      />

      <div className="mx-auto max-w-[1720px] px-4 pb-8 pt-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="min-w-0">
            <WorkspaceCanvas
              navItems={navItems}
              activeNav={workspace.activeNav}
              onNavChange={(nav) =>
                updateWorkspace((current) => ({ ...current, activeNav: nav }), {
                  recordHistory: false,
                  status: `Открыт раздел ${nav}`
                })
              }
              activeTool={workspace.activeTool}
              onToolChange={(tool) =>
                updateWorkspace((current) => ({ ...current, activeTool: tool }), {
                  recordHistory: false,
                  status: tool ? `Активный инструмент: ${tool}` : 'Инструмент выключен'
                })
              }
              activeLabel={workspace.activeLabel}
              maskOpacity={workspace.maskOpacity}
              onMaskOpacityChange={(opacity) =>
                updateWorkspace(
                  (current) => ({
                    ...current,
                    maskOpacity: opacity
                  }),
                  {
                    recordHistory: false,
                    status: `Прозрачность маски: ${Math.round(opacity * 100)}%`
                  }
                )
              }
              compareViewMode={workspace.compareViewMode}
              compareLeftSource={workspace.compareLeftSource}
              compareRightSource={workspace.compareRightSource}
              imageName={currentImage.name}
              imageSrc={currentImage.src}
              imageIndex={workspace.currentImageIndex}
              imageCount={workspace.images.length}
              canUndo={historyIndex > 0}
              canRedo={historyIndex < history.length - 1}
              statusMessage={statusMessage}
              isMenuOpen={isMenuOpen}
              hasSavedDraft={hasSavedDraft}
              selectedObjectId={workspace.selectedObjectId}
              objects={objects}
              hiddenLabels={hiddenLabels}
              onToggleMenu={() => setIsMenuOpen((current) => !current)}
              onCloseMenu={() => setIsMenuOpen(false)}
              onSave={handleSave}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onFirstImage={() => setCurrentImageIndex(0)}
              onPreviousImage={() => setCurrentImageIndex(workspace.currentImageIndex - 1)}
              onNextImage={() => setCurrentImageIndex(workspace.currentImageIndex + 1)}
              onLastImage={() => setCurrentImageIndex(workspace.images.length - 1)}
              onSelectImageByIndex={(index) => setCurrentImageIndex(index)}
              onOpenImagePicker={() => fileInputRef.current?.click()}
              onLoadSaved={handleLoadSaved}
              onExportProject={handleExportProject}
              onResetAnnotations={handleResetCurrentAnnotations}
              onSelectObject={(id) =>
                updateWorkspace((current) => ({ ...current, selectedObjectId: id }), { recordHistory: false })
              }
              onCreateObject={createObject}
              onUpdateObject={updateObject}
              onSplitObject={splitObject}
            />

            {selectedObject && (
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-[24px] border border-slate-800 bg-slate-900/90 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">Сводка по выбранному объекту</h3>
                      <p className="text-sm text-slate-400">Данные обновляются сразу при выделении или перемещении объекта на холсте.</p>
                    </div>
                    <div className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300">
                      ID {selectedObject.id}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Класс</div>
                      <div className="mt-2 text-base font-medium text-white">{selectedObject.label}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Тип</div>
                      <div className="mt-2 text-base font-medium text-white">{selectedObject.type}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Источник</div>
                      <div className="mt-2 text-base font-medium text-white">{selectedObject.source}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Уверенность</div>
                      <div className="mt-2 text-base font-medium text-white">
                        {selectedObject.score ? `${Math.round(selectedObject.score * 100)}%` : 'manual'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-800 bg-slate-900/90 p-5">
                  <h3 className="text-lg font-semibold text-white">Быстрые действия</h3>
                  <div className="mt-4 space-y-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      className="w-full rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white"
                    >
                      Сохранить аннотации
                    </button>
                    <button
                      type="button"
                      onClick={handleRunModels}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200"
                    >
                      Запустить выбранные модели
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteSelected}
                      className="w-full rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
                    >
                      Удалить выбранный объект
                    </button>
                    <button
                      type="button"
                      onClick={handleExportProject}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200"
                    >
                      Экспортировать проект
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[24px] border border-slate-800 bg-slate-900/90 p-5"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-brand-500/15 p-3 text-brand-100">
                  <FolderPlus size={20} />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-white">Рабочая панель аннотаций</h1>
                  <p className="text-sm text-slate-400">
                    Все основные элементы интерфейса работают на фронтенде: загрузка, сохранение, навигация, undo/redo и моделирование результатов.
                  </p>
                </div>
              </div>

              <div className="grid gap-3">
                <label className="text-sm text-slate-300">
                  Проект
                  <input
                    value={workspace.projectName}
                    onChange={(event) =>
                      updateWorkspace((current) => ({ ...current, projectName: event.target.value }), {
                        recordHistory: false
                      })
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                  />
                </label>
                <label className="text-sm text-slate-300">
                  Задача
                  <input
                    value={workspace.taskName}
                    onChange={(event) =>
                      updateWorkspace((current) => ({ ...current, taskName: event.target.value }), {
                        recordHistory: false
                      })
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                  />
                </label>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-white">Текущее изображение</div>
                    <div className="mt-1 text-sm text-slate-400">
                      Загрузите одно или сразу несколько изображений, затем переключайтесь между ними в toolbar.
                    </div>
                  </div>
                  <div className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-200">
                    {currentImage.name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 inline-flex items-center justify-center rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  Загрузить изображение
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-200">
                    <Upload size={16} />
                    Импорт изображений
                  </div>
                  <p className="mt-2 text-sm text-slate-300">
                    Каждое загруженное изображение добавляется в локальный dataset и становится доступным в верхней навигации по кадрам.
                  </p>
                </div>
                <div className="rounded-2xl border border-brand-500/20 bg-brand-500/10 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-brand-100">
                    <Tags size={16} />
                    Автоклассы из аннотаций
                  </div>
                  <p className="mt-2 text-sm text-slate-300">
                    Когда создаётся объект с новым label, этот класс автоматически попадает в общий список проекта.
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-[24px] border border-slate-800 bg-slate-900/90 p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Классы и инструменты</h2>
                  <p className="text-sm text-slate-400">Кнопки выбора label и инструментов обновляют холст сразу.</p>
                </div>
                <div className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300">
                  {objects.length} объектов
                </div>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {toolOptions.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() =>
                      updateWorkspace(
                        (current) => ({
                          ...current,
                          activeTool: current.activeTool === tool.id ? null : tool.id
                        }),
                        {
                          recordHistory: false,
                          status:
                            workspace.activeTool === tool.id
                              ? 'Инструмент выключен'
                              : `Активный инструмент: ${tool.label}`
                        }
                      )
                    }
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      workspace.activeTool === tool.id
                        ? 'bg-brand-500 text-white'
                        : 'border border-slate-700 bg-slate-950 text-slate-300'
                    }`}
                  >
                    {tool.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                {workspace.classList.map((item) => (
                  <div
                    key={item.name}
                    className={`flex items-center justify-between rounded-2xl border px-3 py-3 ${
                      workspace.activeLabel === item.name
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-slate-800 bg-slate-950'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        updateWorkspace((current) => ({ ...current, activeLabel: item.name }), {
                          recordHistory: false,
                          status: `Активный класс: ${item.name}`
                        })
                      }
                      className="flex items-center gap-3 text-left"
                    >
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span>
                        <span className="block text-sm font-medium text-white">{item.name}</span>
                        <span className="block text-xs text-slate-500">
                          {item.source === 'imported' && 'Импортирован из аннотаций'}
                          {item.source === 'manual' && 'Добавлен пользователем'}
                          {item.source === 'model' && 'Сгенерирован моделью'}
                        </span>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleClassVisibility(item.name)}
                      className={`rounded-full px-3 py-1 text-xs ${
                        item.visible ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {item.visible ? 'Виден' : 'Скрыт'}
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="mb-2 text-sm font-medium text-white">Прозрачность слоя маски</div>
                <div className="mb-3 text-xs text-slate-400">
                  Отдельный mask-layer рисуется поверх изображения и регулируется этим ползунком.
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={Math.round(workspace.maskOpacity * 100)}
                  onChange={(event) =>
                    updateWorkspace(
                      (current) => ({
                        ...current,
                        maskOpacity: Number(event.target.value) / 100
                      }),
                      {
                        recordHistory: false,
                        status: `Прозрачность маски: ${event.target.value}%`
                      }
                    )
                  }
                  className="w-full accent-brand-500"
                />
                <div className="mt-2 text-xs text-slate-300">
                  {Math.round(workspace.maskOpacity * 100)}%
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  value={newClassName}
                  onChange={(event) => setNewClassName(event.target.value)}
                  placeholder="Добавить свой класс"
                  className="flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                />
                <button
                  type="button"
                  onClick={addClass}
                  className="rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white"
                >
                  Добавить
                </button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-[24px] border border-slate-800 bg-slate-900/90 p-5"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-brand-500/15 p-3 text-brand-100">
                  <Wand2 size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Модели для анализа</h2>
                  <p className="text-sm text-slate-400">Переключатели и запуск моделей теперь тоже работают на фронтенде.</p>
                </div>
              </div>

              <div className="grid gap-4">
                <div>
                  <div className="mb-2 text-sm font-medium text-slate-200">Сегментация</div>
                  <div className="flex flex-wrap gap-2">
                    {segmentationModels.map((model) => {
                      const isActive = workspace.selectedSegmentationModels.includes(model);

                      return (
                        <button
                          key={model}
                          type="button"
                          onClick={() => toggleModel(model, 'segmentation')}
                          className={`rounded-full px-4 py-2 text-sm ${
                            isActive ? 'bg-emerald-500 text-slate-950' : 'border border-slate-700 bg-slate-950 text-slate-300'
                          }`}
                        >
                          {model}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-medium text-slate-200">Детекция</div>
                  <div className="flex flex-wrap gap-2">
                    {detectionModels.map((model) => {
                      const isActive = workspace.selectedDetectionModels.includes(model);

                      return (
                        <button
                          key={model}
                          type="button"
                          onClick={() => toggleModel(model, 'detection')}
                          className={`rounded-full px-4 py-2 text-sm ${
                            isActive ? 'bg-brand-500 text-white' : 'border border-slate-700 bg-slate-950 text-slate-300'
                          }`}
                        >
                          {model}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRunModels}
                className="mt-4 w-full rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white"
              >
                Запустить выбранные модели
              </button>

              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="mb-2 text-sm font-medium text-white">Сравнение результатов</div>
                <div className="mb-3 text-xs text-slate-400">
                  Переключайтесь между обычным просмотром и split-view, чтобы сравнить импорт, ручную разметку и результаты моделей.
                </div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {(['single', 'split'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() =>
                        updateWorkspace(
                          (current) => ({ ...current, compareViewMode: mode }),
                          {
                            recordHistory: false,
                            status: mode === 'split' ? 'Включён split-view' : 'Включён обычный просмотр'
                          }
                        )
                      }
                      className={`rounded-full px-4 py-2 text-sm ${
                        workspace.compareViewMode === mode
                          ? 'bg-brand-500 text-white'
                          : 'border border-slate-700 bg-slate-900 text-slate-300'
                      }`}
                    >
                      {mode === 'single' ? 'Single view' : 'Split view'}
                    </button>
                  ))}
                </div>

                {workspace.compareViewMode === 'split' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-slate-400">
                      Левая часть
                      <select
                        value={workspace.compareLeftSource}
                        onChange={(event) =>
                          updateWorkspace(
                            (current) => ({ ...current, compareLeftSource: event.target.value }),
                            { recordHistory: false, status: `Слева: ${event.target.value}` }
                          )
                        }
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                      >
                        {comparisonOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs text-slate-400">
                      Правая часть
                      <select
                        value={workspace.compareRightSource}
                        onChange={(event) =>
                          updateWorkspace(
                            (current) => ({ ...current, compareRightSource: event.target.value }),
                            { recordHistory: false, status: `Справа: ${event.target.value}` }
                          )
                        }
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                      >
                        {comparisonOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">
                <div className="mb-2 flex items-center gap-2 font-medium text-white">
                  <Sparkles size={16} />
                  Сценарий работы
                </div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-emerald-300" />
                    <span>Создаём проект, загружаем одно или несколько изображений и переключаемся по ним кнопками в toolbar.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-emerald-300" />
                    <span>Размечаем вручную через select, box, polygon, zoom и move.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-emerald-300" />
                    <span>Сохраняем, экспортируем или симулируем результаты моделей прямо во фронтенде.</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </section>
        </div>
      </div>
    </PageTransition>
  );
};

export default WorkspacePage;
