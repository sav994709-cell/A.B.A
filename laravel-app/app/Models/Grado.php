<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Grado extends Model
{
    protected $table = 'grado';
    protected $primaryKey = 'id_grado';
    public $timestamps = false;

    protected $fillable = [
        'nombre_grado',
        'seccion',
    ];

    public function saberes(): HasMany
    {
        return $this->hasMany(Saber::class, 'id_grado', 'id_grado');
    }

    public function estudiantes(): HasMany
    {
        return $this->hasMany(Estudiante::class, 'id_grado', 'id_grado');
    }

    public function profesores(): HasMany
    {
        return $this->hasMany(Profesor::class, 'id_grado', 'id_grado');
    }
}
