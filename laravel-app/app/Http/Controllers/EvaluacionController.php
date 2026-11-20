<?php

namespace App\Http\Controllers;

use App\Http\Requests\ResponderEvaluacionRequest;
use App\Models\Evaluacion;
use App\Models\Puntaje;
use Illuminate\Support\Facades\DB;
use Illuminate\View\View;

class EvaluacionController extends Controller
{
    public function show(int $id): View
    {
        $evaluacion = Evaluacion::with(['saber.grado', 'preguntas'])->findOrFail($id);

        return view('evaluaciones.show', compact('evaluacion'));
    }

    public function responder(ResponderEvaluacionRequest $request, int $id): View
    {
        $evaluacion = Evaluacion::with([
            'saber.grado',
            'preguntas.respuestaCorrecta',
            'preguntas.respuestasIncorrectas',
        ])->findOrFail($id);

        $respuestasEnviadas = $request->validated('respuestas');
        $aciertos = 0;
        $detalle = [];

        foreach ($evaluacion->preguntas as $pregunta) {
            $elegida = $respuestasEnviadas[$pregunta->id_respuesta] ?? null;
            $correcta = $pregunta->respuestaCorrecta;

            if (!$correcta) {
                abort(500, 'La pregunta no tiene respuesta correcta configurada.');
            }

            $esCorrecta = $elegida === $correcta->opcion_correcta;
            if ($esCorrecta) {
                $aciertos++;
                $mensaje = $correcta->explicacion ?? '¡Excelente trabajo! Respuesta correcta.';
            } else {
                $retro = $pregunta->respuestasIncorrectas
                    ->firstWhere('opcion_incorrecta', $elegida)
                    ?? $pregunta->respuestasIncorrectas->first();

                $mensaje = $retro?->retroalimentacion
                    ?? 'Respuesta incorrecta. Revisa el enunciado e inténtalo nuevamente.';
            }

            $detalle[] = [
                'pregunta' => $pregunta,
                'opcion_elegida' => $elegida,
                'opcion_correcta' => $correcta->opcion_correcta,
                'es_correcta' => $esCorrecta,
                'mensaje' => $mensaje,
            ];
        }

        $totalPreguntas = max(1, $evaluacion->preguntas->count());
        $calificacion = round(($aciertos / $totalPreguntas) * 5, 2);

        $puntaje = null;
        $estudiante = $request->user()->estudiante;
        if ($estudiante) {
            // Reemplazo seguro en Laravel del procedimiento defectuoso `insert_puntaje`
            $puntaje = DB::transaction(fn () => Puntaje::create([
                'id_estudiante' => $estudiante->id_estudiante,
                'id_evaluacion' => $evaluacion->id_evaluacion,
                'calificacion' => $calificacion,
                'fecha_realizacion' => now(),
            ]));
        }

        return view('evaluaciones.show', [
            'evaluacion' => $evaluacion,
            'resultado' => [
                'calificacion' => $calificacion,
                'porcentaje' => round(($aciertos / $totalPreguntas) * 100, 2),
                'aciertos' => $aciertos,
                'total' => $totalPreguntas,
                'puntaje' => $puntaje,
                'detalle' => $detalle,
            ],
        ]);
    }
}
