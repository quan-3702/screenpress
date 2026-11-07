// ScreenPress recording worker: combines the screen and camera frames into one video track.
// Runs in a worker so recording keeps going smoothly while ScreenPress is in the background.
importScripts('draw.js');
var cfg = {}, canvas = null, ctx = null, writer = null, timer = null, t0 = 0;
var scr = null, cam = null, W = 0, H = 0, stopped = false;
function pump(readable, which) {
  var reader = readable.getReader();
  (function next() {
    reader.read().then(function (r) {
      if (r.done || stopped) { if (r.value) r.value.close(); return; }
      if (which === 's') { if (scr) scr.close(); scr = r.value; } else { if (cam) cam.close(); cam = r.value; }
      next();
    }).catch(function () {});
  })();
}
function tick() {
  if (stopped || !writer) return;
  try {
    spDraw(ctx, W, H, scr, cam, cfg);
    if (writer.desiredSize !== null && writer.desiredSize <= 0) return; // the recorder is busy: skip this frame
    var f = new VideoFrame(canvas, { timestamp: Math.round((performance.now() - t0) * 1000) });
    writer.write(f).catch(function () {});
  } catch (e) { postMessage({ type: 'error', message: String(e && e.message || e) }); }
}
onmessage = function (e) {
  var m = e.data;
  if (m.type === 'start') {
    cfg = m.cfg; W = m.w; H = m.h;
    canvas = new OffscreenCanvas(W, H); ctx = canvas.getContext('2d');
    writer = m.writable.getWriter();
    if (m.screen) pump(m.screen, 's');
    if (m.cam) pump(m.cam, 'c');
    t0 = performance.now();
    timer = setInterval(tick, 1000 / (m.fps || 30));
    postMessage({ type: 'started' });
  } else if (m.type === 'cfg') {
    for (var k in m.cfg) cfg[k] = m.cfg[k];
  } else if (m.type === 'cam') {
    if (cam) { cam.close(); cam = null; }
    if (m.cam) pump(m.cam, 'c');
  } else if (m.type === 'snap') {
    if (!canvas) return;
    createImageBitmap(canvas).then(function (b) { postMessage({ type: 'snap', bitmap: b }, [b]); }).catch(function () {});
  } else if (m.type === 'stop') {
    stopped = true; clearInterval(timer);
    if (scr) scr.close(); if (cam) cam.close(); scr = cam = null;
    try { writer.close().catch(function () {}); } catch (_) {}
    postMessage({ type: 'stopped' });
  }
};
