<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\EvaluacionController;
use App\Http\Controllers\ProfesorController;
use App\Http\Controllers\SaberController;
use App\Http\Controllers\VideoController;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => redirect()->route('saberes.index'));

Route::middleware('guest')->group(function () {
    Route::get('/login', [AuthController::class, 'showLogin'])->name('login');
    Route::post('/login', [AuthController::class, 'login'])->name('login.post');
    Route::post('/register', [AuthController::class, 'register'])->name('register.post');
});

Route::middleware('auth')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout'])->name('logout');

    // Rutas compartidas por los 3 roles autenticados
    Route::get('/saberes', [SaberController::class, 'index'])->name('saberes.index');
    Route::get('/saberes/{id}', [SaberController::class, 'show'])->name('saberes.show');
    Route::get('/videos/{id}', [VideoController::class, 'show'])->name('videos.show');
    Route::get('/evaluaciones/{id}', [EvaluacionController::class, 'show'])->name('evaluaciones.show');
    Route::post('/evaluaciones/{id}/responder', [EvaluacionController::class, 'responder'])
        ->middleware('role:Estudiante,Profesor,Administrador')
        ->name('evaluaciones.responder');

    Route::get('/progreso', [DashboardController::class, 'index'])->name('dashboard.index');

    // Panel exclusivo de Profesores y Administradores
    Route::middleware('role:Profesor,Administrador')->prefix('profesor')->name('profesor.')->group(function () {
        Route::get('/', [ProfesorController::class, 'index'])->name('index');
    });

    // Panel exclusivo de Administradores
    Route::middleware('role:Administrador')->prefix('admin')->name('admin.')->group(function () {
        Route::get('/', [AdminController::class, 'index'])->name('index');
        Route::post('/usuarios', [AdminController::class, 'storeUsuario'])->name('usuarios.store');
        Route::delete('/usuarios/{id}', [AdminController::class, 'destroyUsuario'])->name('usuarios.destroy');
        Route::post('/grados', [AdminController::class, 'storeGrado'])->name('grados.store');
        Route::delete('/grados/{id}', [AdminController::class, 'destroyGrado'])->name('grados.destroy');
        Route::post('/saberes', [AdminController::class, 'storeSaber'])->name('saberes.store');
        Route::delete('/saberes/{id}', [AdminController::class, 'destroySaber'])->name('saberes.destroy');
    });
});
