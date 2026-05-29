import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import PageTransition from '../components/PageTransition';
import WorkspaceCanvas, {
  type ActiveToolMode,
  type AnnotationObject,
  type Area,
  type CompareViewMode,
  type OpacityTargetMode,
  type PolygonPoint,
  type WorkspaceModelItem
} from '../components/WorkspaceCanvas';
import {
  api,
  type AnalysisSocketMessage,
  type AnnotationPayload,
  type AnnotationResponse,
  type ClassType,
  type ModelConfig,
  type Project
} from '../lib/api';
import defaultCatsImage from '../../cats.jpg';

interface ClassItem {
  name: string;
  source: 'imported' | 'manual' | 'model';
  color: string;
  visible: boolean;
  opacity?: number;
}

interface WorkspaceImage {
  id: number | string;
  name: string;
  src: string;
  annotations: AnnotationObject[];
}

interface WorkspaceState {
  projectName: string;
  taskName: string;
  images: WorkspaceImage[];
  currentImageIndex: number;
  selectedObjectId: AnnotationObject['id'] | null;
  classList: ClassItem[];
  activeTool: ActiveToolMode;
  activeLabel: string;
  maskOpacity: number;
  compareViewMode: CompareViewMode;
  compareLeftSource: string;
  compareRightSource: string;
  selectedSegmentationModels: string[];
  selectedDetectionModels: string[];
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

const isUuid = (value: AnnotationObject['id']): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const createLocalAnnotationId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getAnnotationApiType = (object: Pick<AnnotationObject, 'type'>): AnnotationPayload['type'] =>
  object.type === 'box' ? 'detection' : 'segmentation';

const normalizeModelName = (name: string) => name.trim().toLowerCase();

const uniqueModelsByName = (models: ModelConfig[]) => {
  const seen = new Set<string>();

  return models.filter((model) => {
    const key = normalizeModelName(model.name);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const serializeAnnotationObject = (object: AnnotationObject): AnnotationPayload => {
  const { id: _id, ...objectData } = object;

  return {
    type: getAnnotationApiType(object),
    class_name: object.label,
    data: {
      version: 1,
      object: objectData
    }
  };
};

const normalizeBackendType = (type: AnnotationResponse['type']) =>
  type === 'detect' ? 'detection' : type === 'segment' ? 'segmentation' : type;

const annotationFromApi = (annotation: AnnotationResponse): AnnotationObject => {
  const data = annotation.data && typeof annotation.data === 'object' ? (annotation.data as Record<string, unknown>) : {};
  const objectData =
    data.object && typeof data.object === 'object' ? (data.object as Partial<AnnotationObject>) : (data as Partial<AnnotationObject>);
  const backendType = normalizeBackendType(annotation.type);

  return {
    id: annotation.id,
    label: annotation.class_name,
    color: objectData.color ?? '#7CFC8A',
    type: objectData.type ?? (backendType === 'detection' ? 'box' : 'polygon'),
    source: objectData.source ?? 'manual',
    operation: objectData.operation,
    modelName: objectData.modelName,
    score: objectData.score,
    opacity: objectData.opacity,
    locked: objectData.locked,
    area: objectData.area,
    points: objectData.points
  };
};

const annotationsFromRecord = (annotations: Record<string, AnnotationResponse> | undefined) =>
  Object.values(annotations ?? {}).map(annotationFromApi);

const mergeAnnotationObjects = (primary: AnnotationObject[], fallback: AnnotationObject[]) => {
  const byId = new Map<AnnotationObject['id'], AnnotationObject>();

  [...fallback, ...primary].forEach((annotation) => {
    byId.set(annotation.id, annotation);
  });

  return Array.from(byId.values());
};

const classItemFromApi = (classType: ClassType): ClassItem => ({
  name: classType.name_eng || classType.name_ru,
  source: 'imported',
  color: '#7CFC8A',
  visible: true
});

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
  selectedDetectionModels: ['YOLO World']
});

const WorkspacePage = () => {
  const initialState = useMemo(buildInitialState, []);
  const [workspace, setWorkspace] = useState<WorkspaceState>(initialState);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [availableModels, setAvailableModels] = useState<ModelConfig[]>([]);
  const [availableClasses, setAvailableClasses] = useState<ClassType[]>([]);
  const [isRunningModels, setIsRunningModels] = useState(false);
  const [isLoadingRemoteImages, setIsLoadingRemoteImages] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [statusMessage, setStatusMessage] = useState('Готово к разметке');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hasSavedDraft, setHasSavedDraft] = useState<boolean>(() => Boolean(localStorage.getItem(STORAGE_KEY)));
  const [opacityTargetMode, setOpacityTargetMode] = useState<OpacityTargetMode>('class');
  const [opacityClassName, setOpacityClassName] = useState(initialState.activeLabel);
  const [analysisClassNames, setAnalysisClassNames] = useState<string[]>([initialState.activeLabel]);
  const [history, setHistory] = useState<WorkspaceState[]>([cloneState(initialState)]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyRef = useRef<WorkspaceState[]>([cloneState(initialState)]);
  const historyIndexRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedUrlsRef = useRef<string[]>([]);

  const currentImage = workspace.images[workspace.currentImageIndex];
  const objects = currentImage?.annotations ?? [];
  const canPersistAnnotations = Boolean(selectedProjectId && currentImage && isUuid(currentImage.id));

  const hiddenLabels = useMemo(
    () => workspace.classList.filter((item) => !item.visible).map((item) => item.name),
    [workspace.classList]
  );

  useEffect(() => {
    if (workspace.classList.some((item) => item.name === opacityClassName)) {
      return;
    }

    setOpacityClassName(workspace.activeLabel || workspace.classList[0]?.name || '');
  }, [opacityClassName, workspace.activeLabel, workspace.classList]);

  useEffect(() => {
    const classNames = new Set(workspace.classList.map((item) => item.name));

    setAnalysisClassNames((current) => {
      const validCurrent = current.filter((name) => classNames.has(name));

      if (validCurrent.length || current.length === 0) {
        return validCurrent;
      }

      const fallback = workspace.activeLabel || workspace.classList[0]?.name;
      return fallback ? [fallback] : [];
    });
  }, [workspace.activeLabel, workspace.classList]);

  const comparisonOptions = useMemo(() => {
    const dynamic = new Set<string>();

    objects.forEach((object) => {
      dynamic.add(getObjectSourceKey(object));
    });

    const selectedModelNames = availableModels
      .filter((model) => [...workspace.selectedSegmentationModels, ...workspace.selectedDetectionModels].includes(String(model.id)))
      .map((model) => model.name);

    ['Imported', 'Manual', ...selectedModelNames].forEach((item) => dynamic.add(item));

    return Array.from(dynamic);
  }, [availableModels, objects, workspace.selectedSegmentationModels, workspace.selectedDetectionModels]);
  const segmentationModels = useMemo<WorkspaceModelItem[]>(
    () => uniqueModelsByName(availableModels.filter((model) => model.type.includes('segmentation'))),
    [availableModels]
  );
  const detectionModels = useMemo<WorkspaceModelItem[]>(
    () => uniqueModelsByName(availableModels.filter((model) => model.type.includes('detection'))),
    [availableModels]
  );
  const selectedModelIds = useMemo(
    () =>
      availableModels
        .filter((model) => [...workspace.selectedSegmentationModels, ...workspace.selectedDetectionModels].includes(String(model.id)))
        .map((model) => model.id),
    [availableModels, workspace.selectedDetectionModels, workspace.selectedSegmentationModels]
  );

  useEffect(() => {
    return () => {
      uploadedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    api
      .listProjects()
      .then((items) => {
        setProjects(items);
        setSelectedProjectId(items[0]?.id ?? '');
      })
      .catch((err) => setStatusMessage(err instanceof Error ? err.message : 'Не удалось загрузить проекты'));
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }

    const project = projects.find((item) => item.id === selectedProjectId);
    let isCancelled = false;
    setIsLoadingRemoteImages(true);
    setStatusMessage('Загружаем изображения проекта...');

    api
      .getProjectImages(selectedProjectId)
      .then(async (items) => {
        const [projectClasses, projectModels] = await Promise.all([
          api.getProjectClasses(selectedProjectId).catch(() => [] as ClassType[]),
          api.getProjectModels(selectedProjectId).catch(() => [] as ModelConfig[])
        ]);
        const remoteImages = await Promise.all(
          items.map(async (item, index) => {
            const src = await api.getImageObjectUrl(selectedProjectId, item.id);
            const embeddedAnnotations = annotationsFromRecord(item.annotations);
            const fetchedAnnotations = await api
              .getAnnotations(selectedProjectId, item.id)
              .then((annotations) => annotations.map(annotationFromApi))
              .catch(() => [] as AnnotationObject[]);
            uploadedUrlsRef.current.push(src);

            return {
              id: item.id,
              name: item.file_path?.split('/').pop() ?? `${index + 1}.${item.format ?? 'jpg'}`,
              src,
              annotations: mergeAnnotationObjects(fetchedAnnotations, embeddedAnnotations)
            } satisfies WorkspaceImage;
          })
        );

        if (isCancelled) {
          remoteImages.forEach((image) => URL.revokeObjectURL(image.src));
          return;
        }

        const nextState: WorkspaceState = {
          ...buildInitialState(),
          projectName: project?.name ?? 'Проект',
          taskName: remoteImages[0]?.name.replace(/\.[^.]+$/, '') ?? 'Нет изображений',
          images: remoteImages.length
            ? remoteImages
            : [
                {
                  id: 'empty',
                  name: 'Нет изображений',
                  src: defaultCatsImage,
                  annotations: []
                }
              ],
          currentImageIndex: 0,
          selectedObjectId: null,
          classList: remoteImages.length
            ? [
                ...projectClasses.map(classItemFromApi),
                ...Array.from(new Set(remoteImages.flatMap((image) => image.annotations.map((item) => item.label))))
                  .filter((name) => !projectClasses.some((classType) => classType.name_eng === name || classType.name_ru === name))
                  .map<ClassItem>((name) => ({
                    name,
                    source: 'imported',
                    color: '#7CFC8A',
                    visible: true
                  })),
                ...(projectClasses.length ? [] : [{ name: 'Object', source: 'manual' as const, color: '#52b5ff', visible: true }])
              ]
            : initialClasses,
          activeLabel:
            remoteImages[0]?.annotations[0]?.label ??
            projectClasses[0]?.name_eng ??
            projectClasses[0]?.name_ru ??
            (remoteImages.length ? 'Object' : 'Kitten'),
          selectedSegmentationModels: projectModels
            .filter((model) => model.type.includes('segmentation'))
            .slice(0, 1)
            .map((model) => String(model.id)),
          selectedDetectionModels: projectModels
            .filter((model) => model.type.includes('detection'))
            .slice(0, 1)
            .map((model) => String(model.id))
        };

        historyRef.current = [cloneState(nextState)];
        historyIndexRef.current = 0;
        setHistory(historyRef.current);
        setHistoryIndex(0);
        setAvailableModels(projectModels);
        setAvailableClasses(projectClasses);
        setWorkspace(nextState);
        setStatusMessage(remoteImages.length ? `Загружено изображений проекта: ${remoteImages.length}` : 'В проекте пока нет изображений');
      })
      .catch((err) => setStatusMessage(err instanceof Error ? err.message : 'Не удалось загрузить изображения проекта'))
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingRemoteImages(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [projects, selectedProjectId]);

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

  const replaceAnnotationId = (imageId: WorkspaceImage['id'], localId: AnnotationObject['id'], remote: AnnotationResponse) => {
    const remoteObject = annotationFromApi(remote);

    updateWorkspace(
      (current) => ({
        ...current,
        images: current.images.map((image) =>
          image.id === imageId
            ? {
                ...image,
                annotations: image.annotations.map((item) => (item.id === localId ? remoteObject : item))
              }
            : image
        ),
        selectedObjectId: current.selectedObjectId === localId ? remoteObject.id : current.selectedObjectId
      }),
      { recordHistory: false }
    );
  };

  const ensureRemoteClass = async (projectId: string, label: string) => {
    const exists = workspace.classList.some((item) => item.name.toLowerCase() === label.toLowerCase() && item.source !== 'manual');

    if (exists) {
      return;
    }

    try {
      await api.createProjectClass(projectId, label);
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('уже существует')) {
        throw err;
      }
    }
  };

  const removeLocalAnnotation = (imageId: WorkspaceImage['id'], objectId: AnnotationObject['id']) => {
    updateWorkspace(
      (current) => ({
        ...current,
        images: current.images.map((image) =>
          image.id === imageId
            ? {
                ...image,
                annotations: image.annotations.filter((item) => item.id !== objectId)
              }
            : image
        ),
        selectedObjectId: current.selectedObjectId === objectId ? null : current.selectedObjectId
      }),
      { recordHistory: false }
    );
  };

  const createObject = (object: Omit<AnnotationObject, 'id'>) => {
    const imageForRequest = currentImage;
    const localId = createLocalAnnotationId();
    const shouldPersist = Boolean(selectedProjectId && imageForRequest && isUuid(imageForRequest.id));
    const nextObject: AnnotationObject = { ...object, id: localId };

    updateWorkspace(
      (current) => {
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

    if (shouldPersist) {
      ensureRemoteClass(selectedProjectId, object.label)
        .then(() => api.createAnnotation(selectedProjectId, String(imageForRequest.id), serializeAnnotationObject(nextObject)))
        .then((remote) => {
          replaceAnnotationId(imageForRequest.id, localId, remote);
          setStatusMessage(`Объект ${object.label} сохранён в БД`);
        })
        .catch((err) => {
          removeLocalAnnotation(imageForRequest.id, localId);
          setStatusMessage(err instanceof Error ? `Не удалось сохранить объект: ${err.message}` : 'Не удалось сохранить объект');
        });
    }
  };

  const updateObject = (id: AnnotationObject['id'], patch: Partial<AnnotationObject>) => {
    const imageForRequest = currentImage;
    const target = imageForRequest?.annotations.find((item) => item.id === id);
    const nextObject = target ? { ...target, ...patch } : null;

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

    if (selectedProjectId && imageForRequest && isUuid(imageForRequest.id) && isUuid(id) && nextObject) {
      api
        .updateAnnotation(selectedProjectId, imageForRequest.id, id, serializeAnnotationObject(nextObject))
        .then(() => setStatusMessage(`Объект ${id} обновлён в БД`))
        .catch((err) => setStatusMessage(err instanceof Error ? `Не удалось обновить объект: ${err.message}` : 'Не удалось обновить объект'));
    }
  };

  const deleteObject = (id: AnnotationObject['id']) => {
    const imageForRequest = currentImage;

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

    if (selectedProjectId && imageForRequest && isUuid(imageForRequest.id) && isUuid(id)) {
      api
        .deleteAnnotation(selectedProjectId, imageForRequest.id, id)
        .then(() => setStatusMessage(`Объект ${id} удалён из БД`))
        .catch((err) => setStatusMessage(err instanceof Error ? `Не удалось удалить объект: ${err.message}` : 'Не удалось удалить объект'));
    }
  };

  const splitObject = (id: AnnotationObject['id'], splitX: number) => {
    const imageForRequest = currentImage;
    let splitObjects: AnnotationObject[] = [];

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
          id: createLocalAnnotationId(),
          area: {
            ...target.area,
            width: leftWidth
          }
        };

        const rightObject: AnnotationObject = {
          ...target,
          id: createLocalAnnotationId(),
          area: {
            ...target.area,
            x: Math.round(localSplitX),
            width: rightWidth
          }
        };
        splitObjects = [leftObject, rightObject];

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

    if (selectedProjectId && imageForRequest && isUuid(imageForRequest.id) && isUuid(id) && splitObjects.length === 2) {
      const remoteImageId = imageForRequest.id;
      api
        .deleteAnnotation(selectedProjectId, remoteImageId, id)
        .then(() =>
          Promise.all(splitObjects.map((object) => api.createAnnotation(selectedProjectId, remoteImageId, serializeAnnotationObject(object))))
        )
        .then((created) => {
          created.forEach((remote, index) => replaceAnnotationId(remoteImageId, splitObjects[index].id, remote));
          setStatusMessage(`Объект ${id} разделён и сохранён в БД`);
        })
        .catch((err) => setStatusMessage(err instanceof Error ? `Не удалось сохранить разделение: ${err.message}` : 'Не удалось сохранить разделение'));
    }
  };

  const handleDeleteSelected = () => {
    if (!workspace.selectedObjectId) {
      setStatusMessage('Сначала выберите объект');
      return;
    }

    deleteObject(workspace.selectedObjectId);
  };

  const handleResetCurrentAnnotations = () => {
    const imageForRequest = currentImage;
    const annotationIds = imageForRequest?.annotations.map((item) => item.id).filter(isUuid) ?? [];

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

    if (selectedProjectId && imageForRequest && isUuid(imageForRequest.id) && annotationIds.length) {
      const remoteImageId = imageForRequest.id;
      Promise.all(annotationIds.map((id) => api.deleteAnnotation(selectedProjectId, remoteImageId, id)))
        .then(() => setStatusMessage('Аннотации текущего изображения удалены из БД'))
        .catch((err) => setStatusMessage(err instanceof Error ? `Не удалось очистить БД: ${err.message}` : 'Не удалось очистить БД'));
    }
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

  const updateClassOpacity = (name: string, opacity: number) => {
    updateWorkspace(
      (current) => ({
        ...current,
        maskOpacity: opacity,
        classList: current.classList.map((item) => (item.name === name ? { ...item, opacity } : item))
      }),
      { recordHistory: false, status: `Прозрачность класса ${name}: ${Math.round(opacity * 100)}%` }
    );
  };

  const updateObjectOpacity = (id: AnnotationObject['id'], opacity: number) => {
    updateWorkspace(
      (current) => ({
        ...current,
        images: current.images.map((image, index) =>
          index === current.currentImageIndex
            ? {
                ...image,
                annotations: image.annotations.map((item) => (item.id === id ? { ...item, opacity } : item))
              }
            : image
        )
      }),
      { recordHistory: false, status: `Прозрачность объекта ${id}: ${Math.round(opacity * 100)}%` }
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

  const toggleAnalysisClass = (name: string) => {
    setAnalysisClassNames((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    );
  };

  const handleRunModels = () => {
    const selectedClassNames = analysisClassNames.length ? analysisClassNames : [];
    const activeModelNames = availableModels
      .filter((model) => selectedModelIds.includes(model.id))
      .map((model) => model.name);
    const selectedModelId = selectedModelIds[0];
    const classTypeIds = availableClasses
      .filter((classType) => {
        const className = classType.name_eng || classType.name_ru;
        return selectedClassNames.includes(className);
      })
      .map((classType) => classType.id);

    if (!selectedModelIds.length) {
      setStatusMessage('Выберите хотя бы одну модель');
      return;
    }

    if (!selectedClassNames.length) {
      setStatusMessage('Выберите хотя бы один класс для анализа');
      return;
    }

    if (!selectedProjectId || !currentImage || !isUuid(currentImage.id)) {
      setStatusMessage('Выберите изображение проекта из backend');
      return;
    }

    const currentImageId = currentImage.id;

    setIsRunningModels(true);
    setStatusMessage(`Подключаем WebSocket анализа: ${activeModelNames.join(', ')}; классы: ${selectedClassNames.join(', ')}`);

    const handleAnalysisMessage = (message: AnalysisSocketMessage) => {
      if (message.type === 'task_created') {
        setStatusMessage(`Задача анализа создана: ${(message as { task_id: string }).task_id}`);
      }
      if (message.type === 'task_update') {
        const event = (message as { event?: string }).event;
        setStatusMessage(event === 'completed' ? 'Модель вернула результат, обновляем аннотации...' : `Статус анализа: ${event}`);
      }
    };

    api
      .startAnalysisViaWebSocket({
        imageId: currentImageId,
        modelConfigId: selectedModelId,
        classTypeIds,
        onMessage: handleAnalysisMessage
      })
      .then(() => api.getAnnotations(selectedProjectId, currentImageId))
      .then((annotations) => {
        const generated = annotations.map(annotationFromApi);

        updateWorkspace(
          (current) => ({
            ...current,
            images: current.images.map((image, index) =>
              index === current.currentImageIndex
                ? { ...image, annotations: mergeAnnotationObjects(generated, image.annotations) }
                : image
            ),
            selectedObjectId: generated[0]?.id ?? current.selectedObjectId
          }),
          { status: `Модели вернули авторазметку: ${generated.length}` }
        );
      })
      .catch((err) => {
        setStatusMessage(err instanceof Error ? `WebSocket не прошёл, пробуем REST: ${err.message}` : 'WebSocket не прошёл, пробуем REST');
        return api
          .runModels(selectedProjectId, currentImageId, selectedModelIds, selectedClassNames[0])
          .then((annotations) => {
            const generated = annotations.map(annotationFromApi);

            updateWorkspace(
              (current) => ({
                ...current,
                images: current.images.map((image, index) =>
                  index === current.currentImageIndex
                    ? { ...image, annotations: mergeAnnotationObjects(generated, image.annotations) }
                    : image
                ),
                selectedObjectId: generated[0]?.id ?? current.selectedObjectId
              }),
              { status: `REST fallback вернул авторазметку: ${generated.length}` }
            );
          })
          .catch((fallbackErr) =>
            setStatusMessage(
              fallbackErr instanceof Error ? `Не удалось запустить модели: ${fallbackErr.message}` : 'Не удалось запустить модели'
            )
          );
      })
      .finally(() => setIsRunningModels(false));
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

      <div className="mx-auto max-w-[1720px] px-4 pb-6 pt-4">
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="min-h-0 min-w-0">
            <WorkspaceCanvas
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
              opacityTargetMode={opacityTargetMode}
              opacityClassName={opacityClassName}
              onOpacityTargetModeChange={setOpacityTargetMode}
              onOpacityClassNameChange={setOpacityClassName}
              onClassOpacityChange={updateClassOpacity}
              onObjectOpacityChange={updateObjectOpacity}
              compareViewMode={workspace.compareViewMode}
              compareLeftSource={workspace.compareLeftSource}
              compareRightSource={workspace.compareRightSource}
              classList={workspace.classList}
              newClassName={newClassName}
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
              segmentationModels={segmentationModels}
              detectionModels={detectionModels}
              selectedSegmentationModels={workspace.selectedSegmentationModels}
              selectedDetectionModels={workspace.selectedDetectionModels}
              analysisClassNames={analysisClassNames}
              isRunningModels={isRunningModels}
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
              onDeleteObject={deleteObject}
              onSelectClass={(name) =>
                updateWorkspace((current) => ({ ...current, activeLabel: name }), {
                  recordHistory: false,
                  status: `Активный класс: ${name}`
                })
              }
              onToggleClassVisibility={toggleClassVisibility}
              onToggleAnalysisClass={toggleAnalysisClass}
              onToggleModel={toggleModel}
              onRunModels={handleRunModels}
              onNewClassNameChange={setNewClassName}
              onAddClass={addClass}
              onCreateObject={createObject}
              onUpdateObject={updateObject}
              onSplitObject={splitObject}
            />
          </section>

          <section className="min-h-0 lg:sticky lg:top-4">
            <div className="space-y-4">
            {/* <motion.div
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
                  <select
                    value={selectedProjectId}
                    onChange={(event) => setSelectedProjectId(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                  >
                    <option value="">Проект не выбран</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
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
                      {isLoadingRemoteImages
                        ? 'Получаем изображения из backend...'
                        : 'Изображения берутся из выбранного проекта. Переключайтесь между ними в toolbar.'}
                    </div>
                  </div>
                  <div className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-200">
                    {currentImage.name}
                  </div>
                </div>
                <select
                  value={workspace.currentImageIndex}
                  onChange={(event) => setCurrentImageIndex(Number(event.target.value))}
                  className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-brand-500"
                >
                  {workspace.images.map((image, index) => (
                    <option key={image.id} value={index}>
                      {index + 1}. {image.name}
                    </option>
                  ))}
                </select>
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
            </motion.div> */}

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-[24px] border border-slate-800 bg-slate-900/90 p-5"
            >
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
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
            </motion.div>
            </div>
          </section>
        </div>
      </div>
    </PageTransition>
  );
};

export default WorkspacePage;
