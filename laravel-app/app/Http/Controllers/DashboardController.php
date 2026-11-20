<?php

namespace App\Http\Controllers;

use App\Models\Evaluacion;
use App\Models\Puntaje;
use App\Models\Saber;
use Illuminate\Http\Request;
use Illuminate\View\View;

class DashboardController extends Controller
{
    public function index(Request $request): View
    {
        $usuario = $request->user()->loadMissing('rol', 'estudiante');
        $totalEvaluaciones = Evaluacion::count();
        $totalSaberes = Saber::count();

        if ($usuario->tieneRol('Estudiante') && $usuario->estudiante) {
            $puntajes = Puntaje::with('evaluacion.saber.grado')
                ->where('id_estudiante', $usuario->estudiante->id_estudiante)
                ->orderByDesc('fecha_realizacion')
                ->get();

            $promedio = $puntajes->avg('calificacion') ?? 0;
            $completadas = $puntajes->pluck('id_evaluacion')->unique()->count();
            $progreso = $totalEvaluaciones > 0 ? round(($completadas / $totalEvaluaciones) * 100, 2) : 0;
        } else {
            $puntajes = Puntaje::with(['evaluacion.saber.grado', 'estudiante.usuario'])
                ->orderByDesc('fecha_realizacion')
                ->limit(25)
                ->get();

            $promedio = Puntaje::avg('calificacion') ?? 0;
            $completadas = Evaluacion::has('puntajes')->count();
            $progreso = $totalEvaluaciones > 0 ? round(($completadas / $totalEvaluaciones) * 100, 2) : 0;
        }

        $grafica = Evaluacion::with('saber')->get()->map(function ($ev) use ($puntajes) {
            $match = $puntajes->firstWhere('id_evaluacion', $ev->id_evaluacion);
            $nota = $match ? (float) $match->calificacion : 0.0;
            return [
                'titulo' => $ev->titulo,
                'calificacion' => $nota,
                'porcentaje' => round($nota * 20, 2),
            ];
        });

        return view('dashboard.index', compact(
            'usuario',
            'puntajes',
            'promedio',
            'completadas',
            'totalEvaluaciones',
            'totalSaberes',
            'progreso',
            'grafica'
        ));
    }
}
