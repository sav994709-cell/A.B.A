import React, { useEffect, useRef } from 'react';
import type { DidacticLessonPlan, DidacticTopicKey, TimelineSegment } from '../lib/didacticLessons';

interface DidacticVideoCanvasProps {
  plan: DidacticLessonPlan;
  segment: TimelineSegment;
  playing: boolean;
  canvasRefExternal?: React.RefObject<HTMLCanvasElement | null>;
}

const COLORS = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  grid: 'rgba(148, 163, 184, 0.16)',
  border: '#CBD5E1',
  ink: '#0F172A',
  muted: '#475569',
  blue: '#0284C7',
  blueSoft: '#E0F2FE',
  amber: '#D97706',
  amberSoft: '#FEF3C7',
  emerald: '#059669',
  emeraldSoft: '#D1FAE5',
  coral: '#DC2626',
  coralSoft: '#FEE2E2',
  violet: '#7C3AED',
  violetSoft: '#EDE9FE',
  indigo: '#1E40AF',
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function easeInOut(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawToken(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  fill: string,
  stroke: string,
  label?: string,
  alpha = 1
) {
  ctx.save();
  ctx.globalAlpha = clamp01(alpha);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  if (label) {
    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 16px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 1);
  }
  ctx.restore();
}

function drawSceneSumas(
  ctx: CanvasRenderingContext2D,
  sceneIdx: 0 | 1 | 2,
  p: number
) {
  const move = easeInOut(clamp01(p / 0.7));
  if (sceneIdx === 0) {
    // Contexto: dos conjuntos separados
    ctx.save();
    drawRoundedRect(ctx, 90, 145, 310, 220, 16);
    ctx.fillStyle = COLORS.blueSoft;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.blue;
    ctx.stroke();

    drawRoundedRect(ctx, 560, 145, 310, 220, 16);
    ctx.fillStyle = COLORS.amberSoft;
    ctx.fill();
    ctx.strokeStyle = COLORS.amber;
    ctx.stroke();

    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Grupo A: 3 unidades', 245, 178);
    ctx.fillText('Grupo B: 2 unidades', 715, 178);

    // Operador +
    ctx.fillStyle = COLORS.muted;
    ctx.font = '700 44px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('+', 480, 260);

    for (let i = 0; i < 3; i++) {
      const appear = clamp01((p - i * 0.1) * 3);
      drawToken(ctx, 165 + i * 80, 268, 26, '#BAE6FD', COLORS.blue, String(i + 1), appear);
    }
    for (let j = 0; j < 2; j++) {
      const appear = clamp01((p - 0.25 - j * 0.1) * 3);
      drawToken(ctx, 665 + j * 100, 268, 26, '#FDE68A', COLORS.amber, String(j + 1), appear);
    }
    ctx.restore();
    return;
  }

  if (sceneIdx === 1) {
    // Mecanismo: ambas colecciones viajan suavemente al marco unificado y se cuentan 1..5
    ctx.save();
    drawRoundedRect(ctx, 130, 145, 700, 220, 18);
    ctx.fillStyle = COLORS.surface;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = move > 0.85 ? COLORS.emerald : COLORS.border;
    ctx.stroke();

    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(move > 0.75 ? 'Conjunto unido: contamos del 1 al 5' : 'Reuniendo Grupo A y Grupo B...', 480, 180);

    const startA = [165, 245, 325];
    const targetA = [220, 350, 480];
    for (let i = 0; i < 3; i++) {
      const x = lerp(startA[i], targetA[i], move);
      const countAlpha = clamp01((p - 0.45 - i * 0.08) * 5);
      drawToken(ctx, x, 262, 28, '#BAE6FD', COLORS.blue, countAlpha > 0.3 ? String(i + 1) : '');
    }

    const startB = [665, 765];
    const targetB = [610, 740];
    for (let j = 0; j < 2; j++) {
      const x = lerp(startB[j], targetB[j], move);
      const countAlpha = clamp01((p - 0.65 - j * 0.08) * 5);
      drawToken(ctx, x, 262, 28, '#FDE68A', COLORS.amber, countAlpha > 0.3 ? String(4 + j) : '');
    }

    if (p > 0.72) {
      ctx.fillStyle = COLORS.emerald;
      ctx.font = '700 22px "IBM Plex Mono", monospace';
      ctx.fillText('Total = 5 unidades', 480, 336);
    }
    ctx.restore();
    return;
  }

  // Aplicación: ecuación + segundo ejemplo 2 + 2 = 4
  ctx.save();
  drawRoundedRect(ctx, 90, 140, 780, 105, 14);
  ctx.fillStyle = COLORS.emeraldSoft;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.emerald;
  ctx.stroke();

  ctx.fillStyle = COLORS.ink;
  ctx.font = '700 32px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('3  +  2  =  5', 480, 198);

  const exAlpha = easeInOut(clamp01((p - 0.15) * 2));
  ctx.globalAlpha = exAlpha;
  drawRoundedRect(ctx, 90, 270, 780, 115, 14);
  ctx.fillStyle = COLORS.surface;
  ctx.fill();
  ctx.strokeStyle = COLORS.border;
  ctx.stroke();

  ctx.fillStyle = COLORS.muted;
  ctx.font = '600 15px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Aplicación directa al ejemplo: 2 + 2 = 4', 480, 300);

  for (let i = 0; i < 2; i++) {
    drawToken(ctx, 310 + i * 70, 344, 20, '#BAE6FD', COLORS.blue, String(i + 1));
  }
  ctx.fillStyle = COLORS.ink;
  ctx.font = '700 24px "IBM Plex Mono", monospace';
  ctx.fillText('+', 445, 345);
  for (let j = 0; j < 2; j++) {
    drawToken(ctx, 510 + j * 70, 344, 20, '#FDE68A', COLORS.amber, String(3 + j));
  }
  ctx.fillStyle = COLORS.emerald;
  ctx.fillText('=  4', 655, 345);
  ctx.restore();
}

