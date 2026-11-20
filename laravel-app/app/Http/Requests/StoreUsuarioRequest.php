<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreUsuarioRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->tieneRol('Administrador') ?? false;
    }

    public function rules(): array
    {
        $usuarioId = $this->route('usuario');

        return [
            'nombre' => ['required', 'string', 'max:100'],
            'apellido' => ['required', 'string', 'max:100'],
            'email' => [
                'required',
                'email',
                'max:150',
                Rule::unique('usuario', 'email')->ignore($usuarioId, 'id_usuario'),
            ],
            'password' => [$this->isMethod('post') ? 'required' : 'nullable', 'string', 'min:6'],
            'id_rol' => ['required', 'exists:rol,id_rol'],
            'id_grado' => ['nullable', 'exists:grado,id_grado'],
            'codigo_estudiantil' => ['nullable', 'string', 'max:20'],
            'especialidad' => ['nullable', 'string', 'max:100'],
            'nivel_acceso' => ['nullable', 'string', 'max:50'],
        ];
    }
}
