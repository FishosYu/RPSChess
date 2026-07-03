export type SfxId = 'click' | 'broke' | 'fight' | 'win' | 'lose'

const FILES: Record<SfxId, string> = {
  click: 'button-click.mp3',
  broke: 'broke.mp3',
  fight: 'fight.mp3',
  win: 'win.mp3',
  lose: 'lose.mp3',
}

const VOLUME: Record<SfxId, number> = {
  click: 0.55,
  broke: 0.68,
  fight: 0.72,
  win: 0.8,
  lose: 0.8,
}

function sfxUrl(file: string): string {
  const base = import.meta.env.BASE_URL ?? '/'
  return `${base}sfx/${file}`
}

let shared: GameSfx | null = null

export function getGameSfx(): GameSfx {
  if (!shared) shared = new GameSfx()
  return shared
}

export class GameSfx {
  private readonly pool = new Map<SfxId, HTMLAudioElement[]>()

  constructor() {
    if (typeof Audio === 'undefined') return
    for (const id of Object.keys(FILES) as SfxId[]) {
      this.pool.set(id, [this.create(id), this.create(id)])
    }
  }

  play(id: SfxId): void {
    const voices = this.pool.get(id)
    if (!voices?.length) return

    let audio = voices.find((a) => a.paused || a.ended)
    if (!audio) {
      audio = this.create(id)
      voices.push(audio)
    }

    audio.volume = VOLUME[id]
    audio.currentTime = 0
    void audio.play().catch(() => {
      // Ignore autoplay / missing file errors.
    })
  }

  private create(id: SfxId): HTMLAudioElement {
    const audio = new Audio(sfxUrl(FILES[id]))
    audio.preload = 'auto'
    return audio
  }
}
