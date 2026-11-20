import React from 'react';
import { Award, Medal, Trophy } from 'lucide-react';
import type { LeaderboardEntry } from '../types';

interface LeaderboardSectionProps {
  entries: LeaderboardEntry[];
  loading?: boolean;
}

function getPodiumStyles(posicion: number) {
  if (posicion === 1) {
    return {
      card: 'border-amber-300 bg-amber-50/80',
      rankLabel: '1.º lugar',
      rankText: 'text-amber-800',
      iconBg: 'bg-amber-100 text-amber-700',
      row: 'bg-amber-50/40',
      badge: 'bg-amber-100 text-amber-800 border-amber-300',
    };
  }
  if (posicion === 2) {
    return {
      card: 'border-slate-300 bg-slate-50/90',
      rankLabel: '2.º lugar',
      rankText: 'text-slate-700',
      iconBg: 'bg-slate-200 text-slate-700',
      row: 'bg-slate-50/50',
      badge: 'bg-slate-100 text-slate-700 border-slate-300',
    };
  }
  return {
    card: 'border-orange-300 bg-orange-50/70',
    rankLabel: '3.º lugar',
    rankText: 'text-orange-800',
    iconBg: 'bg-orange-100 text-orange-700',
    row: 'bg-orange-50/35',
    badge: 'bg-orange-100 text-orange-800 border-orange-300',
  };
}

function PodiumIcon({ posicion }: { posicion: number }) {
  if (posicion === 1) return <Trophy className="w-5 h-5" />;
  if (posicion === 2) return <Medal className="w-5 h-5" />;
  return <Award className="w-5 h-5" />;
}

export const LeaderboardSection: React.FC<LeaderboardSectionProps> = ({ entries, loading = false }) => {
  const podiumEntries = entries.filter((entry) => entry.posicion <= 3).slice(0, 3);

  return (
    <section
      aria-labelledby="leaderboard-heading"
      className="bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation"
    >
      <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 id="leaderboard-heading" className="font-display text-xl font-bold text-[#191c1e]">
            Tabla de Posiciones
          </h2>
          <p className="text-xs text-[#444653] mt-0.5">
            Compara tu puntaje con el de otros usuarios ordenados del mejor resultado al menor.
          </p>
        </div>
        <span className="text-xs font-semibold text-[#444653] tabular-nums">
          {entries.length} {entries.length === 1 ? 'registro' : 'registros'}
        </span>
      </div>

      {loading ? (
        <p className="p-6 text-sm text-[#444653]">Cargando tabla de posiciones...</p>
      ) : entries.length === 0 ? (
        <p className="p-6 text-sm text-[#444653]">
          Aún no hay resultados registrados en esta evaluación. Completa el cuestionario para inaugurar el podio.
        </p>
      ) : (
        <div className="p-6 space-y-6">
          {/* Podio destacado para los tres primeros lugares */}
          {podiumEntries.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#444653]">
                Podio de mejores puntajes
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {podiumEntries.map((entry) => {
                  const style = getPodiumStyles(entry.posicion);
                  return (
                    <article
                      key={entry.id_puntaje}
                      className={`rounded-xl border-2 p-4 flex flex-col justify-between gap-3 ${style.card} ${
                        entry.es_usuario_actual ? 'ring-2 ring-[#4f46e5]/30' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${style.rankText}`}>
                          <span className={`w-7 h-7 rounded-lg inline-flex items-center justify-center ${style.iconBg}`}>
                            <PodiumIcon posicion={entry.posicion} />
                          </span>
                          <span>{style.rankLabel}</span>
                        </span>
                        {entry.es_usuario_actual && (
                          <span className="text-[11px] font-bold text-[#4f46e5] bg-white border border-[#4f46e5]/30 rounded px-2 py-0.5">
                            Tú
                          </span>
                        )}
                      </div>

                      <div>
                        <p className="font-display text-base font-bold text-[#191c1e] truncate">
                          {entry.nombre_usuario}
                        </p>
                        <p className="text-xs text-[#444653] font-mono-num mt-0.5">{entry.fecha_realizacion}</p>
                      </div>

                      <div className="pt-2 border-t border-black/10 flex items-baseline justify-between">
                        <span className="text-xs font-medium text-[#444653]">Puntaje</span>
                        <span className="font-display text-2xl font-bold text-[#1e40af] tabular-nums">
                          {entry.calificacion.toFixed(2)}
                          <span className="text-xs font-semibold text-[#444653]"> / 5.00</span>
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tabla comparativa completa */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f2f4f6] text-xs text-[#444653] border-b border-slate-200">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold w-24">
                    Posición
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Usuario
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Fecha de realización
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-right">
                    Puntaje
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => {
                  const isPodium = entry.posicion <= 3;
                  const podiumStyle = isPodium ? getPodiumStyles(entry.posicion) : null;

                  return (
                    <tr
                      key={entry.id_puntaje}
                      className={
                        entry.es_usuario_actual
                          ? 'bg-[#eef2ff]/70'
                          : podiumStyle
                            ? podiumStyle.row
                            : 'hover:bg-slate-50/70'
                      }
                    >
                      <td className="px-4 py-3 font-mono-num">
                        {podiumStyle ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-bold ${podiumStyle.badge}`}
                          >
                            #{entry.posicion}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-[#444653] px-2">#{entry.posicion}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-[#191c1e]">
                        <span>{entry.nombre_usuario}</span>
                        {entry.es_usuario_actual && (
                          <span className="ml-2 text-xs font-semibold text-[#4f46e5]">(Tú)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono-num text-xs text-[#444653]">
                        {entry.fecha_realizacion}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num font-bold text-[#1e40af] tabular-nums">
                        {entry.calificacion.toFixed(2)} / 5.00
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
