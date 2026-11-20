@extends('layouts.app')

@section('title', $saber->titulo . ' — A.B.A.')

@section('content')
<div class="space-y-8">
    <div>
        <a href="{{ route('saberes.index') }}" class="text-sm font-medium text-[#1e40af] hover:underline">&larr; Volver a Saberes</a>
        <h1 class="mt-3 font-display text-3xl font-bold text-[#191c1e]">{{ $saber->titulo }}</h1>
        <p class="mt-1 text-sm text-[#444653]">{{ $saber->grado->nombre_grado }} · Jornada {{ $saber->grado->seccion }}</p>
        <p class="mt-3 text-base text-[#191c1e]">{{ $saber->descripcion }}</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section class="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <h2 class="font-display text-xl font-semibold text-[#1e40af]">Videos Educativos</h2>
            @forelse($saber->videos as $video)
                <div class="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
                    <div>
                        <p class="font-semibold text-sm text-[#191c1e]">{{ $video->titulo }}</p>
                        <p class="text-xs text-[#444653] tabular-nums">Duración: {{ gmdate('i:s', (int) $video->duracion_segundos) }}</p>
                    </div>
                    <a href="{{ route('videos.show', $video->id_video) }}"
                       class="px-4 py-2 rounded-lg border border-[#1e40af] text-[#1e40af] text-xs font-semibold hover:bg-[#eff6ff]">
                        Ver video
                    </a>
                </div>
            @empty
                <p class="text-sm text-[#444653]">No hay videos registrados para este saber.</p>
            @endforelse
        </section>

        <section class="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <h2 class="font-display text-xl font-semibold text-[#10b981]">Evaluaciones Interactivas ABC</h2>
            @forelse($saber->evaluaciones as $evaluacion)
                <div class="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
                    <div>
                        <p class="font-semibold text-sm text-[#191c1e]">{{ $evaluacion->titulo }}</p>
                        <p class="text-xs text-[#444653]">{{ $evaluacion->instrucciones }} · {{ $evaluacion->preguntas->count() }} pregunta(s)</p>
                    </div>
                    <a href="{{ route('evaluaciones.show', $evaluacion->id_evaluacion) }}"
                       class="px-4 py-2 rounded-lg bg-[#4f46e5] text-white text-xs font-semibold hover:bg-[#4338ca]">
                        Iniciar evaluación
                    </a>
                </div>
            @empty
                <p class="text-sm text-[#444653]">No hay evaluaciones registradas para este saber.</p>
            @endforelse
        </section>
    </div>
</div>
@endsection
