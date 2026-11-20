<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSaberRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->tieneRol('Administrador') ?? false;
    }

    public function rules(): array
    {
        return [
            'titulo' => ['required', 'string', 'max:100'],
            'descripcion' => ['nullable', 'string'],
            'id_grado' => ['required', 'exists:grado,id_grado'],
        ];
    }
}
