<?php

namespace App\Http\Controllers;

use App\Models\Estudiante;
use App\Models\Grado;
use App\Models\Puntaje;
use Illuminate\Http\Request;
use Illuminate\View\View;

class ProfesorController extends Controller
{
    public function index(Request $request): View
    {
        $profesor = $request->user()->profesor;
        $gradoId = $request->query('grado', $profesor?->id_grado);

        $grados = Grado::orderBy('id_grado')->get();
        $estudiantes = Estudiante::with(['usuario', 'grado', 'puntajes.evaluacion'])
            ->when($gradoId, fn ($q) => $q->where('id_grado', (int) $gradoId))
            ->get();

        $puntajes = Puntaje::with(['estudiante.usuario', 'estudiante.grado', 'evaluacion.saber'])
            ->when($gradoId, function ($q) use ($gradoId) {
                $q->whereHas('estudiante', fn ($sub) => $sub->where('id_grado', (int) $gradoId));
            })
            ->orderByDesc('fecha_realizacion')
            ->get();

        return view('profesor.index', compact('grados', 'estudiantes', 'puntajes', 'gradoId', 'profesor'));
    }
}