function drawSceneRestas(ctx: CanvasRenderingContext2D, sceneIdx: 0 | 1 | 2, p: number) {
  const move = easeInOut(clamp01(p / 0.7));
  ctx.save();
  drawRoundedRect(ctx, 110, 150, 740, 210, 16);
  ctx.fillStyle = COLORS.surface;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = sceneIdx === 2 ? COLORS.emerald : COLORS.border;
  ctx.stroke();

  ctx.fillStyle = COLORS.ink;
  ctx.font = '700 18px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';

  if (sceneIdx === 0) {
    ctx.fillText('Colección inicial: 5 unidades completas', 480, 185);
    for (let i = 0; i < 5; i++) {
      const a = clamp01((p - i * 0.08) * 3.5);
      drawToken(ctx, 220 + i * 130, 265, 30, '#BAE6FD', COLORS.blue, String(i + 1), a);
    }
  } else if (sceneIdx === 1) {
    ctx.fillText('Retiramos 2 unidades (-2)', 480, 185);
    for (let i = 0; i < 3; i++) {
      drawToken(ctx, 220 + i * 130, 265, 30, '#BAE6FD', COLORS.blue, String(i + 1));
    }
    for (let j = 0; j < 2; j++) {
      const startX = 220 + (3 + j) * 130;
      // Huella original
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(startX, 265, 30, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.coral;
      ctx.stroke();
      ctx.restore();
      const y = lerp(265, 395, move);
      drawToken(ctx, startX, y, 26, COLORS.coralSoft, COLORS.coral, '-1', 1 - move * 0.25);
    }
  } else {
    ctx.fillText('Resultado restante: quedan 3 unidades', 480, 185);
    for (let i = 0; i < 3; i++) {
      drawToken(ctx, 320 + i * 160, 258, 32, COLORS.emeraldSoft, COLORS.emerald, String(i + 1));
    }
    ctx.fillStyle = COLORS.emerald;
    ctx.font = '700 30px "IBM Plex Mono", monospace';
    ctx.fillText('5  -  2  =  3', 480, 336);
  }
  ctx.restore();
}

function drawSceneConteo(ctx: CanvasRenderingContext2D, sceneIdx: 0 | 1 | 2, p: number) {
  ctx.save();
  const yLine = 315;
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(90, yLine);
  ctx.lineTo(870, yLine);
  ctx.stroke();

  const activeCount =
    sceneIdx === 0 ? Math.max(1, Math.round(lerp(1, 3, easeInOut(p)))) :
    sceneIdx === 1 ? Math.max(1, Math.round(lerp(1, 10, easeInOut(clamp01(p / 0.85))))) :
    3;

  for (let n = 1; n <= 10; n++) {
    const x = 115 + (n - 1) * 81;
    const active = n <= activeCount;
    ctx.beginPath();
    ctx.moveTo(x, yLine - 10);
    ctx.lineTo(x, yLine + 10);
    ctx.strokeStyle = active ? COLORS.blue : COLORS.border;
    ctx.lineWidth = active ? 3 : 2;
    ctx.stroke();

    ctx.fillStyle = active ? COLORS.ink : COLORS.muted;
    ctx.font = active ? '700 18px "IBM Plex Mono", monospace' : '500 16px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(n), x, yLine + 34);

    if (active) {
      const col = n === activeCount ? COLORS.emerald : COLORS.blue;
      const fill = n === activeCount ? COLORS.emeraldSoft : COLORS.blueSoft;
      drawToken(ctx, x, 225, 22, fill, col, String(n));
    }
  }

  ctx.fillStyle = COLORS.ink;
  ctx.font = '700 22px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  const heading =
    sceneIdx === 0 ? `Cada ficha corresponde a un número (${activeCount})` :
    sceneIdx === 1 ? `Secuencia progresiva (+1 cada paso): ${activeCount} / 10` :
    'Ejemplo de conteo exacto: 3 unidades = posición 3';
  ctx.fillText(heading, 480, 155);
  ctx.restore();
}

function drawSceneColores(ctx: CanvasRenderingContext2D, sceneIdx: 0 | 1 | 2, p: number) {
  ctx.save();
  const move = easeInOut(clamp01(p / 0.7));
  if (sceneIdx === 0) {
    const items = [
      { label: 'Amarillo', fill: '#FACC15', x: 240 },
      { label: 'Azul', fill: '#0284C7', x: 480 },
      { label: 'Rojo', fill: '#DC2626', x: 720 },
    ];
    items.forEach((it, idx) => {
      const a = clamp01((p - idx * 0.15) * 3);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(it.x, 250, 66, 0, Math.PI * 2);
      ctx.fillStyle = it.fill;
      ctx.fill();
      ctx.fillStyle = COLORS.ink;
      ctx.font = '700 17px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(it.label, it.x, 345);
      ctx.restore();
    });
  } else if (sceneIdx === 1) {
    const x1 = lerp(310, 425, move);
    const x2 = lerp(650, 535, move);
    ctx.globalAlpha = 0.78;
    ctx.beginPath();
    ctx.arc(x1, 248, 86, 0, Math.PI * 2);
    ctx.fillStyle = '#FACC15';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x2, 248, 86, 0, Math.PI * 2);
    ctx.fillStyle = '#0284C7';
    ctx.fill();
    ctx.globalAlpha = 1;

    if (move > 0.6) {
      drawRoundedRect(ctx, 415, 200, 130, 96, 48);
      ctx.fillStyle = '#16A34A';
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 16px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Verde', 480, 252);
    }

    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Amarillo + Azul → Verde (color secundario)', 480, 372);
  } else {
    const pairs = [
      { left: '#FACC15', right: '#0284C7', res: '#16A34A', text: 'Amarillo + Azul = Verde', y: 185 },
      { left: '#FACC15', right: '#DC2626', res: '#EA580C', text: 'Amarillo + Rojo = Naranja', y: 260 },
      { left: '#0284C7', right: '#DC2626', res: '#7C3AED', text: 'Azul + Rojo = Violeta', y: 335 },
    ];
    pairs.forEach((row) => {
      drawToken(ctx, 240, row.y, 20, row.left, COLORS.border);
      ctx.fillStyle = COLORS.ink;
      ctx.font = '700 20px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('+', 295, row.y + 2);
      drawToken(ctx, 350, row.y, 20, row.right, COLORS.border);
      ctx.fillText('=', 405, row.y + 2);
      drawToken(ctx, 460, row.y, 22, row.res, COLORS.ink);
      ctx.textAlign = 'left';
      ctx.font = '600 16px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(row.text, 505, row.y + 5);
    });
  }
  ctx.restore();
}

