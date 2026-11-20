@extends('layouts.app')

@section('title', '404 No Encontrado — A.B.A.')

@section('content')
<div class="max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
    <p class="font-display text-4xl font-bold text-[#1e40af]">404</p>
    <h1 class="font-display text-2xl font-semibold text-[#191c1e]">Recurso no encontrado</h1>
    <p class="text-sm text-[#444653]">El contenido o evaluación que buscas no existe o fue retirado.</p>
    <a href="{{ route('saberes.index') }}" class="inline-block px-5 py-2.5 rounded-lg bg-[#1e40af] text-white text-sm font-semibold">
        Ir a Saberes de Aprendizaje
    </a>
</div>
@endsection
