<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Puntaje extends Model
{
    protected $table = 'puntaje';
    protected $primaryKey = 'id_puntaje';
    public $timestamps = false;

    protected $fillable = [
        'id_estudiante',
        'id_evaluacion',
        'calificacion',
        'fecha_realizacion',
    ];

    protected $casts = [
        'calificacion' => 'decimal:2',
        'fecha_realizacion' => 'datetime',
    ];

    public function estudiante(): BelongsTo
    {
        return $this->belongsTo(Estudiante::class, 'id_estudiante', 'id_estudiante');
    }

    public function evaluacion(): BelongsTo
    {
        return $this->belongsTo(Evaluacion::class, 'id_evaluacion', 'id_evaluacion');
    }
}