function drawSceneFiguras(ctx: CanvasRenderingContext2D, sceneIdx: 0 | 1 | 2, p: number) {
  ctx.save();
  if (sceneIdx === 0 || sceneIdx === 1) {
    // Cuadrado
    const sqX = 160;
    const sqY = 175;
    const sqS = 145;
    ctx.strokeStyle = COLORS.blue;
    ctx.lineWidth = 4;
    ctx.fillStyle = COLORS.blueSoft;
    ctx.fillRect(sqX, sqY, sqS, sqS);
    ctx.strokeRect(sqX, sqY, sqS, sqS);

    // Triángulo
    ctx.beginPath();
    ctx.moveTo(480, 170);
    ctx.lineTo(565, 320);
    ctx.lineTo(395, 320);
    ctx.closePath();
    ctx.fillStyle = COLORS.amberSoft;
    ctx.fill();
    ctx.strokeStyle = COLORS.amber;
    ctx.stroke();

    // Círculo
    ctx.beginPath();
    ctx.arc(730, 245, 74, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.emeraldSoft;
    ctx.fill();
    ctx.strokeStyle = COLORS.emerald;
    ctx.stroke();

    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 16px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Cuadrado (4 esquinas)', 232, 360);
    ctx.fillText('Triángulo (3 esquinas)', 480, 360);
    ctx.fillText('Círculo (0 esquinas)', 730, 360);

    if (sceneIdx === 1) {
      // Punto trazador animado en cuadrado y círculo
      const edgeT = (p * 4) % 4;
      let px = sqX;
      let py = sqY;
      if (edgeT < 1) {
        px = lerp(sqX, sqX + sqS, edgeT);
        py = sqY;
      } else if (edgeT < 2) {
        px = sqX + sqS;
        py = lerp(sqY, sqY + sqS, edgeT - 1);
      } else if (edgeT < 3) {
        px = lerp(sqX + sqS, sqX, edgeT - 2);
        py = sqY + sqS;
      } else {
        px = sqX;
        py = lerp(sqY + sqS, sqY, edgeT - 3);
      }
      drawToken(ctx, px, py, 8, COLORS.coral, '#FFFFFF');

      const angle = p * Math.PI * 2 - Math.PI / 2;
      drawToken(ctx, 730 + Math.cos(angle) * 74, 245 + Math.sin(angle) * 74, 8, COLORS.emerald, '#FFFFFF');
    }
  } else {
    drawRoundedRect(ctx, 110, 155, 350, 210, 16);
    ctx.fillStyle = COLORS.surface;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.blue;
    ctx.stroke();

    drawRoundedRect(ctx, 500, 155, 350, 210, 16);
    ctx.fillStyle = COLORS.emeraldSoft;
    ctx.fill();
    ctx.strokeStyle = COLORS.emerald;
    ctx.stroke();

    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Con esquinas (vértices)', 285, 195);
    ctx.fillText('Sin esquinas (curva continua)', 675, 195);
    ctx.font = '500 15px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('Cuadrado (4) · Triángulo (3)', 285, 255);
    ctx.fillText('Círculo (0 vértices)', 675, 255);
  }
  ctx.restore();
}

function drawSceneReloj(ctx: CanvasRenderingContext2D, sceneIdx: 0 | 1 | 2, p: number) {
  ctx.save();
  const cx = 340;
  const cy = 260;
  const r = 115;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.surface;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.ink;
  ctx.stroke();

  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.fillStyle = h === 3 || h === 12 ? COLORS.indigo : COLORS.ink;
    ctx.font = h === 3 || h === 12 ? '700 16px "IBM Plex Mono", monospace' : '600 14px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(h), cx + Math.cos(a) * (r - 22), cy + Math.sin(a) * (r - 22));
  }

  const move = easeInOut(clamp01(p / 0.75));
  const hourNum = sceneIdx === 0 ? 2 : sceneIdx === 1 ? lerp(2, 3, move) : 3;
  const minTurns = sceneIdx === 1 ? move : 0;

  const hourAngle = (hourNum / 12) * Math.PI * 2 - Math.PI / 2;
  const minAngle = minTurns * Math.PI * 2 - Math.PI / 2;

  // Manecilla corta (horas)
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(hourAngle) * 56, cy + Math.sin(hourAngle) * 56);
  ctx.strokeStyle = COLORS.blue;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Manecilla larga (minutos)
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(minAngle) * 86, cy + Math.sin(minAngle) * 86);
  ctx.strokeStyle = COLORS.emerald;
  ctx.lineWidth = 4;
  ctx.stroke();

  drawToken(ctx, cx, cy, 6, COLORS.ink, COLORS.ink);

  // Panel derecho explicativo breve
  drawRoundedRect(ctx, 510, 165, 340, 190, 16);
  ctx.fillStyle = COLORS.surface;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.border;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.blue;
  ctx.font = '700 16px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Manecilla corta → Hora', 540, 210);
  ctx.fillStyle = COLORS.emerald;
  ctx.fillText('Manecilla larga → Minutos', 540, 245);
  ctx.fillStyle = COLORS.ink;
  ctx.font = '700 28px "IBM Plex Mono", monospace';
  const clockLabel = sceneIdx === 0 ? '02:00' : sceneIdx === 1 && move < 0.9 ? 'Avanzando...' : '03:00';
  ctx.fillText(clockLabel, 540, 310);
  ctx.restore();
}

