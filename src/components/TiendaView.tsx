import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Coins, Palette, RotateCcw, Settings2, ShoppingBag } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { AuthUser, PointRule, RewardCatalogItem, StoreSnapshot } from '../types';

interface TiendaViewProps {
  user: AuthUser;
  onUserCustomizationUpdate: (patch: {
    puntos_saldo?: number;
    fondo_activo?: string | null;
    estilo_activo?: string | null;
  }) => void;
}

function renderPreviewSwatch(item: RewardCatalogItem) {
  if (item.codigo === 'fondo_papel_cuadricula') {
    return (
      <div
        className="h-24 rounded-lg border border-slate-200"
        style={{
          backgroundColor: '#f8fafc',
          backgroundImage:
            'linear-gradient(to right, rgba(30,64,175,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(30,64,175,0.12) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      />
    );
  }
  if (item.codigo === 'fondo_brisa_botanica') {
    return (
      <div
        className="h-24 rounded-lg border border-emerald-200"
        style={{
          background: 'radial-gradient(circle at 25% 30%, #d1fae5 0%, #f0fdf4 65%)',
        }}
      />
    );
  }
  if (item.codigo === 'fondo_cielo_aurora') {
    return (
      <div
        className="h-24 rounded-lg border border-indigo-200"
        style={{
          background: 'linear-gradient(135deg, #dbeafe 0%, #e0e7ff 55%, #f8fafc 100%)',
        }}
      />
    );
  }
  return (
    <div className="h-24 rounded-lg border border-slate-200 bg-[#f7f9fb] p-3 flex flex-col justify-between">
      <div className="h-3 w-full rounded" style={{ backgroundColor: item.preview_color }} />
      <div className="flex items-center gap-2">
        <div className="h-6 flex-1 rounded bg-white border border-slate-200" />
        <div className="h-6 w-16 rounded" style={{ backgroundColor: item.preview_color }} />
      </div>
    </div>
  );
}

export const TiendaView: React.FC<TiendaViewProps> = ({ user, onUserCustomizationUpdate }) => {
  const [snapshot, setSnapshot] = useState<StoreSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | string | null>(null);
  const [filter, setFilter] = useState<'todas' | 'fondo' | 'estilo'>('todas');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, { base: string; bonus: string }>>({});

  const loadStore = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/tienda');
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', text: data.error || 'No se pudo cargar la tienda.' });
        return;
      }
      const snap = data as StoreSnapshot;
      setSnapshot(snap);
      onUserCustomizationUpdate({
        puntos_saldo: snap.saldo,
        fondo_activo: snap.fondo_activo,
        estilo_activo: snap.estilo_activo,
      });
      const drafts: Record<string, { base: string; bonus: string }> = {};
      for (const r of snap.reglas) {
        drafts[r.clave] = {
          base: String(r.puntos_base),
          bonus: String(r.puntos_adicionales),
        };
      }
      setRuleDrafts(drafts);
    } catch {
      setFeedback({ type: 'error', text: 'Error de conexión al cargar la tienda de recompensas.' });
    } finally {
      setLoading(false);
    }
  }, [onUserCustomizationUpdate]);

  useEffect(() => {
    void loadStore();
  }, [loadStore]);

  async function handleRedeem(item: RewardCatalogItem) {
    setFeedback(null);
    setBusyId(item.id_recompensa);
    try {
      const res = await apiFetch('/api/tienda/canjear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_recompensa: item.id_recompensa }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', text: data.error || 'No se pudo completar el canje.' });
        await loadStore();
        return;
      }
      setFeedback({ type: 'success', text: data.message });
      onUserCustomizationUpdate({
        puntos_saldo: data.saldo_actual,
        fondo_activo: data.fondo_activo,
        estilo_activo: data.estilo_activo,
      });
      await loadStore();
    } catch {
      setFeedback({ type: 'error', text: 'Error de red al procesar el canje.' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleEquip(categoria: 'fondo' | 'estilo', codigo: string | null) {
    setFeedback(null);
    setBusyId(`${categoria}:${codigo ?? 'default'}`);
    try {
      const res = await apiFetch('/api/tienda/equipar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria, codigo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', text: data.error || 'No se pudo aplicar la personalización.' });
        return;
      }
      onUserCustomizationUpdate({
        fondo_activo: data.fondo_activo,
        estilo_activo: data.estilo_activo,
      });
      setFeedback({
        type: 'success',
        text:
          codigo === null
            ? `Se restauró el ${categoria === 'fondo' ? 'fondo' : 'estilo visual'} predeterminado.`
            : `Personalización aplicada y guardada en tu cuenta.`,
      });
      await loadStore();
    } catch {
      setFeedback({ type: 'error', text: 'Error de red al aplicar la recompensa.' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveRule(rule: PointRule) {
    const draft = ruleDrafts[rule.clave];
    if (!draft) return;
    setFeedback(null);
    setBusyId(`rule:${rule.clave}`);
    try {
      const res = await apiFetch(`/api/tienda/reglas/${rule.clave}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          puntos_base: Number(draft.base),
          puntos_adicionales: Number(draft.bonus),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', text: data.error || 'No se pudo actualizar la regla.' });
        return;
      }
      setFeedback({ type: 'success', text: 'Regla de puntos actualizada correctamente.' });
      await loadStore();
    } catch {
      setFeedback({ type: 'error', text: 'Error de red al actualizar la regla.' });
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !snapshot) {
    return <div className="py-16 text-center text-sm text-[#444653]">Cargando tienda de recompensas...</div>;
  }

  if (!snapshot) {
    return (
      <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
        <p className="font-display text-xl font-bold text-[#ba1a1a]">No se pudo abrir la tienda</p>
        <p className="text-sm text-[#444653]">{feedback?.text || 'Intenta recargar la página.'}</p>
      </div>
    );
  }

  const visibleRewards = snapshot.recompensas.filter((r) => filter === 'todas' || r.categoria === filter);

  return (
    <div className="space-y-8">
      {/* Encabezado y resumen de saldo */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <p className="text-xs font-semibold text-[#4f46e5]">
            {user.nombre} {user.apellido} · Personalización de cuenta
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-[#191c1e]">Tienda de Recompensas</h1>
          <p className="mt-1 text-sm text-[#444653] max-w-2xl">
            Gana puntos al completar evaluaciones y finalizar videos educativos por primera vez, y canjéalos por fondos o estilos visuales permanentes para tu interfaz.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 card-elevation flex items-center gap-4 shrink-0">
          <div className="w-11 h-11 rounded-xl bg-[#eef2ff] text-[#4f46e5] flex items-center justify-center">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#444653]">Saldo disponible</p>
            <p className="font-display text-3xl font-bold text-[#1e40af] tabular-nums">
              {snapshot.saldo} <span className="text-sm font-semibold text-[#444653]">pts</span>
            </p>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            feedback.type === 'success'
              ? 'border-[#10b981] bg-[#ecfdf5] text-[#047857]'
              : 'border-[#ba1a1a]/30 bg-[#ffdad6] text-[#93000a]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Reglas de obtención de puntos */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {snapshot.reglas.map((rule) => {
          const total = rule.puntos_base + rule.puntos_adicionales;
          const isEval = rule.clave === 'evaluacion_completada';
          const draft = ruleDrafts[rule.clave];

          return (
            <div
              key={rule.clave}
              className="bg-white border border-slate-200 rounded-2xl p-5 card-elevation flex flex-col justify-between gap-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-[#444653]">
                    {isEval ? 'Fuente: Evaluaciones ABC' : 'Fuente: Videos informativos'}
                  </p>
                  <h2 className="mt-0.5 font-display text-lg font-bold text-[#191c1e]">
                    {isEval ? 'Completar evaluación' : 'Terminar video educativo'}
                  </h2>
                  <p className="mt-1 text-xs text-[#444653]">{rule.descripcion}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-display text-2xl font-bold text-[#10b981] tabular-nums">+{total} pts</p>
                  <p className="text-xs text-[#444653] tabular-nums">
                    {rule.puntos_base} base + {rule.puntos_adicionales} extra
                  </p>
                </div>
              </div>

              {user.nombre_rol === 'Administrador' && draft && (
                <div className="pt-3 border-t border-slate-200 flex flex-wrap items-end gap-3">
                  <div>
                    <label
                      htmlFor={`base-${rule.clave}`}
                      className="block text-[11px] font-semibold text-[#444653] mb-1"
                    >
                      Puntos base
                    </label>
                    <input
                      id={`base-${rule.clave}`}
                      type="number"
                      min={0}
                      value={draft.base}
                      onChange={(e) =>
                        setRuleDrafts((prev) => ({
                          ...prev,
                          [rule.clave]: { ...prev[rule.clave], base: e.target.value },
                        }))
                      }
                      className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono-num"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`bonus-${rule.clave}`}
                      className="block text-[11px] font-semibold text-[#444653] mb-1"
                    >
                      Puntos adicionales
                    </label>
                    <input
                      id={`bonus-${rule.clave}`}
                      type="number"
                      min={0}
                      value={draft.bonus}
                      onChange={(e) =>
                        setRuleDrafts((prev) => ({
                          ...prev,
                          [rule.clave]: { ...prev[rule.clave], bonus: e.target.value },
                        }))
                      }
                      className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono-num"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busyId === `rule:${rule.clave}`}
                    onClick={() => void handleSaveRule(rule)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e40af] hover:bg-[#1e3a8a] text-white text-xs font-semibold whitespace-nowrap transition disabled:opacity-50"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    <span>Guardar valores</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Catálogo de recompensas */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-[#1e40af]" />
            <h2 className="font-display text-2xl font-bold text-[#191c1e]">Catálogo de Recompensas</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 p-1 bg-[#f2f4f6] rounded-lg">
              {(
                [
                  { key: 'todas', label: 'Todas' },
                  { key: 'fondo', label: 'Fondos' },
                  { key: 'estilo', label: 'Estilos visuales' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition ${
                    filter === tab.key ? 'bg-white text-[#1e40af] shadow-sm' : 'text-[#444653] hover:text-[#191c1e]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {(snapshot.fondo_activo || snapshot.estilo_activo) && (
              <button
                type="button"
                onClick={async () => {
                  if (snapshot.fondo_activo) await handleEquip('fondo', null);
                  if (snapshot.estilo_activo) await handleEquip('estilo', null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-[#444653] whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar predeterminado</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleRewards.map((item) => {
            const canAfford = snapshot.saldo >= item.costo_puntos;
            const isBusy =
              busyId === item.id_recompensa || busyId === `${item.categoria}:${item.codigo}`;

            return (
              <article
                key={item.id_recompensa}
                className={`bg-white border rounded-2xl p-5 card-elevation flex flex-col justify-between gap-4 ${
                  item.equipada ? 'border-[#10b981] ring-2 ring-[#10b981]/20' : 'border-slate-200'
                }`}
              >
                <div className="space-y-3">
                  {renderPreviewSwatch(item)}

                  <div className="flex items-center justify-between gap-2 text-xs text-[#444653]">
                    <span>{item.categoria === 'fondo' ? 'Fondo personalizado' : 'Estilo visual'}</span>
                    <span className="font-mono-num font-bold text-[#1e40af]">{item.costo_puntos} pts</span>
                  </div>

                  <div>
                    <h3 className="font-display text-lg font-bold text-[#191c1e]">{item.nombre}</h3>
                    <p className="mt-1 text-sm text-[#444653] leading-relaxed">{item.descripcion}</p>
                  </div>
                </div>

                <div className="pt-2">
                  {item.equipada ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#047857]">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Aplicado en tu perfil</span>
                      </span>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleEquip(item.categoria, null)}
                        className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-[#444653] hover:bg-slate-50 whitespace-nowrap"
                      >
                        Quitar
                      </button>
                    </div>
                  ) : item.adquirida ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleEquip(item.categoria, item.codigo)}
                      className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#10b981] hover:bg-[#059669] text-white text-xs font-semibold px-4 py-2 transition disabled:opacity-50"
                    >
                      <span>Aplicar recompensa</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy || !canAfford}
                      onClick={() => void handleRedeem(item)}
                      className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs font-semibold px-4 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      <span>
                        {canAfford
                          ? `Canjear por ${item.costo_puntos} pts`
                          : `Faltan ${item.costo_puntos - snapshot.saldo} pts`}
                      </span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Historial de movimientos de puntos */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#191c1e]">Historial de Movimientos de Puntos</h2>
            <p className="text-xs text-[#444653]">Registro auditable de puntos ganados y canjes realizados.</p>
          </div>
          <span className="text-xs font-semibold text-[#444653] tabular-nums">
            {snapshot.historial.length} {snapshot.historial.length === 1 ? 'movimiento' : 'movimientos'}
          </span>
        </div>

        {snapshot.historial.length === 0 ? (
          <p className="p-6 text-sm text-[#444653]">
            Todavía no tienes movimientos de puntos. Completa una evaluación o termina de ver un video educativo para ganar tus primeros puntos.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f2f4f6] text-xs text-[#444653] border-b border-slate-200">
                <tr>
                  <th scope="col" className="px-6 py-3 font-semibold">
                    Fecha
                  </th>
                  <th scope="col" className="px-6 py-3 font-semibold">
                    Tipo
                  </th>
                  <th scope="col" className="px-6 py-3 font-semibold">
                    Descripción
                  </th>
                  <th scope="col" className="px-6 py-3 font-semibold text-right">
                    Puntos
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {snapshot.historial.map((mov) => {
                  const isGain = mov.tipo === 'ganado';
                  return (
                    <tr key={mov.id_movimiento} className="hover:bg-slate-50/70">
                      <td className="px-6 py-3.5 font-mono-num text-xs text-[#444653] whitespace-nowrap">
                        {mov.fecha_movimiento}
                      </td>
                      <td className="px-6 py-3.5 text-xs font-semibold whitespace-nowrap">
                        <span className={isGain ? 'text-[#047857]' : 'text-[#ba1a1a]'}>
                          {isGain ? 'Ganado' : 'Canjeado'}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-[#191c1e]">{mov.descripcion}</td>
                      <td
                        className={`px-6 py-3.5 text-right font-mono-num font-bold tabular-nums whitespace-nowrap ${
                          isGain ? 'text-[#047857]' : 'text-[#ba1a1a]'
                        }`}
                      >
                        {mov.total_puntos > 0 ? `+${mov.total_puntos}` : mov.total_puntos} pts
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
