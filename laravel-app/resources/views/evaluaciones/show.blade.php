@extends('layouts.app')

@section('title', $evaluacion->titulo . ' — Evaluación ABC')

@section('content')
<div class="max-w-3xl mx-auto space-y-6">
    <div>
        <a href="{{ route('saberes.show', $evaluacion->id_saber) }}" class="text-sm font-medium text-[#1e40af] hover:underline">&larr; Volver al saber</a>
        <h1 class="mt-3 font-display text-3xl font-bold text-[#191c1e]">{{ $evaluacion->titulo }}</h1>
        <p class="mt-1 text-sm text-[#444653]">{{ $evaluacion->saber->titulo }} · {{ $evaluacion->saber->grado->nombre_grado }}</p>
        @if($evaluacion->instrucciones)
            <p class="mt-2 text-sm text-[#191c1e]">{{ $evaluacion->instrucciones }}</p>
        @endif
    </div>

    @isset($resultado)
        <div class="rounded-2xl border {{ $resultado['calificacion'] >= 3 ? 'border-[#10b981] bg-[#ecfdf5]' : 'border-[#f59e0b] bg-[#fffbeb]' }} p-6 space-y-4">
            <div class="flex items-center justify-between">
                <h2 class="font-display text-xl font-bold text-[#191c1e]">Resultado de tu evaluación</h2>
                <span class="font-bold text-2xl tabular-nums text-[#1e40af]">{{ number_format($resultado['calificacion'], 2) }} / 5.00</span>
            </div>
            <p class="text-sm text-[#444653]">
                Aciertos: <strong class="tabular-nums">{{ $resultado['aciertos'] }} / {{ $resultado['total'] }}</strong> ({{ $resultado['porcentaje'] }}%).
            </p>
            @foreach($resultado['detalle'] as $item)
                <div class="rounded-xl bg-white border border-slate-200 p-4 space-y-1">
                    <p class="text-sm font-semibold text-[#191c1e]">{{ $item['pregunta']->enunciado_pregunta }}</p>
                    <p class="text-xs {{ $item['es_correcta'] ? 'text-[#047857]' : 'text-[#ba1a1a]' }} font-semibold">
                        {{ $item['es_correcta'] ? 'Correcta' : 'Incorrecta' }} — Elegiste la opción {{ $item['opcion_elegida'] }}
                    </p>
                    <p class="text-sm text-[#444653]">{{ $item['mensaje'] }}</p>
                </div>
            @endforeach
        </div>
    @endisset

    <form method="POST" action="{{ route('evaluaciones.responder', $evaluacion->id_evaluacion) }}" class="space-y-6">
        @csrf
        @foreach($evaluacion->preguntas as $index => $pregunta)
            <div class="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <p class="text-xs font-semibold text-[#444653]">Pregunta {{ $index + 1 }}</p>
                <h2 class="font-display text-xl font-semibold text-[#191c1e]">{{ $pregunta->enunciado_pregunta }}</h2>

                <div class="space-y-3">
                    @foreach(['A' => $pregunta->opcion_a, 'B' => $pregunta->opcion_b, 'C' => $pregunta->opcion_c] as $letra => $texto)
                        <label class="flex items-center gap-3 rounded-xl border border-slate-200 p-4 cursor-pointer hover:border-[#4f46e5]">
                            <input type="radio" name="respuestas[{{ $pregunta->id_respuesta }}]" value="{{ $letra }}" required
                                   class="h-4 w-4 text-[#4f46e5]">
                            <span class="text-sm font-semibold text-[#1e40af]">{{ $letra }}.</span>
                            <span class="text-sm text-[#191c1e]">{{ $texto }}</span>
                        </label>
                    @endforeach
                </div>
            </div>
        @endforeach

        <button type="submit" class="w-full py-3.5 px-6 rounded-xl bg-[#10b981] hover:bg-[#059669] text-white font-semibold text-sm">
            Enviar evaluación y registrar puntaje
        </button>
    </form>
</div>
@endsection
