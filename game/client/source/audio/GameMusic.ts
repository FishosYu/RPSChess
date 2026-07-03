const STORAGE_KEY = 'rpschess-music-muted'

function musicUrl(): string {
  const base = import.meta.env.BASE_URL ?? '/'
  return `${base}music.mp3`
}

export class GameMusic {
  private readonly audio: HTMLAudioElement | null
  private muted: boolean

  constructor() {
    if (typeof Audio === 'undefined') {
      this.audio = null
      this.muted = true
      return
    }

    this.audio = new Audio(musicUrl())
    this.audio.loop = true
    this.audio.preload = 'auto'
    this.audio.volume = 0.42

    const stored =
      typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    this.muted = stored === '1'
  }

  isMuted(): boolean {
    return this.muted
  }

  toggle(): boolean {
    this.muted = !this.muted
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0')
    }
    if (this.muted) {
      this.audio?.pause()
    } else {
      void this.play()
    }
    return this.muted
  }

  async play(): Promise<void> {
    if (!this.audio || this.muted) return
    try {
      this.audio.muted = false
      await this.audio.play()
    } catch {
      // Browser may block until a user gesture; ignore.
    }
  }

  pause(): void {
    this.audio?.pause()
  }

  destroy(): void {
    this.pause()
    if (this.audio) {
      this.audio.src = ''
    }
  }
}
