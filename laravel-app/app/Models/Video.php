<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Video extends Model
{
    protected $table = 'video';
    protected $primaryKey = 'id_video';
    public $timestamps = false;

    protected $fillable = [
        'titulo',
        'url_video',
        'duracion_segundos',
        'id_saber',
    ];

    public function saber(): BelongsTo
    {
        return $this->belongsTo(Saber::class, 'id_saber', 'id_saber');
    }
}
