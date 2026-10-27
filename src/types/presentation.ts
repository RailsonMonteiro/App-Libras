// Shared by every slide source (LouvorJA, PowerPoint, ...) and whatever consumes their slides
// (the translator, the avatar, the Slides/Projection/Overlay pages) - deliberately source-agnostic.

export const SLIDE_KINDS = ['lyrics', 'verse', 'text', 'image', 'other'] as const
export type SlideKind = (typeof SLIDE_KINDS)[number]

export interface Presentation {
  id: string
  title: string
  startedAt: string
}

export interface Slide {
  id: string
  presentationId: string | null
  /** 0-based position inside the presentation, when the source reports it. */
  index: number | null
  total: number | null
  title: string | null
  text: string
  /** Text of the slide that comes next, when the source tells it (used to translate ahead). */
  nextText: string | null
  kind: SlideKind
  receivedAt: string
}

/** Events produced by a slide source, already independent from how it was received. */
export type PresentationEvent =
  | { type: 'presentation-started'; presentation: Presentation }
  | { type: 'slide'; slide: Slide }
  | { type: 'presentation-ended'; presentationId: string }
