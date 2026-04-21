import { motion } from 'framer-motion';
import PageTransition from '../components/PageTransition';

const uploadLimits = [
  { label: 'Макс. размер файла', value: '50 МБ' },
  { label: 'Поддерживаемые форматы', value: 'JPG, PNG' },
  { label: 'TIFF', value: 'только Pro' },
  { label: 'Остаток кадров', value: '120' }
];

const UploadPage = () => (
  <PageTransition>
    <div className="mx-auto max-w-[1400px]">
      <section className="space-y-6">
        <motion.div 
          className="rounded-[2rem] border border-slate-800 bg-slate-900/80 p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl font-semibold text-white">Загрузка датасета</h1>
          <p className="mt-2 text-slate-400">Перетащите изображения для загрузки, проверьте лимиты и формат.</p>
          <motion.div 
            className="mt-8 rounded-[2rem] border-2 border-dashed border-slate-700 bg-slate-950/90 p-10 text-center text-slate-400"
            whileHover={{ scale: 1.02, borderColor: '#eab308' }}
          >
            <div className="mb-4 text-xl font-semibold text-white">Перетащите файлы сюда</div>
            <p>Поддержка JPG, PNG. TIFF доступен при оформлении подписки.</p>
            <motion.button 
              className="mt-6 rounded-3xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Выбрать файлы
            </motion.button>
          </motion.div>
        </motion.div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {uploadLimits.map((item, idx) => (
            <motion.div
              key={item.label}
              className="rounded-3xl border border-slate-800 bg-slate-950/90 p-5"
              whileHover={{ scale: 1.05, y: -5 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <p className="text-sm text-slate-400">{item.label}</p>
              <p className="mt-3 text-xl font-semibold text-white">{item.value}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  </PageTransition>
);

export default UploadPage;
