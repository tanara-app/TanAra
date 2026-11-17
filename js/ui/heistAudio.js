/*
  «سرقت بزرگ»: the sound. It listens to the game's event bus like the scene and the top bar do: `turn` (the thief's
  step, a lock) and `fx` (the landing, the safe, the alarm, the pulse, the smoke, the handcuffs, the getaway).
  The files are in assets/heist/audio (made with ElevenLabs on 2026-11-17; the list is in assets/heist/AUDIO_LOG.md). Nothing is fetched or played before the first tap, as phones require, and the member's
  choice of sound on or off is kept on the device.
*/
const DIR = 'assets/heist/audio/';
// file and how loud to play it (the recordings are not equally loud)
const SOUNDS = {
  step: ['step.mp3', 4.5], land: ['land.mp3', 3], safe: ['safe.mp3', 0.7], coins: ['coins.mp3', 0.8], alarm: ['alarm.mp3', 0.3],
  caught: ['caught.mp3', 0.8], emp: ['emp.mp3', 0.7], smoke: ['smoke.mp3', 0.35], pick: ['pick.mp3', 1.2], music: ['music.m4a', 0.26],
  decoy: ['decoy.mp3', 1.3], scan: ['scan.mp3', 0.35], lockpick: ['lockpick.m4a', 1.5],
};
const KEY = 'tanara:heist:sound';

export function createAudio(bus) {
  let ctx = null, master = null, on = true, alarm = null, music = null, closed = false;
  const buffers = {};
  try { on = localStorage.getItem(KEY) !== 'off'; } catch { /* private mode */ }

  // a file that fails is asked for once more a moment later (a busy server drops some of thirteen requests at once)
  async function load(name, tries = 2) {
    try {
      const res = await fetch(DIR + SOUNDS[name][0]);
      if (!res.ok) throw new Error(res.status);
      buffers[name] = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch (e) {
      if (tries <= 1 || closed) throw e;
      await new Promise(r => setTimeout(r, 900));
      return load(name, tries - 1);
    }
  }
  // Called from a tap: make the context and fetch the files (once).
  function unlock() {
    if (closed) return;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = on ? 1 : 0;
      master.connect(ctx.destination);
      for (const name of Object.keys(SOUNDS)) load(name).then(() => { if (name === 'music') startMusic(); }).catch(() => {});
    }
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
  }
  function play(name, { rate = 1, gain = 1, loop = false, delay = 0 } = {}) {
    if (!ctx || !buffers[name] || closed) return null;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buffers[name];
    src.playbackRate.value = rate;
    src.loop = loop;
    g.gain.value = SOUNDS[name][1] * gain;
    src.connect(g).connect(master);
    src.start(ctx.currentTime + delay);
    return { src, g };
  }
  function stop(node, fade = 0.25) {
    if (!node || !ctx) return;
    try { node.g.gain.setTargetAtTime(0, ctx.currentTime, fade / 3); node.src.stop(ctx.currentTime + fade); } catch { /* already stopped */ }
  }
  function startMusic() { if (!music) music = play('music', { loop: true }); }
  const vary = () => 0.92 + Math.random() * 0.16;   // a little pitch change, so the same sound twice isn't the same

  bus.on('turn', t => {
    const quick = t.speed > 1 ? 0.7 : 1;
    for (const e of t.events) {
      if (e.e === 'move') play('step', { rate: vary() * (t.next.alarm ? 1.25 : 1), gain: quick });
      // with the lockpick every door opens at the first touch; its own sound comes with the scene's 'lockpick' effect
      else if (e.e === 'pick' || (e.e === 'open' && !t.kit?.includes('lockpick'))) play('pick', { rate: e.e === 'open' ? 1.15 : vary(), gain: quick });
    }
    if (t.events.some(e => e.e === 'guard' && e.to !== e.from)) play('step', { rate: 0.72, gain: 0.35, delay: 0.22 / t.speed });
  });
  bus.on('fx', name => {
    if (name === 'land') play('land');
    else if (name === 'safe') { play('safe'); play('coins', { delay: 0.3 }); }
    else if (name === 'emp') play('emp');
    else if (name === 'smoke') play('smoke');
    else if (name === 'decoy') play('decoy');
    else if (name === 'lockpick') play('lockpick');
    else if (name === 'scan') play('scan');
    else if (name === 'alarm') { if (!alarm) alarm = play('alarm', { loop: true }); if (music) music.g.gain.setTargetAtTime(SOUNDS.music[1] * 0.35, ctx.currentTime, 0.1); }
    else if (name === 'calm' || name === 'caught' || name === 'escape' || name === 'fled') {
      stop(alarm); alarm = null;
      if (music && ctx) music.g.gain.setTargetAtTime(SOUNDS.music[1], ctx.currentTime, 0.4);
      if (name === 'caught') play('caught', { delay: 0.35 });
      if (name === 'escape') play('coins', { rate: 1.1 });
    }
  });

  const onHide = () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); };
  document.addEventListener('visibilitychange', onHide);

  return {
    unlock,
    get on() { return on; },
    toggle() {
      on = !on;
      try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
      if (master) master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05);
      return on;
    },
    get state() { return { context: ctx?.state || 'none', loaded: Object.keys(buffers), music: !!music, alarm: !!alarm, on }; },
    dispose() {
      closed = true;
      document.removeEventListener('visibilitychange', onHide);
      try { ctx?.close(); } catch { /* already closed */ }
      ctx = null;
    },
  };
}
