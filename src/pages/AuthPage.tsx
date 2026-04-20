import { Link } from 'react-router-dom';
import { useState, FormEvent } from 'react';
import { motion } from 'framer-motion';
import PageTransition from '../components/PageTransition';

interface AuthPageProps {
  onLogin: () => void;
}

const AuthPage = ({ onLogin }: AuthPageProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Пожалуйста, заполните все поля.');
      return;
    }

    const mockEmail = 'user@example.com';
    const mockPassword = 'password123';

    if (email !== mockEmail || password !== mockPassword) {
      setError('Неверный email или пароль. Используйте user@example.com / password123');
      return;
    }

    onLogin();
  };

  return (
    <PageTransition>
      <div className="mx-auto flex min-h-[calc(100vh-96px)] max-w-4xl items-center justify-center px-4 py-10">
        <motion.div 
          className="w-full rounded-[2rem] border border-slate-800 bg-slate-900/95 p-10 shadow-xl shadow-slate-950/40"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div className="mb-8 text-center">
            <motion.div 
              className="mb-3 text-3xl font-semibold text-white"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              Вход в SegLabel AI
            </motion.div>
            <motion.p 
              className="text-slate-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Авторизуйтесь, чтобы начать загрузку, авто-разметку и редактирование.
            </motion.p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <motion.label
              className="block text-sm text-slate-300"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="mt-2 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-brand-500"
              />
            </motion.label>

            <motion.label
              className="block text-sm text-slate-300"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
            >
              Пароль
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Введите пароль"
                className="mt-2 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-brand-500"
              />
            </motion.label>

            {error && (
              <motion.div
                className="rounded-3xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                {error}
              </motion.div>
            )}

            <motion.button
              type="submit"
              className="w-full rounded-3xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Войти
            </motion.button>
          </form>

          <motion.div
            className="mt-8 flex justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            <Link to="#" className="text-brand-400 hover:text-brand-200 text-sm">Регистрация</Link>
          </motion.div>
        </motion.div>
      </div>
    </PageTransition>
  );
};

export default AuthPage;
