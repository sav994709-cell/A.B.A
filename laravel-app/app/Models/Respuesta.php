<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Respuesta extends Model
{
    protected $table = 'respuestas';
    protected $primaryKey = 'id_respuesta';
    public $timestamps = false;

    protected $fillable = [
        'enunciado_pregunta',
        'opcion_a',
        'opcion_b',
        'opcion_c',
        'id_evaluacion',
    ];

    public function evaluacion(): BelongsTo
    {
        return $this->belongsTo(Evaluacion::class, 'id_evaluacion', 'id_evaluacion');
    }

    public function respuestaCorrecta(): HasOne
    {
        return $this->hasOne(RespuestaCorrecta::class, 'id_respuesta', 'id_respuesta');
    }

    public function respuestasIncorrectas(): HasMany
    {
        return $this->hasMany(RespuestaIncorrecta::class, 'id_respuesta', 'id_respuesta');
    }
}
