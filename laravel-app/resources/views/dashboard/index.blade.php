@extends('layouts.app')

@section('title', 'Dashboard de Progreso — A.B.A.')

@section('content')
<div class="space-y-8">
    <div>
        <h1 class="font-display text-3xl font-bold text-[#191c1e]">Dashboard de Progreso y Reportes</h1>
        <p class="mt-1 text-sm text-[#444653]">Resumen de calificaciones, porcentaje de avance y desempeño por evaluación.</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-white border border-slate-200 rounded-2xl p-6">
            <p class="text-xs font-semibold text-[#444653]">Promedio General</p>
            <p class="mt-2 font-display text-3xl font-bold text-[#1e40af] tabular-nums">{{ number_format($promedio * 20, 2) }}/100</p>
            <p class="mt-1 text-xs text-[#444653] tabular-nums">Escala 5.00: {{ number_format($promedio, 2) }}</p>
        </div>
        <div class="bg-white border border-slate-200 rounded-2xl p-6">
            <p class="text-xs font-semibold text-[#444653]">Evaluaciones Completadas</p>
            <p class="mt-2 font-display text-3xl font-bold text-[#10b981] tabular-nums">{{ $completadas }} / {{ $totalEvaluaciones }}</p>
            <div class="mt-3 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div class="h-full bg-[#10b981]" style="width: {{ $progreso }}%"></div>
            </div>
        </div>
        <div class="bg-white border border-slate-200 rounded-2xl p-6">
            <p class="text-xs font-semibold text-[#444653]">Saberes Disponibles</p>
            <p class="mt-2 font-display text-3xl font-bold text-[#4f46e5] tabular-nums">{{ $totalSaberes }}</p>
            <p class="mt-1 text-xs text-[#444653]">Avance actual: {{ number_format($progreso, 2) }}%</p>
        </div>
    </div>

    <section class="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h2 class="font-display text-xl font-semibold text-[#191c1e]">Calificaciones por Evaluación</h2>
        <div class="space-y-3">
            @foreach($grafica as $item)
                <div>
                    <div class="flex justify-between text-xs font-medium text-[#444653] mb-1">
                        <span>{{ $item['titulo'] }}</span>
                        <span class="tabular-nums">{{ number_format($item['calificacion'], 2) }} / 5.00 ({{ $item['porcentaje'] }}%)</span>
                    </div>
                    <div class="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div class="h-full bg-[#4f46e5]" style="width: {{ $item['porcentaje'] }}%"></div>
                    </div>
                </div>
            @endforeach
        </div>
    </section>
</div>
@endsection
