<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>@yield('title', 'A.B.A. — Plataforma Educativa')</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { font-family: 'Plus Jakarta Sans', sans-serif; background: #f7f9fb; color: #191c1e; }
        h1, h2, h3, .font-display { font-family: 'Outfit', sans-serif; }
        .tabular-nums { font-variant-numeric: tabular-nums; }
    </style>
</head>
<body class="min-h-screen flex flex-col">
    @auth
    <header class="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
            <a href="{{ route('saberes.index') }}" class="font-display text-xl font-bold tracking-tight text-[#1e40af] whitespace-nowrap shrink-0">
                A.B.A.
            </a>
            <nav class="hidden md:flex items-center gap-6 text-sm font-medium text-[#444653]">
                <a href="{{ route('saberes.index') }}" class="hover:text-[#1e40af] whitespace-nowrap">Saberes</a>
                <a href="{{ route('dashboard.index') }}" class="hover:text-[#1e40af] whitespace-nowrap">Progreso</a>
                @if(auth()->user()->tieneRol('Profesor', 'Administrador'))
                    <a href="{{ route('profesor.index') }}" class="hover:text-[#1e40af] whitespace-nowrap">Panel Docente</a>
                @endif
                @if(auth()->user()->tieneRol('Administrador'))
                    <a href="{{ route('admin.index') }}" class="hover:text-[#1e40af] whitespace-nowrap">Administración</a>
                @endif
            </nav>
            <div class="flex items-center gap-4 shrink-0">
                <span class="hidden sm:inline text-xs text-slate-600 whitespace-nowrap">
                    {{ auth()->user()->nombre }} {{ auth()->user()->apellido }} · {{ auth()->user()->rol->nombre_rol }}
                </span>
                <form method="POST" action="{{ route('logout') }}">
                    @csrf
                    <button type="submit" class="px-4 py-2 text-xs font-semibold text-white bg-[#4f46e5] hover:bg-[#4338ca] rounded-lg whitespace-nowrap">
                        Cerrar sesión
                    </button>
                </form>
            </div>
        </div>
    </header>
    @endauth

    <main class="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        @if(session('status'))
            <div class="mb-6 rounded-xl border border-[#10b981]/30 bg-[#ecfdf5] px-4 py-3 text-sm text-[#047857]">
                {{ session('status') }}
            </div>
        @endif

        @if($errors->any())
            <div class="mb-6 rounded-xl border border-[#ba1a1a]/30 bg-[#ffdad6] px-4 py-3 text-sm text-[#93000a]">
                <ul class="list-disc pl-5 space-y-1">
                    @foreach($errors->all() as $error)
                        <li>{{ $error }}</li>
                    @endforeach
                </ul>
            </div>
        @endif

        @yield('content')
    </main>
</body>
</html>
