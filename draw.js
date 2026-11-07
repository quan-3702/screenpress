// ScreenPress – draws one video frame: the screen, the camera bubble and (free version) the small mark.
// Used by the recording worker (comp.js) and by the page itself when the worker path is not available.
var SP_SIZES = { s: 0.22, m: 0.3, l: 0.4 };
function spSize(s) {
  if (!s) return [0, 0];
  if (s.displayWidth) return [s.displayWidth, s.displayHeight];
  if (s.videoWidth) return [s.videoWidth, s.videoHeight];
  return [s.width || 0, s.height || 0];
}
function spCamRect(W, H, cfg) {
  var d = Math.round(H * (SP_SIZES[cfg.size] || 0.3));
  var m = Math.round(H * 0.035);
  var c = cfg.corner || 'br';
  var x = c[1] === 'l' ? m : W - m - d;
  var y = c[0] === 't' ? m : H - m - d;
  return { x: x, y: y, d: d };
}
function spShape(ctx, x, y, d, shape) {
  ctx.beginPath();
  if (shape === 'square') ctx.rect(x, y, d, d);
  else if (shape === 'rounded') { if (ctx.roundRect) ctx.roundRect(x, y, d, d, d * 0.18); else ctx.rect(x, y, d, d); }
  else ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2);
}
function spCover(ctx, src, x, y, w, h, mirror) {
  var s = spSize(src); var sw = s[0], sh = s[1];
  if (!sw || !sh) return;
  var k = Math.max(w / sw, h / sh);
  var cw = w / k, ch = h / k;
  var sx = (sw - cw) / 2, sy = (sh - ch) / 2;
  ctx.save();
  if (mirror) { ctx.translate(x * 2 + w, 0); ctx.scale(-1, 1); }
  ctx.drawImage(src, sx, sy, cw, ch, x, y, w, h);
  ctx.restore();
}
function spMark(ctx, W, H) {
  var fs = Math.max(12, Math.round(H * 0.022));
  var text = 'Recorded with ScreenPress';
  ctx.save();
  ctx.font = '600 ' + fs + 'px "Segoe UI", system-ui, sans-serif';
  var tw = ctx.measureText(text).width;
  var px = fs * 0.7, ph = fs * 1.7;
  var x = Math.round(W * 0.02), y = Math.round(H - H * 0.03 - ph);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, tw + px * 2, ph, ph / 2); else ctx.rect(x, y, tw + px * 2, ph);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + px, y + ph / 2);
  ctx.restore();
}
function spDraw(ctx, W, H, scr, cam, cfg) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (cfg.mode !== 'cam' && scr) {
    var s = spSize(scr);
    if (s[0] && s[1]) {
      var k = Math.min(W / s[0], H / s[1]);
      var dw = s[0] * k, dh = s[1] * k;
      ctx.drawImage(scr, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
  }
  if (cam && cfg.camOn !== false && cfg.mode !== 'screen') {
    if (cfg.mode === 'cam') spCover(ctx, cam, 0, 0, W, H, cfg.mirror);
    else {
      var r = spCamRect(W, H, cfg);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = r.d * 0.08; ctx.shadowOffsetY = r.d * 0.02;
      ctx.fillStyle = '#1f1b2e';
      spShape(ctx, r.x, r.y, r.d, cfg.shape); ctx.fill();
      ctx.restore();
      ctx.save();
      spShape(ctx, r.x, r.y, r.d, cfg.shape); ctx.clip();
      spCover(ctx, cam, r.x, r.y, r.d, r.d, cfg.mirror);
      ctx.restore();
      ctx.save();
      ctx.lineWidth = Math.max(2, r.d * 0.03);
      ctx.strokeStyle = cfg.ring || '#ffffff';
      var h = ctx.lineWidth / 2;
      spShape(ctx, r.x + h, r.y + h, r.d - ctx.lineWidth, cfg.shape); ctx.stroke();
      ctx.restore();
    }
  }
  if (cfg.wm) spMark(ctx, W, H);
}
