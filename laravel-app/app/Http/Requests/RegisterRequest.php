<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'nombre' => ['required', 'string', 'max:100'],
            'apellido' => ['required', 'string', 'max:100'],
            'email' => ['required', 'string', 'email', 'max:150', 'unique:usuario,email'],
            'password' => ['required', 'string', 'min:6'],
            'id_grado' => ['nullable', 'exists:grado,id_grado'],
        ];
    }

    public function messages(): array
    {
        return [
            'nombre.required' => 'Ingresa tu nombre.',
            'apellido.required' => 'Ingresa tu apellido.',
            'email.required' => 'El correo electrónico es obligatorio.',
            'email.email' => 'Ingresa un correo electrónico válido (ejemplo: nombre@correo.com).',
            'email.unique' => 'Este correo electrónico ya se encuentra registrado. Si la cuenta te pertenece, inicia sesión.',
            'password.required' => 'Ingresa una contraseña.',
            'password.min' => 'La contraseña debe tener al menos 6 caracteres.',
        ];
    }
}
