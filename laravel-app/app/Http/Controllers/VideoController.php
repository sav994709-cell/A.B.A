<?php

namespace App\Http\Controllers;

use App\Models\Video;
use Illuminate\View\View;

class VideoController extends Controller
{
    public function show(int $id): View
    {
        $video = Video::with(['saber.grado', 'saber.evaluaciones'])->findOrFail($id);

        $relacionados = Video::with('saber.grado')
            ->where('id_video', '!=', $video->id_video)
            ->orderByRaw('CASE WHEN EXISTS (SELECT 1 FROM saber WHERE saber.id_saber = video.id_saber AND saber.id_grado = ?) THEN 0 ELSE 1 END', [$video->saber->id_grado])
            ->limit(6)
            ->get();

        return view('videos.show', compact('video', 'relacionados'));
    }
}
