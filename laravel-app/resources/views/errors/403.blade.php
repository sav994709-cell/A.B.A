@extends('layouts.app')

@section('title', '403 Acceso Denegado — A.B.A.')

@section('content')
<div class="max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
    <p class="font-display text-4xl font-bold text-[#ba1a1a]">403</p>
    <h1 class="font-display text-2xl font-semibold text-[#191c1e]">Acceso denegado</h1>
    <p class="text-sm text-[#444653]">Tu rol actual no tiene permisos para ingresar a esta sección de la plataforma.</p>
    <a href="{{ route('saberes.index') }}" class="inline-block px-5 py-2.5 rounded-lg bg-[#1e40af] text-white text-sm font-semibold">
        Volver al inicio
    </a>
</div>
@endsection
