<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $usuario = $request->user();

        if (!$usuario) {
            return redirect()->route('login');
        }

        $usuario->loadMissing('rol');

        if (!$usuario->tieneRol(...$roles)) {
            abort(403, 'No tienes permisos para acceder a esta sección de A.B.A.');
        }

        return $next($request);
    }
}
