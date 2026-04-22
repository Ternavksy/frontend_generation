import Sidebar from '../components/Sidebar';
import WorkspaceCanvas from '../components/WorkspaceCanvas';
import ModelPanel from '../components/ModelPanel';
import { motion } from 'framer-motion';
import PageTransition from '../components/PageTransition';
import { useState } from 'react';
import { Plus } from 'lucide-react';

const objects = [
  { id: 1, class: 'Автомобиль', coords: { x: 100, y: 150, width: 200, height: 100 } },
  { id: 2, class: 'Пешеход', coords: { x: 300, y: 200, width: 50, height: 100 } },
  { id: 3, class: 'Дорога', coords: { x: 0, y: 300, width: 1200, height: 200 } }
];

interface ClassItem {
  name: string;
  visible: boolean;
  opacity: number;
}

interface ObjectData {
  id: number;
  class: string;
  coords: { x: number; y: number; width: number; height: number };
}

const classes: ClassItem[] = [
  { name: 'Автомобиль', visible: true, opacity: 70 },
  { name: 'Пешеход', visible: true, opacity: 70 },
  { name: 'Дорога', visible: false, opacity: 70 },
  { name: 'Здание', visible: true, opacity: 70 },
  { name: 'Сегментированная область', visible: true, opacity: 70 }
];