function drawSceneTextBlocks(
  ctx: CanvasRenderingContext2D,
  topic: DidacticTopicKey,
  sceneIdx: 0 | 1 | 2,
  p: number
) {
  ctx.save();
  const move = easeInOut(clamp01(p / 0.7));

  if (topic === 'vocales') {
    const items = [
      { v: 'A', word: 'Avión' },
      { v: 'E', word: 'Estrella' },
      { v: 'I', word: 'Isla' },
      { v: 'O', word: 'Oso' },
      { v: 'U', word: 'Uva' },
    ];
    items.forEach((item, idx) => {
      const x = 140 + idx * 170;
      const highlight = sceneIdx === 0 || (sceneIdx === 1 && idx <= 2) || sceneIdx === 2;
      drawToken(ctx, x, 220, 34, highlight ? COLORS.blueSoft : COLORS.surface, highlight ? COLORS.blue : COLORS.border, item.v);
      if (sceneIdx >= 1) {
        ctx.fillStyle = COLORS.ink;
        ctx.font = '600 16px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.word, x, 295);
      }
    });
  } else if (topic === 'abc') {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const activeIdx = sceneIdx === 0 ? -1 : sceneIdx === 1 ? Math.min(5, Math.floor(p * 6)) : 1;
    letters.forEach((ch, idx) => {
      const x = 155 + idx * 130;
      const isTarget = idx === activeIdx;
      const fill = isTarget ? COLORS.emeraldSoft : idx === 0 || idx === 4 ? COLORS.blueSoft : COLORS.surface;
      const stroke = isTarget ? COLORS.emerald : idx === 0 || idx === 4 ? COLORS.blue : COLORS.border;
      drawToken(ctx, x, 245, 34, fill, stroke, sceneIdx === 2 && idx === 1 && move < 0.4 ? '?' : ch);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = '600 16px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      sceneIdx === 2 ? 'Entre A y C siempre sigue B' : 'Azul: vocales · Gris: consonantes ordenadas',
      480,
      335
    );
  } else if (topic === 'silabas') {
    if (sceneIdx === 0) {
      drawToken(ctx, 290, 250, 42, COLORS.blueSoft, COLORS.blue, 'M');
      ctx.fillStyle = COLORS.muted;
      ctx.font = '700 32px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('+', 400, 258);
      ['a', 'e', 'i', 'o', 'u'].forEach((v, i) => {
        drawToken(ctx, 515 + i * 75, 250, 24, COLORS.amberSoft, COLORS.amber, v);
      });
    } else if (sceneIdx === 1) {
      ['Ma', 'Me', 'Mi', 'Mo', 'Mu'].forEach((syl, i) => {
        const a = clamp01((p - i * 0.12) * 3);
        drawToken(ctx, 180 + i * 150, 250, 34, COLORS.emeraldSoft, COLORS.emerald, syl, a);
      });
    } else {
      const mx = lerp(290, 415, move);
      const sx = lerp(670, 525, move);
      drawRoundedRect(ctx, mx - 55, 210, 110, 72, 14);
      ctx.fillStyle = COLORS.blueSoft;
      ctx.fill();
      ctx.strokeStyle = COLORS.blue;
      ctx.lineWidth = 2;
      ctx.stroke();

      drawRoundedRect(ctx, sx - 55, 210, 110, 72, 14);
      ctx.fillStyle = COLORS.amberSoft;
      ctx.fill();
      ctx.strokeStyle = COLORS.amber;
      ctx.stroke();

      ctx.fillStyle = COLORS.ink;
      ctx.font = '700 26px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Me', mx, 255);
      ctx.fillText('sa', sx, 255);

      if (move > 0.75) {
        ctx.fillStyle = COLORS.emerald;
        ctx.font = '700 28px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText('Mesa', 480, 340);
      }
    }
  } else if (topic === 'animales') {
    drawRoundedRect(ctx, 110, 155, 340, 210, 16);
    ctx.fillStyle = COLORS.emeraldSoft;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.emerald;
    ctx.stroke();

    drawRoundedRect(ctx, 510, 155, 340, 210, 16);
    ctx.fillStyle = COLORS.amberSoft;
    ctx.fill();
    ctx.strokeStyle = COLORS.amber;
    ctx.stroke();

    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Domésticos (Hogar)', 280, 195);
    ctx.fillText('Silvestres (Selva / Océano)', 680, 195);

    if (sceneIdx >= 1) {
      ctx.font = '600 16px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = COLORS.emerald;
      ctx.fillText('Perro · Gato', 280, 265);
      ctx.fillStyle = COLORS.amber;
      ctx.fillText('Tigre · Tiburón', 680, 265);
    }
  } else {
    // Escena genérica estructurada en 3 nodos progresivos (Contexto -> Mecanismo -> Resultado)
    const nodes = [
      { x: 200, label: '1. Contexto', fill: COLORS.blueSoft, stroke: COLORS.blue },
      { x: 480, label: '2. Cambio', fill: COLORS.amberSoft, stroke: COLORS.amber },
      { x: 760, label: '3. Resultado', fill: COLORS.emeraldSoft, stroke: COLORS.emerald },
    ];
    nodes.forEach((n, idx) => {
      const active = idx <= sceneIdx;
      drawRoundedRect(ctx, n.x - 95, 205, 190, 96, 14);
      ctx.fillStyle = active ? n.fill : COLORS.surface;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = active ? n.stroke : COLORS.border;
      ctx.stroke();
      ctx.fillStyle = COLORS.ink;
      ctx.font = '700 16px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(n.label, n.x, 258);
    });
  }
  ctx.restore();
}

