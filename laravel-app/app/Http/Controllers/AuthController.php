<?php

namespace App\Http\Controllers;

use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Models\Estudiante;
use App\Models\Grado;
use App\Models\Usuario;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\View\View;

class AuthController extends Controller
{
    public function showLogin(): View
    {
        $grados = Grado::orderBy('id_grado')->get();

        return view('auth.login', compact('grados'));
    }

    public function login(LoginRequest $request): RedirectResponse
    {
        $usuario = Usuario::with('rol')
            ->where('email', mb_strtolower($request->validated('email')))
            ->first();

        if (!$usuario || !Hash::check($request->validated('password'), $usuario->password_hash)) {
            return back()
                ->withErrors(['email' => 'Credenciales inválidas. Verifica tu correo y contraseña.'])
                ->onlyInput('email');
        }

        Auth::login($usuario, $request->boolean('remember'));
        $request->session()->regenerate();

        if ($usuario->tieneRol('Administrador')) {
            return redirect()->route('admin.index');
        }
        if ($usuario->tieneRol('Profesor')) {
            return redirect()->route('profesor.index');
        }

        return redirect()->route('saberes.index');
    }

    public function register(RegisterRequest $request): RedirectResponse
    {
        $data = $request->validated();

        $usuario = DB::transaction(function () use ($data) {
            $user = Usuario::create([
                'nombre' => trim($data['nombre']),
                'apellido' => trim($data['apellido']),
                'email' => mb_strtolower(trim($data['email'])),
                'password_hash' => Hash::make($data['password']),
                'id_rol' => 3, // Rol Estudiante por defecto
            ]);

            Estudiante::create([
                'id_usuario' => $user->id_usuario,
                'id_grado' => (int) ($data['id_grado'] ?? 1),
                'codigo_estudiantil' => 'EST-2026-' . str_pad((string) $user->id_usuario, 3, '0', STR_PAD_LEFT),
            ]);

            return $user;
        });

        Auth::login($usuario);
        $request->session()->regenerate();

        return redirect()
            ->route('saberes.index')
            ->with('status', '¡Registro exitoso! Tu cuenta de estudiante en A.B.A. ha sido creada correctamente.');
    }

    public function logout(Request $request): RedirectResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login');
    }
}
