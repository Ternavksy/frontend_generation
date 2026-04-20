import Sidebar from '../components/Sidebar';
import { motion } from 'framer-motion';
import PageTransition from '../components/PageTransition';

const ProfilePage = () => (
  <PageTransition>
    <div className="mx-auto grid max-w-[1400px] gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
      <Sidebar />
      <section className="space-y-6">
        <motion.div 
          className="rounded-[2rem] border border-slate-800 bg-slate-900/80 p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl font-semibold text-white">Личный кабинет</h1>
          <p className="text-slate-400">Профиль, история задач и лимиты подписки.</p>
        </motion.div>
        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <motion.div 
            className="rounded-[2rem] border border-slate-800 bg-slate-950/90 p-6"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h2 className="text-xl font-semibold text-white">Профиль пользователя</h2>
            <div className="mt-6 space-y-4 text-slate-300">
              <motion.div 
                className="grid grid-cols-2 gap-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-4"
                whileHover={{ scale: 1.02 }}
              >
                <span className="text-slate-400">ФИО</span><span>Артем Иванов</span>
                <span className="text-slate-400">Организация</span><span>ООО «AI-CV»</span>
                <span className="text-slate-400">Email</span><span>artem@example.com</span>
                <span className="text-slate-400">Подписка</span><span className="text-brand-400">Pro</span>
              </motion.div>
            </div>
          </motion.div>
          <motion.div 
            className="rounded-[2rem] border border-slate-800 bg-slate-950/90 p-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h2 className="text-xl font-semibold text-white">История задач</h2>
            <div className="mt-5 space-y-4">
              {['Генерация масок SAM2', 'Детекция YOLO-World', 'Сравнение результатов'].map((item, idx) => (
                <motion.div
                  key={item}
                  className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 text-slate-200"
                  whileHover={{ scale: 1.02, x: 5 }}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                >
                  {item}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  </PageTransition>
);

export default ProfilePage;