const WorkspacePage = () => {
  const [selectedObject, setSelectedObject] = useState<number | null>(null);
  const [baseObjects, setBaseObjects] = useState<ObjectData[]>(objects);
  const [classList, setClassList] = useState<ClassItem[]>(classes);
  const [newClass, setNewClass] = useState('');
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [selectedSegmentationModel, setSelectedSegmentationModel] = useState<string | null>(null);
  const [selectedDetectionModel, setSelectedDetectionModel] = useState<string | null>(null);
  const [segmentedObjects, setSegmentedObjects] = useState<ObjectData[]>([]);

  const addClass = () => {
    if (newClass.trim()) {
      setClassList([...classList, { name: newClass.trim(), visible: true, opacity: 70 }]);
      setNewClass('');
    }
  };

  const updateObjectCoords = (id: number, coords: ObjectData['coords']) => {
    const update = (obj: ObjectData) => obj.id === id ? { ...obj, coords } : obj;
    setBaseObjects((items) => items.map(update));
    setSegmentedObjects((items) => items.map(update));
  };

  const deleteObject = (id: number) => {
    setBaseObjects((items) => items.filter((obj) => obj.id !== id));
    setSegmentedObjects((items) => items.filter((obj) => obj.id !== id));
    setSelectedObject((current) => current === id ? null : current);
  };

  const allObjects = [...baseObjects, ...segmentedObjects];

  const classOpacity = classList.reduce((acc, cls) => {
    acc[cls.name] = cls.opacity / 100;
    return acc;
  }, {} as Record<string, number>);

  const classVisibility = classList.reduce((acc, cls) => {
    acc[cls.name] = cls.visible;
    return acc;
  }, {} as Record<string, boolean>);

  const runSegmentation = async () => {
    if (!selectedSegmentationModel) return;
    
    try {
      const response = await fetch('/api/segmentation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedSegmentationModel })
      });
      const data = await response.json();
      // Предполагаем, что data содержит массив объектов с coords
      const newObjects = data.map((item: any, index: number) => ({
        id: objects.length + segmentedObjects.length + index + 1,
        class: 'Сегментированная область',
        coords: item.coords
      }));
      setSegmentedObjects(prev => [...prev, ...newObjects]);
    } catch (error) {
      console.error('Failed to run segmentation:', error);
    }
  };

  return (
    <PageTransition>
      <div className="mx-auto grid max-w-[1400px] gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="xl:sticky xl:top-20 xl:self-start">
          <Sidebar selectedTool={selectedTool} onToolSelect={setSelectedTool} />
        </div>
        <section className="min-w-0 space-y-6">
        <motion.div 
          className="rounded-[2rem] border border-slate-800 bg-slate-900/80 p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl font-semibold text-white">Рабочая область аннотатора</h1>
          <p className="mt-2 text-slate-400">CVAT-подобный интерфейс для редактирования масок, управления классами и сравнения результатов.</p>
        </motion.div>
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.65fr)]">
          <div className="min-w-0 space-y-6">
            <ModelPanel 
              selectedSegmentationModel={selectedSegmentationModel}
              selectedDetectionModel={selectedDetectionModel}
              onSegmentationModelSelect={setSelectedSegmentationModel}
              onDetectionModelSelect={setSelectedDetectionModel}
              onRunSegmentation={runSegmentation}
            />
            <WorkspaceCanvas 
              selectedObject={selectedObject} 
              objects={allObjects} 
              classVisibility={classVisibility} 
              classOpacity={classOpacity}
              selectedTool={selectedTool}
              onObjectSelect={setSelectedObject}
              onObjectChange={updateObjectCoords}
              onObjectDelete={deleteObject}
            />
          </div>
          <div className="min-w-0 space-y-6">
            <motion.div 
              className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <h3 className="text-lg font-semibold text-white">Объекты</h3>
              <div className="mt-4 space-y-3 max-h-60 overflow-y-auto">
                {allObjects.map((obj) => (
                  <motion.div
                    key={obj.id}
                    className={`rounded-3xl border px-4 py-3 transition ${
                      selectedObject === obj.id ? 'border-brand-500 bg-brand-500/10' : 'border-slate-800 bg-slate-950/90'
                    } ${classVisibility[obj.class] ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                    onClick={() => {
                      if (classVisibility[obj.class]) {
                        setSelectedObject(obj.id);
                      }
                    }}
                    whileHover={{ scale: 1.02 }}
                  >
                    <div className="text-sm text-slate-400">{obj.class}</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {(['x', 'y', 'width', 'height'] as const).map((key) => (
                        <label key={key} className="text-xs text-slate-500">
                          {key}
                          <input
                            type="number"
                            value={obj.coords[key]}
                            disabled={!classVisibility[obj.class]}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => updateObjectCoords(obj.id, {
                              ...obj.coords,
                              [key]: Number(event.target.value)
                            })}
                            className="mt-1 w-full rounded-2xl border border-slate-800 bg-slate-950 px-2 py-1 text-slate-200 disabled:opacity-50"
                          />
                        </label>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
            <motion.div 
              className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <h3 className="text-lg font-semibold text-white">Классы</h3>
              <div className="mt-4 space-y-3">
                {classList.map((cls, idx) => (
                  <motion.div
                    key={cls.name}
                    className="rounded-3xl border border-slate-800 bg-slate-950/90 px-4 py-3"
                    whileHover={{ scale: 1.02, x: 5 }}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span>{cls.name}</span>
                      <input 
                        type="checkbox" 
                        checked={cls.visible} 
                        onChange={(e) => {
                          const newList = [...classList];
                          newList[idx].visible = e.target.checked;
                          setClassList(newList);
                        }}
                        className="h-4 w-4 accent-brand-500" 
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Прозрачность</span>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={cls.opacity} 
                        onChange={(e) => {
                          const newList = [...classList];
                          newList[idx].opacity = parseInt(e.target.value);
                          setClassList(newList);
                        }}
                        className="flex-1 h-2 accent-brand-500" 
                      />
                      <span className="text-xs text-slate-400 w-8">{cls.opacity}%</span>
                    </div>
                  </motion.div>
                ))}
                <div className="flex items-center gap-2 mt-4">
                  <input
                    type="text"
                    value={newClass}
                    onChange={(e) => setNewClass(e.target.value)}
                    placeholder="Новый класс"
                    className="flex-1 rounded-3xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200"
                  />
                  <button
                    onClick={addClass}
                    className="rounded-3xl bg-brand-500 p-2 text-white hover:bg-brand-700"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  </PageTransition>
  );
};

export default WorkspacePage;
