import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CreditCard, Database, LogOut, Menu, Settings, User, Workflow, X } from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { label: 'Проекты', path: '/projects' },
  { label: 'Датасеты', path: '/upload' },
  { label: 'Модели', path: '/models' },
  { label: 'Профиль', path: '/profile' },
  { label: 'Оплата', path: '/billing' }
];

const mobileItems = [
  { label: 'Дашборд', path: '/dashboard', icon: Workflow },
  { label: 'Датасеты', path: '/projects', icon: Database },
  { label: 'Оплата', path: '/billing', icon: CreditCard },
  { label: 'Загрузка', path: '/upload', icon: Database },
  { label: 'Модели', path: '/models', icon: Workflow },
  { label: 'Профиль', path: '/profile', icon: User }
];

const TopNav = () => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-4 xl:px-12">
        <div className="flex items-center gap-3">
          <button
            className="inline-flex items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/80 p-2 text-slate-200 transition hover:bg-slate-800 md:hidden"
            onClick={() => setIsMobileMenuOpen((value) => !value)}
            aria-label="Toggle mobile navigation"
          >
            {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <Link to="/dashboard">
            <motion.div
              className="rounded-2xl bg-brand-500/15 px-3 py-2 text-brand-100 ring-1 ring-brand-500/20"
              whileHover={{ scale: 1.05 }}
            >
              SegLabel AI
            </motion.div>
          </Link>
          <nav className="hidden items-center gap-2 md:flex">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link key={item.path} to={item.path}>
                  <motion.div
                    className={`rounded-2xl px-3 py-2 text-sm transition ${
                      isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {item.label}
                  </motion.div>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {[Bell, Settings].map((Icon, idx) => (
            <motion.button
              key={idx}
              className="rounded-2xl border border-slate-800 bg-slate-900/80 p-2 text-slate-300 transition hover:bg-slate-800"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <Icon size={18} />
            </motion.button>
          ))}
          <motion.button
            className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-slate-200 transition hover:bg-slate-800"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <User size={18} />
            <span>Артем</span>
          </motion.button>
          <motion.button
            className="rounded-2xl border border-slate-800 bg-slate-900/80 p-2 text-slate-300 transition hover:bg-slate-800"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <LogOut size={18} />
          </motion.button>
        </div>
      </div>
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            className="border-t border-slate-800 bg-slate-950/98 px-4 pb-4 md:hidden"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="mt-4 grid gap-3">
              {mobileItems.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link key={item.path} to={item.path} onClick={() => setIsMobileMenuOpen(false)}>
                    <div
                      className={`flex items-center gap-3 rounded-3xl border px-4 py-3 text-sm transition ${
                        isActive
                          ? 'border-brand-500/30 bg-brand-500/10 text-white'
                          : 'border-slate-800 bg-slate-900/80 text-slate-300'
                      }`}
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default TopNav;
