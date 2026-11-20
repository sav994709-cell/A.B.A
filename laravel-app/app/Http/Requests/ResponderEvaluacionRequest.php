<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ResponderEvaluacionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'respuestas' => ['required', 'array', 'min:1'],
            'respuestas.*' => ['required', 'in:A,B,C'],
        ];
    }

    public function messages(): array
    {
        return [
            'respuestas.required' => 'Debes seleccionar una opción antes de enviar tu evaluación.',
            'respuestas.*.in' => 'Cada respuesta debe corresponder a la opción A, B o C.',
        ];
    }
}
