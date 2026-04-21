import { ArrowUpRight, HardDrive, Server } from 'lucide-react';
import { motion } from 'framer-motion';
import PageTransition from '../components/PageTransition';

const modelList = [
  { name: 'SAM2', type: 'Сегментация', port: 8001, status: 'online' },
  { name: 'YOLO-World', type: 'Детекция', port: 8002, status: 'online' },
  { name: 'GroundingDino', type: 'Детекция', port: 8003, status: 'idle' }
];

const ModelsPage = () => (
  <PageTransition>
    <div className="mx-auto max-w-[1400px]">
      <section className="space-y-6">
        <motion.div 
          className="rounded-[2rem] border border-slate-800 bg-slate-900/80 p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-white">Управление моделями</h1>
              <p className="text-slate-400">Мониторинг статуса локальных сервисов и портов.</p>
            </div>
            <motion.button 
              className="inline-flex items-center gap-2 rounded-3xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <ArrowUpRight size={16} /> Проверить Health
            </motion.button>
          </div>
        </motion.div>
        <div className="grid gap-4 lg:grid-cols-2">
          {modelList.map((item, idx) => (
            <motion.div
              key={item.name}
              className="rounded-[2rem] border border-slate-800 bg-slate-950/90 p-6"
              whileHover={{ scale: 1.03, y: -5 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">{item.name}</h2>
                  <p className="text-sm text-slate-400">{item.type}</p>
                </div>
                <motion.span 
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    item.status === 'online' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'
                  }`}
                  animate={{ 
                    boxShadow: item.status === 'online' 
                      ? ['0 0 0 0 rgba(16, 185, 129, 0.4)', '0 0 0 10px rgba(16, 185, 129, 0)'] 
                      : 'none'
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  {item.status}
                </motion.span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <motion.div 
                  className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4"
                  whileHover={{ scale: 1.05 }}
                >
                  <div className="flex items-center gap-2 text-slate-400"><Server size={16} /><span>Порт</span></div>
                  <div className="mt-2 text-lg font-semibold text-white">{item.port}</div>
                </motion.div>
                <motion.div 
                  className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4"
                  whileHover={{ scale: 1.05 }}
                >
                  <div className="flex items-center gap-2 text-slate-400"><HardDrive size={16} /><span>Ресурсы</span></div>
                  <div className="mt-2 text-lg font-semibold text-white">GPU / CPU</div>
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  </PageTransition>
);

export default ModelsPage;