export const DidacticVideoCanvas: React.FC<DidacticVideoCanvasProps> = ({
  plan,
  segment,
  playing,
  canvasRefExternal,
}) => {
  const internalRef = useRef<HTMLCanvasElement | null>(null);
  const targetRef = canvasRefExternal || internalRef;

  useEffect(() => {
    const canvas = targetRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 960;
    const height = 540;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Fondo limpio y cuadrícula técnica tenue
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let x = 40; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 40; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 2. Cabecera didáctica sobria
    ctx.fillStyle = COLORS.surface;
    ctx.fillRect(0, 0, width, 86);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 86);
    ctx.lineTo(width, 86);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.indigo;
    ctx.font = '700 13px "IBM Plex Mono", monospace';
    ctx.fillText(`${segment.scene.stepLabel}  ·  ${playing ? 'REPRODUCIENDO' : 'EN PAUSA'}`, 40, 32);

    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 22px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(plan.conceptTitle, 40, 64);

    // Subtítulo del acto a la derecha
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.muted;
    ctx.font = '600 14px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(segment.scene.shortTitle, width - 40, 62);

    // 3. Escena visual central según el tema
    const { topicKey } = plan;
    if (topicKey === 'sumas') {
      drawSceneSumas(ctx, segment.sceneIndex, segment.sceneProgress);
    } else if (topicKey === 'restas') {
      drawSceneRestas(ctx, segment.sceneIndex, segment.sceneProgress);
    } else if (topicKey === 'conteo') {
      drawSceneConteo(ctx, segment.sceneIndex, segment.sceneProgress);
    } else if (topicKey === 'colores') {
      drawSceneColores(ctx, segment.sceneIndex, segment.sceneProgress);
    } else if (topicKey === 'figuras') {
      drawSceneFiguras(ctx, segment.sceneIndex, segment.sceneProgress);
    } else if (topicKey === 'reloj') {
      drawSceneReloj(ctx, segment.sceneIndex, segment.sceneProgress);
    } else {
      drawSceneTextBlocks(ctx, topicKey, segment.sceneIndex, segment.sceneProgress);
    }

    // 4. Franja inferior de síntesis causa-efecto (sobria, sin decoración)
    ctx.fillStyle = COLORS.surface;
    ctx.fillRect(0, 434, width, 106);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 434);
    ctx.lineTo(width, 434);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.ink;
    ctx.font = '600 16px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(segment.scene.narration, 40, 472, width - 80);

    ctx.fillStyle = COLORS.indigo;
    ctx.font = '600 14px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(`Idea clave: ${segment.scene.causeEffectNote}`, 40, 504, width - 80);

    // Barra sutil de avance del acto actual en el borde inferior
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(0, height - 4, width, 4);
    ctx.fillStyle = COLORS.blue;
    ctx.fillRect(0, height - 4, width * segment.overallProgress, 4);

    ctx.restore();
  }, [plan, segment, playing, targetRef]);

  return (
    <canvas
      ref={targetRef}
      aria-label={`Lienzo animado educativo: ${plan.conceptTitle} - ${segment.scene.shortTitle}`}
      className="w-full h-auto aspect-video block bg-[#F8FAFC]"
    />
  );
};
