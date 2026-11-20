@extends('layouts.app')

@section('title', 'Administración — A.B.A.')

@section('content')
<div class="space-y-8">
    <div>
        <h1 class="font-display text-3xl font-bold text-[#191c1e]">Panel de Administración</h1>
        <p class="mt-1 text-sm text-[#444653]">Gestión integral de usuarios, roles, grados y saberes de aprendizaje.</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form method="POST" action="{{ route('admin.usuarios.store') }}" class="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            @csrf
            <h2 class="font-display text-lg font-semibold text-[#1e40af]">Registrar Usuario</h2>
            <div class="grid grid-cols-2 gap-3">
                <input name="nombre" placeholder="Nombre" required class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <input name="apellido" placeholder="Apellido" required class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            </div>
            <input name="email" type="email" placeholder="Correo" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <input name="password" type="password" placeholder="Contraseña" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <div class="grid grid-cols-2 gap-3">
                <select name="id_rol" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    @foreach($roles as $rol)
                        <option value="{{ $rol->id_rol }}">{{ $rol->nombre_rol }}</option>
                    @endforeach
                </select>
                <select name="id_grado" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    @foreach($grados as $grado)
                        <option value="{{ $grado->id_grado }}">{{ $grado->nombre_grado }}</option>
                    @endforeach
                </select>
            </div>
            <button type="submit" class="px-4 py-2 rounded-lg bg-[#4f46e5] text-white text-sm font-semibold">Guardar Usuario</button>
        </form>

        <form method="POST" action="{{ route('admin.saberes.store') }}" class="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            @csrf
            <h2 class="font-display text-lg font-semibold text-[#10b981]">Crear Saber de Aprendizaje</h2>
            <input name="titulo" placeholder="Título del saber" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <textarea name="descripcion" rows="3" placeholder="Descripción pedagógica" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></textarea>
            <select name="id_grado" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                @foreach($grados as $grado)
                    <option value="{{ $grado->id_grado }}">{{ $grado->nombre_grado }} ({{ $grado->seccion }})</option>
                @endforeach
            </select>
            <button type="submit" class="px-4 py-2 rounded-lg bg-[#10b981] text-white text-sm font-semibold">Guardar Saber</button>
        </form>
    </div>

    <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 border-b border-slate-200 text-xs text-[#444653]">
                <tr>
                    <th class="px-6 py-3">Usuario</th>
                    <th class="px-6 py-3">Correo</th>
                    <th class="px-6 py-3">Rol</th>
                    <th class="px-6 py-3 text-right">Acciones</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
                @foreach($usuarios as $u)
                    <tr>
                        <td class="px-6 py-3 font-medium">{{ $u->nombre }} {{ $u->apellido }}</td>
                        <td class="px-6 py-3 text-[#444653]">{{ $u->email }}</td>
                        <td class="px-6 py-3">{{ $u->rol->nombre_rol }}</td>
                        <td class="px-6 py-3 text-right">
                            <form method="POST" action="{{ route('admin.usuarios.destroy', $u->id_usuario) }}" class="inline">
                                @csrf
                                @method('DELETE')
                                <button type="submit" class="text-xs font-semibold text-[#ba1a1a] hover:underline">Eliminar</button>
                            </form>
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    </div>
</div>
@endsection
