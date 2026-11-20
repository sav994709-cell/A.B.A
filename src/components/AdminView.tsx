import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { AdminActivityReportsPanel } from './AdminActivityReportsPanel';

interface AdminPayload {
  roles: Array<{ id_rol: number; nombre_rol: string }>;
  grados: Array<{ id_grado: number; nombre_grado: string; seccion: string | null }>;
  usuarios: Array<{
    id_usuario: number;
    nombre: string;
    apellido: string;
    email: string;
    id_rol: number;
    nombre_rol: string;
    nivel_acceso: string | null;
    prof_grado: number | null;
    especialidad: string | null;
    est_grado: number | null;
    codigo_estudiantil: string | null;
  }>;
  saberes: Array<{
    id_saber: number;
    titulo: string;
    descripcion: string | null;
    id_grado: number;
    nombre_grado: string;
  }>;
  videos: Array<{
    id_video: number;
    titulo: string;
    url_video: string;
    duracion_segundos: number | null;
    id_saber: number;
    saber_titulo: string;
  }>;
  evaluaciones: Array<{
    id_evaluacion: number;
    titulo: string;
    instrucciones: string | null;
    id_saber: number;
    saber_titulo: string;
  }>;
  preguntas: Array<{
    id_respuesta: number;
    enunciado_pregunta: string;
    opcion_a: string;
    opcion_b: string;
    opcion_c: string;
    id_evaluacion: number;
    evaluacion_titulo: string;
    opcion_correcta: string | null;
    explicacion: string | null;
    retroalimentacion: string | null;
  }>;
}

type AdminTab = 'reportes' | 'usuarios' | 'grados' | 'saberes' | 'videos' | 'evaluaciones';

