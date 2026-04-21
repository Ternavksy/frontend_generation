import Sidebar from '../components/Sidebar';
import WorkspaceCanvas from '../components/WorkspaceCanvas';
import ModelPanel from '../components/ModelPanel';
import { motion } from 'framer-motion';
import PageTransition from '../components/PageTransition';

const tools = [
  { name: 'Ластик', description: 'Стирание маски' },
  { name: 'Кисть', description: 'Дорисовка сегментов' },
  { name: 'Разделение сегментов', description: 'Разрезание склеенных объектов' },
  { name: 'Bounding Box', description: 'Работа с детекцией' }
];

const WorkspacePage = () => (
  <PageTransition>
    <div className="mx-auto grid max-w-[1400px] gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
      <div className="xl:sticky xl:top-20 xl:self-start">
        <Sidebar />
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
          <WorkspaceCanvas />
          <div className="grid gap-4 sm:grid-cols-2">
            {tools.map((tool, idx) => (
              <motion.div
                key={tool.name}
                className="rounded-3xl border border-slate-800 bg-slate-950/90 p-5"
                whileHover={{ scale: 1.05, y: -5 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <div className="text-sm text-slate-400">{tool.name}</div>
                <div className="mt-2 text-lg font-semibold text-white">{tool.description}</div>
              </motion.div>
            ))}
          </div>
        </div>
        <div className="min-w-0 space-y-6">
          <ModelPanel />
          <motion.div 
            className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h3 className="text-lg font-semibold text-white">Слои и классы</h3>
            <div className="mt-4 space-y-3">
              {['Автомобиль', 'Пешеход', 'Дорога', 'Здание'].map((className, idx) => (
                <motion.label
                  key={className}
                  className="flex items-center justify-between rounded-3xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-slate-200"
                  whileHover={{ scale: 1.02, x: 5 }}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <span>{className}</span>
                  <input type="checkbox" defaultChecked className="h-4 w-4 accent-brand-500" />
                </motion.label>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  </div>
  </PageTransition>
);

export default WorkspacePage;
