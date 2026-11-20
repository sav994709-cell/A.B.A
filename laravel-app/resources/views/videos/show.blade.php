@extends('layouts.app')

@section('title', $video->titulo . ' — Videos Educativos')

@section('content')
<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
    <div class="lg:col-span-2 space-y-4">
        <a href="{{ route('saberes.show', $video->id_saber) }}" class="text-sm font-medium text-[#1e40af] hover:underline">&larr; Volver al saber</a>
        <div class="bg-slate-900 rounded-2xl overflow-hidden aspect-video flex items-center justify-center">
            <video controls class="w-full h-full" preload="metadata">
                <source src="{{ $video->url_video }}" type="video/mp4">
                Tu navegador no soporta la reproducción HTML5.
            </video>
        </div>
        <div class="bg-white border border-slate-200 rounded-2xl p-6">
            <p class="text-xs text-[#444653]">{{ $video->saber->grado->nombre_grado }} · {{ $video->saber->titulo }} · Duración {{ gmdate('i:s', (int) $video->duracion_segundos) }}</p>
            <h1 class="mt-2 font-display text-2xl font-bold text-[#191c1e]">{{ $video->titulo }}</h1>
            <p class="mt-2 text-sm text-[#444653]">{{ $video->saber->descripcion }}</p>
        </div>
    </div>

    <aside class="space-y-4">
        <h2 class="font-display text-lg font-semibold text-[#191c1e]">Contenido relacionado</h2>
        <div class="space-y-3">
            @foreach($relacionados as $rel)
                <a href="{{ route('videos.show', $rel->id_video) }}"
                   class="block bg-white border border-slate-200 rounded-xl p-4 hover:border-[#4f46e5] transition">
                    <p class="text-xs text-[#444653]">{{ $rel->saber->grado->nombre_grado }} · {{ gmdate('i:s', (int) $rel->duracion_segundos) }}</p>
                    <p class="mt-1 text-sm font-semibold text-[#191c1e]">{{ $rel->titulo }}</p>
                </a>
            @endforeach
        </div>
    </aside>
</div>
@endsection
