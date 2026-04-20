import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Box, CreditCard, Layers, UploadCloud, Database, Activity, UserCog } from 'lucide-react';

const menu = [
  { label: 'Рабочая область', path: '/workspace', icon: Activity },
  { label: 'Загрузка', path: '/upload', icon: UploadCloud },
  { label: 'Датасеты', path: '/projects', icon: Database },
  { label: 'Модели', path: '/models', icon: Layers },
  { label: 'Оплата', path: '/billing', icon: CreditCard },
  { label: 'Профиль', path: '/profile', icon: UserCog },
  { label: 'Админка', path: '/admin', icon: Box }
];

const Sidebar = () => {
  const location = useLocation();
  
  return (
    <aside className="hidden w-80 shrink-0 space-y-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 lg:block">
      <div className="mb-4 text-sm uppercase tracking-[0.25em] text-slate-500">Навигация</div>
      {menu.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;
        return (
          <Link key={item.path} to={item.path}>
            <motion.div
              className={`flex items-center gap-3 rounded-3xl px-4 py-3 text-slate-200 transition ${
                isActive ? 'bg-brand-500 text-white' : 'hover:bg-slate-800'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </motion.div>
          </Link>
        );
      })}
    </aside>
  );
};

export default Sidebar;
