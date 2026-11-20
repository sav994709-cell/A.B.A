<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Saber extends Model
{
    protected $table = 'saber';
    protected $primaryKey = 'id_saber';
    public $timestamps = false;

    protected $fillable = [
        'titulo',
        'descripcion',
        'id_grado',
    ];

    public function grado(): BelongsTo
    {
        return $this->belongsTo(Grado::class, 'id_grado', 'id_grado');
    }

    public function videos(): HasMany
    {
        return $this->hasMany(Video::class, 'id_saber', 'id_saber');
    }

    public function evaluaciones(): HasMany
    {
        return $this->hasMany(Evaluacion::class, 'id_saber', 'id_saber');
    }
}
