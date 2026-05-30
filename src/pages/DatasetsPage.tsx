import { motion } from 'framer-motion';
import { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import { api, type Project } from '../lib/api';

const formatDate = (value?: string) => {
  if (!value) {
    return 'только что';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'только что';
  }

  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const DatasetsPage = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectName, setProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [deletingProjectId, setDeletingProjectId] = useState<Project['id'] | null>(null);
  const [projectPendingDelete, setProjectPendingDelete] = useState<Project | null>(null);
  const [error, setError] = useState('');

  const loadProjects = async () => {
    setIsLoading(true);
    setError('');
    try {
      setProjects(await api.listProjects());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить проекты.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!projectPendingDelete) {
      return;
    }

    setDeletingProjectId(projectPendingDelete.id);
    setError('');

    try {
      await api.deleteProject(projectPendingDelete.id);
      setProjects((current) => current.filter((item) => item.id !== projectPendingDelete.id));
      setProjectPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить проект.');
    } finally {
      setDeletingProjectId(null);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = projectName.trim();
    if (!name) {
      return;
    }

    try {
      const project = await api.createProject(name);
      setProjects((current) => [project, ...current]);
      setProjectName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать проект.');
    }
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-[1400px]">
        <section className="space-y-6">
          <motion.div
            className="rounded-[2rem] border border-slate-800 bg-slate-900/80 p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="text-3xl font-semibold text-white">Проекты</h1>
            <p className="text-slate-400">Создавайте проекты, управляйте списком и переходите к загрузке датасетов.</p>
            <form onSubmit={handleCreate} className="mt-6 flex flex-col gap-3 sm:flex-row">
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Название проекта"
                className="min-w-0 flex-1 rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-brand-500"
              />
              <button className="rounded-3xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-600">
                Создать
              </button>
            </form>
            {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
          </motion.div>

          <div className="grid gap-4">
            {isLoading && <div className="rounded-[2rem] border border-slate-800 bg-slate-950/90 p-6 text-slate-400">Загружаем проекты...</div>}
            {!isLoading && projects.length === 0 && (
              <div className="rounded-[2rem] border border-slate-800 bg-slate-950/90 p-6 text-slate-400">Проектов пока нет.</div>
            )}
            {projects.map((project, idx) => (
              <motion.div
                key={project.id}
                className="rounded-[2rem] border border-slate-800 bg-slate-950/90 p-6"
                whileHover={{ scale: 1.02, y: -5 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-white">{project.name}</h2>
                    <p className="text-sm text-slate-400">
                      Статус: <span className="text-brand-400">Готов к загрузке</span>
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:items-end">
                    <div className="text-sm text-slate-400">Создан {formatDate(project.created_at)}</div>
                    <button
                      type="button"
                      onClick={() => setProjectPendingDelete(project)}
                      disabled={deletingProjectId === project.id}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-400/50 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 size={15} />
                      {deletingProjectId === project.id ? 'Удаляем...' : 'Удалить'}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </div>

      {projectPendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
            className="w-full max-w-md rounded-[24px] border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-rose-500/12 p-3 text-rose-200">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h2 id="delete-project-title" className="text-lg font-semibold text-white">
                    Удалить проект?
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">Это действие нельзя отменить.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProjectPendingDelete(null)}
                className="rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-400 transition hover:text-white"
                aria-label="Закрыть"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200">
              {projectPendingDelete.name}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setProjectPendingDelete(null)}
                disabled={deletingProjectId === projectPendingDelete.id}
                className="rounded-2xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deletingProjectId === projectPendingDelete.id}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-rose-500/50"
              >
                <Trash2 size={15} />
                {deletingProjectId === projectPendingDelete.id ? 'Удаляем...' : 'Удалить'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </PageTransition>
  );
};

export default DatasetsPage;