export const AdminView: React.FC = () => {
  const [data, setData] = useState<AdminPayload | null>(null);
  const [tab, setTab] = useState<AdminTab>('reportes');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: string; id: number } | null>(null);

  // Formularios
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userForm, setUserForm] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    id_rol: 3,
    id_grado: 1,
    especialidad: '',
    nivel_acceso: 'Admin Académico',
  });

  const [editingGradoId, setEditingGradoId] = useState<number | null>(null);
  const [gradoForm, setGradoForm] = useState({ nombre_grado: '', seccion: 'Mañana' });

  const [editingSaberId, setEditingSaberId] = useState<number | null>(null);
  const [saberForm, setSaberForm] = useState({ titulo: '', descripcion: '', id_grado: 1 });

  const [videoForm, setVideoForm] = useState({
    titulo: '',
    url_video: 'https://aba.edu.co/videos/nuevo.mp4',
    duracion_segundos: 180,
    id_saber: 1,
  });

  const [evalForm, setEvalForm] = useState({ titulo: '', instrucciones: '', id_saber: 1 });
  const [preguntaForm, setPreguntaForm] = useState({
    id_evaluacion: 1,
    enunciado_pregunta: '',
    opcion_a: '',
    opcion_b: '',
    opcion_c: '',
    opcion_correcta: 'A' as 'A' | 'B' | 'C',
    explicacion: '',
    retroalimentacion_incorrecta: '',
  });

  const loadAll = useCallback(() => {
    setLoading(true);
    apiFetch('/api/admin/resumen')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'No autorizado');
        setData(d);
      })
      .catch((err: Error) => setFeedback({ type: 'err', text: err.message }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function saveUsuario(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const url = editingUserId ? `/api/admin/usuarios/${editingUserId}` : '/api/admin/usuarios';
    const method = editingUserId ? 'PUT' : 'POST';
    const res = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userForm),
    });
    const d = await res.json();
    if (!res.ok) {
      setFeedback({ type: 'err', text: d.error || 'Error guardando usuario.' });
      return;
    }
    setFeedback({ type: 'ok', text: editingUserId ? 'Usuario actualizado.' : 'Usuario creado correctamente.' });
    setEditingUserId(null);
    setUserForm({
      nombre: '',
      apellido: '',
      email: '',
      password: '',
      id_rol: 3,
      id_grado: 1,
      especialidad: '',
      nivel_acceso: 'Admin Académico',
    });
    loadAll();
  }

  async function saveGrado(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const url = editingGradoId ? `/api/admin/grados/${editingGradoId}` : '/api/admin/grados';
    const method = editingGradoId ? 'PUT' : 'POST';
    const res = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gradoForm),
    });
    const d = await res.json();
    if (!res.ok) {
      setFeedback({ type: 'err', text: d.error || 'Error guardando grado.' });
      return;
    }
    setFeedback({ type: 'ok', text: editingGradoId ? 'Grado actualizado.' : 'Grado creado.' });
    setEditingGradoId(null);
    setGradoForm({ nombre_grado: '', seccion: 'Mañana' });
    loadAll();
  }

  async function saveSaber(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const url = editingSaberId ? `/api/admin/saberes/${editingSaberId}` : '/api/admin/saberes';
    const method = editingSaberId ? 'PUT' : 'POST';
    const res = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saberForm),
    });
    const d = await res.json();
    if (!res.ok) {
      setFeedback({ type: 'err', text: d.error || 'Error guardando saber.' });
      return;
    }
    setFeedback({ type: 'ok', text: editingSaberId ? 'Saber actualizado.' : 'Saber creado.' });
    setEditingSaberId(null);
    setSaberForm({ titulo: '', descripcion: '', id_grado: 1 });
    loadAll();
  }

  async function saveVideo(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const res = await apiFetch('/api/admin/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(videoForm),
    });
    const d = await res.json();
    if (!res.ok) {
      setFeedback({ type: 'err', text: d.error || 'Error creando video.' });
      return;
    }
    setFeedback({ type: 'ok', text: 'Video educativo registrado.' });
    setVideoForm({ titulo: '', url_video: 'https://aba.edu.co/videos/nuevo.mp4', duracion_segundos: 180, id_saber: 1 });
    loadAll();
  }

  async function saveEvaluacion(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const res = await apiFetch('/api/admin/evaluaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(evalForm),
    });
    const d = await res.json();
    if (!res.ok) {
      setFeedback({ type: 'err', text: d.error || 'Error creando evaluación.' });
      return;
    }
    setFeedback({ type: 'ok', text: 'Evaluación creada.' });
    setEvalForm({ titulo: '', instrucciones: '', id_saber: 1 });
    loadAll();
  }

  async function savePregunta(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const res = await apiFetch('/api/admin/preguntas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preguntaForm),
    });
    const d = await res.json();
    if (!res.ok) {
      setFeedback({ type: 'err', text: d.error || 'Error creando pregunta.' });
      return;
    }
    setFeedback({ type: 'ok', text: 'Pregunta ABC y retroalimentación registradas.' });
    setPreguntaForm({
      id_evaluacion: 1,
      enunciado_pregunta: '',
      opcion_a: '',
      opcion_b: '',
      opcion_c: '',
      opcion_correcta: 'A',
      explicacion: '',
      retroalimentacion_incorrecta: '',
    });
    loadAll();
  }

  async function executeDelete(kind: string, id: number) {
    setFeedback(null);
    const res = await apiFetch(`/api/admin/${kind}/${id}`, { method: 'DELETE' });
    const d = await res.json();
    setConfirmDelete(null);
    if (!res.ok) {
      setFeedback({ type: 'err', text: d.error || 'No se pudo eliminar el registro.' });
      return;
    }
    setFeedback({ type: 'ok', text: 'Registro eliminado correctamente.' });
    loadAll();
  }

  if (loading && !data) {
    return <div className="py-16 text-center text-sm text-[#444653]">Cargando consola administrativa...</div>;
  }

  if (!data) {
    return (
      <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <p className="font-display text-2xl font-bold text-[#ba1a1a]">403</p>
        <p className="mt-2 text-sm text-[#444653]">{feedback?.text || 'Acceso restringido al rol Administrador.'}</p>
      </div>
    );
  }

  const tabs: Array<{ id: AdminTab; label: string; count?: number }> = [
    { id: 'reportes', label: 'Reportes de Uso' },
    { id: 'usuarios', label: 'Usuarios y Roles', count: data.usuarios.length },
    { id: 'grados', label: 'Grados', count: data.grados.length },
    { id: 'saberes', label: 'Saberes', count: data.saberes.length },
    { id: 'videos', label: 'Videos', count: data.videos.length },
    { id: 'evaluaciones', label: 'Evaluaciones ABC', count: data.evaluaciones.length },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold text-[#4f46e5]">Gestión Integral de Plataforma</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-[#191c1e]">Panel de Administración</h1>
        <p className="mt-1 text-sm text-[#444653]">
          Administra usuarios, roles, grados escolares, saberes, videos educativos y bancos de preguntas ABC.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setFeedback(null);
              setConfirmDelete(null);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition ${
              tab === t.id
                ? 'bg-[#1e40af] text-white'
                : 'bg-white border border-slate-200 text-[#444653] hover:text-[#191c1e]'
            }`}
          >
            {t.count !== undefined ? `${t.label} (${t.count})` : t.label}
          </button>
        ))}
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'ok'
              ? 'border-[#10b981]/40 bg-[#ecfdf5] text-[#047857]'
              : 'border-[#ba1a1a]/30 bg-[#ffdad6] text-[#93000a]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* TAB: REPORTES DE USO DE PLATAFORMA */}
      {tab === 'reportes' && (
        <AdminActivityReportsPanel roles={data.roles} grados={data.grados} />
      )}

      {/* TAB: USUARIOS */}
      {tab === 'usuarios' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form onSubmit={saveUsuario} className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-4">
            <h2 className="font-display text-lg font-semibold text-[#1e40af]">
              {editingUserId ? 'Editar Usuario' : 'Nuevo Usuario'}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="Nombre"
                value={userForm.nombre}
                onChange={(e) => setUserForm({ ...userForm, nombre: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                required
                placeholder="Apellido"
                value={userForm.apellido}
                onChange={(e) => setUserForm({ ...userForm, apellido: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <input
              required
              type="email"
              placeholder="Correo electrónico"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required={!editingUserId}
              type="password"
              placeholder={editingUserId ? 'Nueva contraseña (opcional)' : 'Contraseña'}
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={userForm.id_rol}
                onChange={(e) => setUserForm({ ...userForm, id_rol: Number(e.target.value) })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {data.roles.map((r) => (
                  <option key={r.id_rol} value={r.id_rol}>
                    {r.nombre_rol}
                  </option>
                ))}
              </select>
              {userForm.id_rol !== 1 && (
                <select
                  value={userForm.id_grado}
                  onChange={(e) => setUserForm({ ...userForm, id_grado: Number(e.target.value) })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {data.grados.map((g) => (
                    <option key={g.id_grado} value={g.id_grado}>
                      {g.nombre_grado}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {userForm.id_rol === 2 && (
              <input
                placeholder="Especialidad docente"
                value={userForm.especialidad}
                onChange={(e) => setUserForm({ ...userForm, especialidad: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            )}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] text-white text-sm font-semibold py-2.5 px-4"
              >
                <Plus className="w-4 h-4" />
                <span>{editingUserId ? 'Actualizar' : 'Guardar usuario'}</span>
              </button>
              {editingUserId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingUserId(null);
                    setUserForm({
                      nombre: '',
                      apellido: '',
                      email: '',
                      password: '',
                      id_rol: 3,
                      id_grado: 1,
                      especialidad: '',
                      nivel_acceso: 'Admin Académico',
                    });
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2.5 text-xs font-semibold text-[#444653]"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f2f4f6] text-xs text-[#444653] border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Nombre</th>
                    <th className="px-5 py-3 font-semibold">Correo</th>
                    <th className="px-5 py-3 font-semibold">Rol</th>
                    <th className="px-5 py-3 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.usuarios.map((u) => (
                    <tr key={u.id_usuario}>
                      <td className="px-5 py-3 font-medium text-[#191c1e]">
                        {u.nombre} {u.apellido}
                      </td>
                      <td className="px-5 py-3 text-[#444653]">{u.email}</td>
                      <td className="px-5 py-3 font-semibold text-[#1e40af]">{u.nombre_rol}</td>
                      <td className="px-5 py-3 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUserId(u.id_usuario);
                            setUserForm({
                              nombre: u.nombre,
                              apellido: u.apellido,
                              email: u.email,
                              password: '',
                              id_rol: u.id_rol,
                              id_grado: u.est_grado || u.prof_grado || 1,
                              especialidad: u.especialidad || '',
                              nivel_acceso: u.nivel_acceso || 'Admin Académico',
                            });
                          }}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#4f46e5] hover:underline"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>
                        {confirmDelete?.kind === 'usuarios' && confirmDelete.id === u.id_usuario ? (
                          <button
                            type="button"
                            onClick={() => executeDelete('usuarios', u.id_usuario)}
                            className="text-xs font-semibold text-white bg-[#ba1a1a] px-2.5 py-1 rounded"
                          >
                            Confirmar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete({ kind: 'usuarios', id: u.id_usuario })}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#ba1a1a] hover:underline"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Eliminar</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: GRADOS */}
      {tab === 'grados' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form onSubmit={saveGrado} className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-4">
            <h2 className="font-display text-lg font-semibold text-[#1e40af]">
              {editingGradoId ? 'Editar Grado' : 'Nuevo Grado'}
            </h2>
            <input
              required
              placeholder="Ej: Sexto 601"
              value={gradoForm.nombre_grado}
              onChange={(e) => setGradoForm({ ...gradoForm, nombre_grado: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={gradoForm.seccion}
              onChange={(e) => setGradoForm({ ...gradoForm, seccion: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="Mañana">Mañana</option>
              <option value="Tarde">Tarde</option>
              <option value="Única">Única</option>
            </select>
            <button type="submit" className="w-full rounded-lg bg-[#4f46e5] text-white text-sm font-semibold py-2.5">
              {editingGradoId ? 'Actualizar grado' : 'Crear grado'}
            </button>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f2f4f6] text-xs text-[#444653] border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-semibold">ID</th>
                  <th className="px-5 py-3 font-semibold">Grado</th>
                  <th className="px-5 py-3 font-semibold">Jornada / Sección</th>
                  <th className="px-5 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.grados.map((g) => (
                  <tr key={g.id_grado}>
                    <td className="px-5 py-3 font-mono-num">{g.id_grado}</td>
                    <td className="px-5 py-3 font-medium text-[#191c1e]">{g.nombre_grado}</td>
                    <td className="px-5 py-3 text-[#444653]">{g.seccion || '—'}</td>
                    <td className="px-5 py-3 text-right space-x-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingGradoId(g.id_grado);
                          setGradoForm({ nombre_grado: g.nombre_grado, seccion: g.seccion || 'Mañana' });
                        }}
                        className="text-xs font-semibold text-[#4f46e5] hover:underline"
                      >
                        Editar
                      </button>
                      {confirmDelete?.kind === 'grados' && confirmDelete.id === g.id_grado ? (
                        <button
                          type="button"
                          onClick={() => executeDelete('grados', g.id_grado)}
                          className="text-xs font-semibold text-white bg-[#ba1a1a] px-2.5 py-1 rounded"
                        >
                          Confirmar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete({ kind: 'grados', id: g.id_grado })}
                          className="text-xs font-semibold text-[#ba1a1a] hover:underline"
                        >
                          Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: SABERES */}
      {tab === 'saberes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form onSubmit={saveSaber} className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-4">
            <h2 className="font-display text-lg font-semibold text-[#10b981]">
              {editingSaberId ? 'Editar Saber' : 'Nuevo Saber'}
            </h2>
            <input
              required
              placeholder="Título del saber"
              value={saberForm.titulo}
              onChange={(e) => setSaberForm({ ...saberForm, titulo: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <textarea
              rows={3}
              placeholder="Descripción pedagógica"
              value={saberForm.descripcion}
              onChange={(e) => setSaberForm({ ...saberForm, descripcion: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={saberForm.id_grado}
              onChange={(e) => setSaberForm({ ...saberForm, id_grado: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {data.grados.map((g) => (
                <option key={g.id_grado} value={g.id_grado}>
                  {g.nombre_grado} ({g.seccion})
                </option>
              ))}
            </select>
            <button type="submit" className="w-full rounded-lg bg-[#10b981] text-white text-sm font-semibold py-2.5">
              {editingSaberId ? 'Actualizar saber' : 'Crear saber'}
            </button>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f2f4f6] text-xs text-[#444653] border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-semibold">Título</th>
                  <th className="px-5 py-3 font-semibold">Grado</th>
                  <th className="px-5 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.saberes.map((s) => (
                  <tr key={s.id_saber}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-[#191c1e]">{s.titulo}</p>
                      <p className="text-xs text-[#444653]">{s.descripcion}</p>
                    </td>
                    <td className="px-5 py-3 text-[#444653] whitespace-nowrap">{s.nombre_grado}</td>
                    <td className="px-5 py-3 text-right space-x-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSaberId(s.id_saber);
                          setSaberForm({ titulo: s.titulo, descripcion: s.descripcion || '', id_grado: s.id_grado });
                        }}
                        className="text-xs font-semibold text-[#4f46e5] hover:underline"
                      >
                        Editar
                      </button>
                      {confirmDelete?.kind === 'saberes' && confirmDelete.id === s.id_saber ? (
                        <button
                          type="button"
                          onClick={() => executeDelete('saberes', s.id_saber)}
                          className="text-xs font-semibold text-white bg-[#ba1a1a] px-2.5 py-1 rounded"
                        >
                          Confirmar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete({ kind: 'saberes', id: s.id_saber })}
                          className="text-xs font-semibold text-[#ba1a1a] hover:underline"
                        >
                          Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: VIDEOS */}
      {tab === 'videos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form onSubmit={saveVideo} className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-4">
            <h2 className="font-display text-lg font-semibold text-[#1e40af]">Agregar Video</h2>
            <input
              required
              placeholder="Título del video"
              value={videoForm.titulo}
              onChange={(e) => setVideoForm({ ...videoForm, titulo: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              placeholder="URL del video MP4"
              value={videoForm.url_video}
              onChange={(e) => setVideoForm({ ...videoForm, url_video: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={10}
              placeholder="Duración en segundos"
              value={videoForm.duracion_segundos}
              onChange={(e) => setVideoForm({ ...videoForm, duracion_segundos: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={videoForm.id_saber}
              onChange={(e) => setVideoForm({ ...videoForm, id_saber: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {data.saberes.map((s) => (
                <option key={s.id_saber} value={s.id_saber}>
                  {s.titulo}
                </option>
              ))}
            </select>
            <button type="submit" className="w-full rounded-lg bg-[#4f46e5] text-white text-sm font-semibold py-2.5">
              Guardar video
            </button>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f2f4f6] text-xs text-[#444653] border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-semibold">Video</th>
                  <th className="px-5 py-3 font-semibold">Saber</th>
                  <th className="px-5 py-3 font-semibold">Duración</th>
                  <th className="px-5 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.videos.map((v) => (
                  <tr key={v.id_video}>
                    <td className="px-5 py-3 font-medium text-[#191c1e]">{v.titulo}</td>
                    <td className="px-5 py-3 text-[#444653]">{v.saber_titulo}</td>
                    <td className="px-5 py-3 font-mono-num">{v.duracion_segundos ?? 180}s</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => executeDelete('videos', v.id_video)}
                        className="text-xs font-semibold text-[#ba1a1a] hover:underline"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: EVALUACIONES Y PREGUNTAS */}
      {tab === 'evaluaciones' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 space-y-6">
            <form onSubmit={saveEvaluacion} className="bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-4">
              <h2 className="font-display text-lg font-semibold text-[#1e40af]">Nueva Evaluación</h2>
              <input
                required
                placeholder="Título de la evaluación"
                value={evalForm.titulo}
                onChange={(e) => setEvalForm({ ...evalForm, titulo: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                placeholder="Instrucciones"
                value={evalForm.instrucciones}
                onChange={(e) => setEvalForm({ ...evalForm, instrucciones: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={evalForm.id_saber}
                onChange={(e) => setEvalForm({ ...evalForm, id_saber: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {data.saberes.map((s) => (
                  <option key={s.id_saber} value={s.id_saber}>
                    {s.titulo}
                  </option>
                ))}
              </select>
              <button type="submit" className="w-full rounded-lg bg-[#1e40af] text-white text-sm font-semibold py-2.5">
                Crear evaluación
              </button>
            </form>

            <form onSubmit={savePregunta} className="bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-3">
              <h2 className="font-display text-lg font-semibold text-[#10b981]">Agregar Pregunta ABC</h2>
              <select
                value={preguntaForm.id_evaluacion}
                onChange={(e) => setPreguntaForm({ ...preguntaForm, id_evaluacion: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {data.evaluaciones.map((ev) => (
                  <option key={ev.id_evaluacion} value={ev.id_evaluacion}>
                    {ev.titulo}
                  </option>
                ))}
              </select>
              <input
                required
                placeholder="Enunciado de la pregunta"
                value={preguntaForm.enunciado_pregunta}
                onChange={(e) => setPreguntaForm({ ...preguntaForm, enunciado_pregunta: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  required
                  placeholder="Opción A"
                  value={preguntaForm.opcion_a}
                  onChange={(e) => setPreguntaForm({ ...preguntaForm, opcion_a: e.target.value })}
                  className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
                />
                <input
                  required
                  placeholder="Opción B"
                  value={preguntaForm.opcion_b}
                  onChange={(e) => setPreguntaForm({ ...preguntaForm, opcion_b: e.target.value })}
                  className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
                />
                <input
                  required
                  placeholder="Opción C"
                  value={preguntaForm.opcion_c}
                  onChange={(e) => setPreguntaForm({ ...preguntaForm, opcion_c: e.target.value })}
                  className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
                />
              </div>
              <select
                value={preguntaForm.opcion_correcta}
                onChange={(e) =>
                  setPreguntaForm({ ...preguntaForm, opcion_correcta: e.target.value as 'A' | 'B' | 'C' })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="A">Correcta: A</option>
                <option value="B">Correcta: B</option>
                <option value="C">Correcta: C</option>
              </select>
              <input
                placeholder="Explicación si acierta"
                value={preguntaForm.explicacion}
                onChange={(e) => setPreguntaForm({ ...preguntaForm, explicacion: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                placeholder="Retroalimentación si falla"
                value={preguntaForm.retroalimentacion_incorrecta}
                onChange={(e) => setPreguntaForm({ ...preguntaForm, retroalimentacion_incorrecta: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button type="submit" className="w-full rounded-lg bg-[#10b981] text-white text-sm font-semibold py-2.5">
                Guardar pregunta
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-[#191c1e]">Banco de Preguntas ABC</h3>
              <span className="text-xs text-[#444653] tabular-nums">{data.preguntas.length} pregunta(s)</span>
            </div>
            <div className="divide-y divide-slate-100">
              {data.preguntas.map((pr) => (
                <div key={pr.id_respuesta} className="p-5 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-[#4f46e5] font-semibold">
                      {pr.evaluacion_titulo} · Correcta: {pr.opcion_correcta || '—'}
                    </p>
                    <p className="text-sm font-semibold text-[#191c1e]">{pr.enunciado_pregunta}</p>
                    <p className="text-xs text-[#444653]">
                      A: {pr.opcion_a} · B: {pr.opcion_b} · C: {pr.opcion_c}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => executeDelete('preguntas', pr.id_respuesta)}
                    className="text-xs font-semibold text-[#ba1a1a] hover:underline shrink-0"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
