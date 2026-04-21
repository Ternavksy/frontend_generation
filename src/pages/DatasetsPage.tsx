import { motion } from 'framer-motion';
import PageTransition from '../components/PageTransition';

const datasets = [
  { name: 'Проект «Безопасность»', status: 'Готов', images: 248, updated: '2 часа назад' },
  { name: 'Набор для YOLO', status: 'Обработка', images: 120, updated: '10 минут назад' },
  { name: 'Тестовый датасет', status: 'Загрузка', images: 36, updated: '1 день назад' }
];

const DatasetsPage = () => (
  <PageTransition>
    <div className="mx-auto max-w-[1400px]">
      <section className="space-y-6">
        <motion.div 
          className="rounded-[2rem] border border-slate-800 bg-slate-900/80 p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl font-semibold text-white">Датасеты</h1>
          <p className="text-slate-400">Управляйте проектами, статусами загрузок и результатами.</p>
        </motion.div>
        <div className="grid gap-4">
          {datasets.map((dataset, idx) => (
            <motion.div
              key={dataset.name}
              className="rounded-[2rem] border border-slate-800 bg-slate-950/90 p-6"
              whileHover={{ scale: 1.02, y: -5 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
                <div>
                  <h2 className="text-xl font-semibold text-white">{dataset.name}</h2>
                  <p className="text-sm text-slate-400">Статус: <span className="text-brand-400">{dataset.status}</span></p>
                </div>
                <div className="flex gap-4 text-sm text-slate-400">
                  <span>{dataset.images} изображений</span>
                  <span>Обновлено {dataset.updated}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  </PageTransition>
);

export default DatasetsPage;
