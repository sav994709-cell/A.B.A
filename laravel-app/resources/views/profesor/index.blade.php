@extends('layouts.app')

@section('title', 'Panel Docente — A.B.A.')

@section('content')
<div class="space-y-8">
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
            <h1 class="font-display text-3xl font-bold text-[#191c1e]">Panel Docente</h1>
            <p class="mt-1 text-sm text-[#444653]">Seguimiento de estudiantes por grado y calificaciones registradas.</p>
        </div>

        <form method="GET" action="{{ route('profesor.index') }}" class="flex items-center gap-3">
            <select name="grado" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">Todos los grados</option>
                @foreach($grados as $g)
                    <option value="{{ $g->id_grado }}" @selected((string)$gradoId === (string)$g->id_grado)>
                        {{ $g->nombre_grado }} ({{ $g->seccion }})
                    </option>
                @endforeach
            </select>
            <button type="submit" class="px-4 py-2 rounded-lg bg-[#1e40af] text-white text-sm font-semibold">Filtrar</button>
        </form>
    </div>

    <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 border-b border-slate-200 text-xs text-[#444653]">
                <tr>
                    <th class="px-6 py-3">Código</th>
                    <th class="px-6 py-3">Estudiante</th>
                    <th class="px-6 py-3">Grado</th>
                    <th class="px-6 py-3">Evaluaciones</th>
                    <th class="px-6 py-3">Promedio</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
                @foreach($estudiantes as $est)
                    <tr>
                        <td class="px-6 py-3 tabular-nums font-medium">{{ $est->codigo_estudiantil }}</td>
                        <td class="px-6 py-3">{{ $est->usuario->nombre }} {{ $est->usuario->apellido }}</td>
                        <td class="px-6 py-3">{{ $est->grado->nombre_grado }}</td>
                        <td class="px-6 py-3 tabular-nums">{{ $est->puntajes->count() }}</td>
                        <td class="px-6 py-3 tabular-nums font-semibold text-[#1e40af]">
                            {{ $est->puntajes->count() ? number_format($est->puntajes->avg('calificacion'), 2) : '—' }}
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    </div>
</div>
@endsection
