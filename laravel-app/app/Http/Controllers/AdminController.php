<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreSaberRequest;
use App\Http\Requests\StoreUsuarioRequest;
use App\Models\Administrador;
use App\Models\Estudiante;
use App\Models\Evaluacion;
use App\Models\Grado;
use App\Models\Profesor;
use App\Models\Rol;
use App\Models\Saber;
use App\Models\Usuario;
use App\Models\Video;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\View\View;

class AdminController extends Controller
{
    public function index(): View
    {
        $roles = Rol::orderBy('id_rol')->get();
        $grados = Grado::orderBy('id_grado')->get();
        $usuarios = Usuario::with(['rol', 'administrador', 'profesor.grado', 'estudiante.grado'])
            ->orderBy('id_usuario')
            ->get();
        $saberes = Saber::with('grado')->orderBy('id_saber')->get();
        $videos = Video::with('saber')->orderBy('id_video')->get();
        $evaluaciones = Evaluacion::with('saber')->orderBy('id_evaluacion')->get();

        return view('admin.index', compact('roles', 'grados', 'usuarios', 'saberes', 'videos', 'evaluaciones'));
    }

    public function storeUsuario(StoreUsuarioRequest $request): RedirectResponse
    {
        $data = $request->validated();

        DB::transaction(function () use ($data) {
            $usuario = Usuario::create([
                'nombre' => $data['nombre'],
                'apellido' => $data['apellido'],
                'email' => mb_strtolower($data['email']),
                'password_hash' => Hash::make($data['password']),
                'id_rol' => (int) $data['id_rol'],
            ]);

            if ((int) $data['id_rol'] === 1) {
                Administrador::create([
                    'id_usuario' => $usuario->id_usuario,
                    'nivel_acceso' => $data['nivel_acceso'] ?? 'Admin Académico',
                ]);
            } elseif ((int) $data['id_rol'] === 2) {
                Profesor::create([
                    'id_usuario' => $usuario->id_usuario,
                    'id_grado' => (int) ($data['id_grado'] ?? 1),
                    'especialidad' => $data['especialidad'] ?? 'Pedagogía General',
                ]);
            } elseif ((int) $data['id_rol'] === 3) {
                Estudiante::create([
                    'id_usuario' => $usuario->id_usuario,
                    'id_grado' => (int) ($data['id_grado'] ?? 1),
                    'codigo_estudiantil' => $data['codigo_estudiantil']
                        ?? 'EST-2026-' . str_pad((string) $usuario->id_usuario, 3, '0', STR_PAD_LEFT),
                ]);
            }
        });

        return back()->with('status', 'Usuario creado correctamente.');
    }

    public function destroyUsuario(int $id): RedirectResponse
    {
        $usuario = Usuario::findOrFail($id);
        if ($usuario->id_usuario === auth()->id()) {
            return back()->withErrors(['error' => 'No puedes eliminar tu propio usuario activo.']);
        }
        $usuario->delete();

        return back()->with('status', 'Usuario eliminado.');
    }

    public function storeGrado(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'nombre_grado' => ['required', 'string', 'max:50'],
            'seccion' => ['nullable', 'string', 'max:20'],
        ]);

        Grado::create($validated);

        return back()->with('status', 'Grado creado correctamente.');
    }

    public function destroyGrado(int $id): RedirectResponse
    {
        Grado::findOrFail($id)->delete();

        return back()->with('status', 'Grado eliminado.');
    }

    public function storeSaber(StoreSaberRequest $request): RedirectResponse
    {
        Saber::create($request->validated());

        return back()->with('status', 'Saber de aprendizaje creado.');
    }

    public function destroySaber(int $id): RedirectResponse
    {
        Saber::findOrFail($id)->delete();

        return back()->with('status', 'Saber eliminado.');
    }
}
