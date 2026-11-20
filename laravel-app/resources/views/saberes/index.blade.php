@extends('layouts.app')

@section('title', 'Saberes de Aprendizaje — A.B.A.')

@section('content')
<div class="space-y-8">
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
            <h1 class="font-display text-3xl font-bold text-[#191c1e]">Saberes de Aprendizaje</h1>
            <p class="mt-1 text-sm text-[#444653]">Explora contenidos organizados por grado escolar, mira los videos guía y completa tu evaluación ABC.</p>
        </div>

        <form method="GET" action="{{ route('saberes.index') }}" class="flex flex-wrap items-center gap-3">
            <input type="text" name="q" value="{{ $busqueda }}" placeholder="Buscar saber o tema..."
                   class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-[#4f46e5] focus:outline-none">
            <select name="grado" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">Todos los grados</option>
                @foreach($todosGrados as $g)
                    <option value="{{ $g->id_grado }}" @selected((string)$gradoId === (string)$g->id_grado)>
                        {{ $g->nombre_grado }} ({{ $g->seccion }})
                    </option>
                @endforeach
            </select>
            <button type="submit" class="px-4 py-2 rounded-lg bg-[#1e40af] text-white text-sm font-semibold">
                Filtrar
            </button>
        </form>
    </div>

    @foreach($grados as $grado)
        @if($grado->saberes->isNotEmpty())
            <section class="space-y-4">
                <div class="flex items-baseline justify-between border-b border-slate-200 pb-2">
                    <h2 class="font-display text-xl font-semibold text-[#1e40af]">
                        {{ $grado->nombre_grado }}
                    </h2>
                    <span class="text-xs font-medium text-[#444653]">Jornada {{ $grado->seccion }} · {{ $grado->saberes->count() }} saberes</span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    @foreach($grado->saberes as $saber)
                        <article class="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between gap-4">
                            <div>
                                <p class="text-xs text-[#444653] mb-2">
                                    {{ $grado->nombre_grado }} · {{ $saber->videos->count() }} video(s) · {{ $saber->evaluaciones->count() }} evaluación
                                </p>
                                <h3 class="font-display text-lg font-semibold text-[#191c1e]">{{ $saber->titulo }}</h3>
                                <p class="mt-2 text-sm text-[#444653]">{{ $saber->descripcion }}</p>
                            </div>
                            <a href="{{ route('saberes.show', $saber->id_saber) }}"
                               class="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-[#4f46e5] text-white text-sm font-semibold hover:bg-[#4338ca]">
                                Abrir saber
                            </a>
                        </article>
                    @endforeach
                </div>
            </section>
        @endif
    @endforeach
</div>
@endsection
