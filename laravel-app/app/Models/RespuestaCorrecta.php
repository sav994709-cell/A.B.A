<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RespuestaCorrecta extends Model
{
    protected $table = 'respuesta_correcta';
    protected $primaryKey = 'id_respuesta_correcta';
    public $timestamps = false;

    protected $fillable = [
        'id_respuesta',
        'opcion_correcta',
        'explicacion',
    ];

    public function pregunta(): BelongsTo
    {
        return $this->belongsTo(Respuesta::class, 'id_respuesta', 'id_respuesta');
    }
}
