<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Evaluacion extends Model
{
    protected $table = 'evaluacion';
    protected $primaryKey = 'id_evaluacion';
    public $timestamps = false;

    protected $fillable = [
        'titulo',
        'instrucciones',
        'id_saber',
    ];

    public function saber(): BelongsTo
    {
        return $this->belongsTo(Saber::class, 'id_saber', 'id_saber');
    }

    public function preguntas(): HasMany
    {
        return $this->hasMany(Respuesta::class, 'id_evaluacion', 'id_evaluacion');
    }

    public function puntajes(): HasMany
    {
        return $this->hasMany(Puntaje::class, 'id_evaluacion', 'id_evaluacion');
    }
}
