@extends('layouts.app')

@section('title', 'Iniciar Sesión y Registro — A.B.A.')

@section('content')
<div class="min-h-[80vh] flex items-center justify-center">
    <div class="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Iniciar sesión -->
        <div class="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
            <div class="mb-6">
                <h1 class="font-display text-2xl font-bold text-[#1e40af]">Iniciar sesión</h1>
                <p class="mt-1 text-sm text-[#444653]">Ingresa con tu correo institucional para continuar tu aprendizaje.</p>
            </div>

            <form method="POST" action="{{ route('login.post') }}" class="space-y-4">
                @csrf
                <div>
                    <label for="email" class="block text-sm font-semibold text-[#191c1e] mb-1.5">Correo electrónico</label>
                    <input id="email" name="email" type="email" value="{{ old('email') }}" required autocomplete="email"
                           class="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#4f46e5] focus:outline-none">
                </div>

                <div>
                    <label for="password" class="block text-sm font-semibold text-[#191c1e] mb-1.5">Contraseña</label>
                    <input id="password" name="password" type="password" required autocomplete="current-password"
                           class="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#4f46e5] focus:outline-none">
                </div>

                <button type="submit"
                        class="w-full py-3 px-4 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] text-white text-sm font-semibold transition">
                    Ingresar a la plataforma
                </button>
            </form>
        </div>

        <!-- Registro de usuario -->
        <div class="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
            <div class="mb-6">
                <h2 class="font-display text-2xl font-bold text-[#191c1e]">Crear cuenta</h2>
                <p class="mt-1 text-sm text-[#444653]">Regístrate como estudiante usando tu correo electrónico.</p>
            </div>

            <form method="POST" action="{{ route('register.post') }}" class="space-y-4">
                @csrf
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label for="reg-nombre" class="block text-sm font-semibold text-[#191c1e] mb-1.5">Nombre</label>
                        <input id="reg-nombre" name="nombre" type="text" value="{{ old('nombre') }}" required
                               class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#4f46e5] focus:outline-none">
                    </div>
                    <div>
                        <label for="reg-apellido" class="block text-sm font-semibold text-[#191c1e] mb-1.5">Apellido</label>
                        <input id="reg-apellido" name="apellido" type="text" value="{{ old('apellido') }}" required
                               class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#4f46e5] focus:outline-none">
                    </div>
                </div>

                <div>
                    <label for="reg-email" class="block text-sm font-semibold text-[#191c1e] mb-1.5">Correo electrónico</label>
                    <input id="reg-email" name="email" type="email" value="{{ old('email') }}" required autocomplete="email"
                           class="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#4f46e5] focus:outline-none">
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label for="reg-password" class="block text-sm font-semibold text-[#191c1e] mb-1.5">Contraseña</label>
                        <input id="reg-password" name="password" type="password" required minlength="6" autocomplete="new-password"
                               class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#4f46e5] focus:outline-none">
                    </div>
                    <div>
                        <label for="reg-grado" class="block text-sm font-semibold text-[#191c1e] mb-1.5">Grado</label>
                        <select id="reg-grado" name="id_grado" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                            @foreach($grados as $g)
                                <option value="{{ $g->id_grado }}">{{ $g->nombre_grado }}</option>
                            @endforeach
                        </select>
                    </div>
                </div>

                <button type="submit"
                        class="w-full py-3 px-4 rounded-lg bg-[#10b981] hover:bg-[#059669] text-white text-sm font-semibold transition">
                    Registrarme en A.B.A.
                </button>
            </form>
        </div>
    </div>
</div>
@endsection
