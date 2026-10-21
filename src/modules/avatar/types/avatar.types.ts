// Shared by the main process (sign cache), the preload and the renderer.

/** Avatars of the official VLibras player, in the order the player itself lists them. */
export const AVATARS = ['icaro', 'guga', 'hosana'] as const
export type AvatarId = (typeof AVATARS)[number]

export const AVATAR_NAMES: Record<AvatarId, string> = {
  icaro: 'Ícaro',
  guga: 'Guga',
  hosana: 'Hosana'
}

/** Limits of the speed slider (half-steps, the increments the player's own picker used to offer). */
export const AVATAR_SPEED_RANGE = { min: 0.5, max: 3, step: 0.5 } as const

/** Where the avatar stands horizontally on the stage (always at the bottom): a slider from the
 *  left edge (0) to the right edge (100), 50 being dead centre. */
export const AVATAR_POSITION_RANGE = { min: 0, max: 100, step: 1 } as const

/** Regional sign variants: "BR" is the national standard, the rest are Brazilian states. */
export const REGION_CODES = [
  'BR',
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO'
] as const
export type RegionCode = (typeof REGION_CODES)[number]

export const REGION_NAMES: Record<RegionCode, string> = {
  BR: 'BR - Padrão Nacional',
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins'
}

/** The public dictionary of signs. Replaceable in the settings (e.g. a self-hosted copy). */
export const DEFAULT_DICTIONARY_URL = 'https://dicionario2.vlibras.gov.br/2018.3.1/WEBGL/'

/**
 * Where the player asks for signs. The main process answers these requests, downloading each
 * sign once and keeping it on disk, so the player never talks to the internet by itself.
 */
export const SIGNS_PROXY_ORIGIN = 'app://renderer'
export const SIGNS_PROXY_PATH = '/__signs__/'
export const signsBaseUrl = (region: RegionCode): string =>
  `${SIGNS_PROXY_ORIGIN}${SIGNS_PROXY_PATH}${region}/`

/** A sign name becomes part of a URL and of a file name: only plain gloss characters pass. */
export function isValidSignName(name: string): boolean {
  return /^[\p{L}\p{N}_&(),.+%-]{1,120}$/u.test(name) && !name.includes('..')
}

export function isRegionCode(value: string): value is RegionCode {
  return (REGION_CODES as readonly string[]).includes(value)
}
