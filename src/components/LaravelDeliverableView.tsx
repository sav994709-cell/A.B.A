import React, { useEffect, useState } from 'react';
import { Check, Copy, FileCode2 } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface LaravelFile {
  path: string;
  content: string;
}

export const LaravelDeliverableView: React.FC = () => {
  const [files, setFiles] = useState<LaravelFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/laravel-files')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'No autorizado');
        return d;
      })
      .then((d) => {
        if (Array.isArray(d.files)) {
          setFiles(d.files);
          if (d.files.length > 0) {
            const readme = d.files.find((f: LaravelFile) => f.path === 'README_INSTALACION.md');
            setSelectedPath(readme ? readme.path : d.files[0].path);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeFile = files.find((f) => f.path === selectedPath) || files[0] || null;

  async function handleCopy() {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-[#444653]">Cargando código Laravel y SQL corregido...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#4f46e5]">Proyecto Laravel 11 + MariaDB (`a.b.a.`)</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-[#191c1e]">
          Código Fuente Laravel, Blade y Script SQL
        </h1>
        <p className="mt-1 text-sm text-[#444653]">
          Estructura completa lista para ejecutar en PHP/Laravel con los 13 modelos Eloquent, middleware de roles, Form Requests, vistas Blade y procedimientos SQL corregidos.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-4 card-elevation max-h-[680px] overflow-y-auto space-y-1">
          <p className="px-2 py-1.5 text-xs font-semibold text-[#444653] tabular-nums">
            {files.length} archivos generados en /laravel-app
          </p>
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => {
                setSelectedPath(f.path);
                setCopied(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono-num flex items-center gap-2 transition ${
                activeFile?.path === f.path
                  ? 'bg-[#eef2ff] text-[#1e40af] font-semibold'
                  : 'text-[#444653] hover:bg-slate-50 hover:text-[#191c1e]'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{f.path}</span>
            </button>
          ))}
        </aside>

        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation">
          {activeFile ? (
            <>
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4 bg-[#f2f4f6]">
                <span className="text-xs font-mono-num font-semibold text-[#191c1e] truncate">
                  laravel-app/{activeFile.path}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4f46e5] text-white text-xs font-semibold hover:bg-[#4338ca] shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copiado' : 'Copiar archivo'}</span>
                </button>
              </div>
              <pre className="p-5 text-xs font-mono-num text-[#191c1e] overflow-x-auto max-h-[620px] leading-relaxed whitespace-pre">
                {activeFile.content}
              </pre>
            </>
          ) : (
            <p className="p-6 text-sm text-[#444653]">No se encontraron archivos.</p>
          )}
        </div>
      </div>
    </div>
  );
};
