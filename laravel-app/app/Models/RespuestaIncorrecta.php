<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RespuestaIncorrecta extends Model
{
    protected $table = 'respuesta_incorrecta';
    protected $primaryKey = 'id_respuesta_incorrecta';
    public $timestamps = false;

    protected $fillable = [
        'id_respuesta',
        'opcion_incorrecta',
        'retroalimentacion',
    ];

    public function pregunta(): BelongsTo
    {
        return $this->belongsTo(Respuesta::class, 'id_respuesta', 'id_respuesta');
    }
}
