/**
 * frontend/src/utils/chatSound.ts
 * Asella Organic — Web Audio Synthesizer for Internal Chat Notifications
 *
 * Synthesizes a clean, pleasant notification chime via Web Audio API.
 * Does not depend on external .mp3 files, CORS, or bundle mime types.
 * Unlocks automatically upon first user gesture.
 */

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioCtx();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

// Global user-gesture unlocker so sound plays reliably
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch {
      /* silent */
    }
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
}

export function isChatSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('asella_chat_sound_enabled') !== 'false';
}

export function setChatSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('asella_chat_sound_enabled', enabled ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent('asella:chat-sound-toggle', { detail: { enabled } }));
}

/**
 * Plays a pleasant, harmonic, modern two-tone chime (587.33 Hz [D5] -> 880 Hz [A5])
 * Synthesized purely with Web Audio API. Zero external assets, zero network latency.
 */
export function playChatSound(force = false): void {
  if (!force && !isChatSoundEnabled()) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const playTone = () => {
      const now = ctx.currentTime;

      // Note 1: D5 (587.33 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.25);

      // Note 2: A5 (880 Hz) - higher, crisp tone
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.0, now + 0.09);
      gain2.gain.setValueAtTime(0.18, now + 0.09);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.09);
      osc2.stop(now + 0.48);

      // Subtle warm harmonic (C#6 1108.73 Hz)
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'triangle';
      osc3.frequency.setValueAtTime(1108.73, now + 0.12);
      gain3.gain.setValueAtTime(0.06, now + 0.12);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.40);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(now + 0.12);
      osc3.stop(now + 0.42);
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(playTone).catch(() => {});
    } else {
      playTone();
    }
  } catch {
    /* silent */
  }
}
