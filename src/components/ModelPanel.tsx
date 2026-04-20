const models = [
  { name: 'SAM2', type: 'segmentation', status: 'active' },
  { name: 'YOLO-World', type: 'detection', status: 'active' },
  { name: 'GroundingDino', type: 'detection', status: 'idle' }
];

const ModelPanel = () => (
  <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
    <div className="mb-5 flex items-center justify-between">
      <div>
        <h3 className="text-lg font-semibold text-white">Панель моделей</h3>
        <p className="text-sm text-slate-400">Запускайте авто-разметку и отслеживайте очередь.</p>
      </div>
      <button className="rounded-3xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700">
        Запустить авто-разметку
      </button>
    </div>
    <div className="space-y-3">
      {models.map((model) => (
        <div key={model.name} className="flex items-center justify-between rounded-3xl border border-slate-800 bg-slate-950 p-4">
          <div>
            <div className="text-sm text-slate-400">{model.type === 'segmentation' ? 'Сегментация' : 'Детекция'}</div>
            <div className="text-base font-semibold text-white">{model.name}</div>
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-semibold ${model.status === 'active' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
            {model.status}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default ModelPanel;
