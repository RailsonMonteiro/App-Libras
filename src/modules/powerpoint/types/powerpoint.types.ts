/**
 * Where the renderer asks for a PNG thumbnail of one slide of the tracked PowerPoint
 * presentation, exported live via COM (see electron/services/powerpoint/scripts/exportSlide.ps1
 * and PowerPointSlideImageCache.ts). Served by the `app://` protocol handler (main/protocol.ts),
 * the same way signs are - see SIGNS_PROXY_PATH in the avatar module.
 *
 * `oneBasedIndex` matches PowerPoint's own slide numbering, not `Slide.index`/
 * `UpcomingSlide.index` (both 0-based) - callers must add 1.
 */
export const SLIDE_IMAGE_PROXY_ORIGIN = 'app://renderer'
export const SLIDE_IMAGE_PROXY_PATH = '/__pptx-slide__/'
export const slideImageUrl = (presentationId: string, oneBasedIndex: number): string =>
  `${SLIDE_IMAGE_PROXY_ORIGIN}${SLIDE_IMAGE_PROXY_PATH}${encodeURIComponent(presentationId)}/${oneBasedIndex}.png`
