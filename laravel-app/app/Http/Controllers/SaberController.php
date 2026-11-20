<?php

namespace App\Http\Controllers;

use App\Models\Grado;
use App\Models\Saber;
use Illuminate\Http\Request;
use Illuminate\View\View;

class SaberController extends Controller
{
    public function index(Request $request): View
    {
        $busqueda = trim((string) $request->query('q', ''));
        $gradoId = $request->query('grado');

        $grados = Grado::with(['saberes' => function ($query) use ($busqueda) {
            if ($busqueda !== '') {
                $query->where(function ($sub) use ($busqueda) {
                    $sub->where('titulo', 'like', "%{$busqueda}%")
                        ->orWhere('descripcion', 'like', "%{$busqueda}%");
                });
            }
            $query->with(['videos', 'evaluaciones'])->orderBy('id_saber');
        }])
            ->when($gradoId, fn ($q) => $q->where('id_grado', (int) $gradoId))
            ->orderBy('id_grado')
            ->get();

        $todosGrados = Grado::orderBy('id_grado')->get();

        return view('saberes.index', compact('grados', 'todosGrados', 'busqueda', 'gradoId'));
    }

    public function show(int $id): View
    {
        $saber = Saber::with(['grado', 'videos', 'evaluaciones.preguntas'])
            ->findOrFail($id);

        return view('saberes.show', compact('saber'));
    }
}
