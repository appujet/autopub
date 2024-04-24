import { dotEnvConfig } from './deps.ts'

dotEnvConfig({ export: true })
export const BOT_TOKEN = Deno.env.get('BOT_TOKEN') || ''
export const BOT_ID = BigInt(atob(BOT_TOKEN.split('.')[0]))
export const TURSO_DATABASE_URL = Deno.env.get('TURSO_DATABASE_URL') || ''
export const TURSO_AUTH_TOKEN = Deno.env.get('TURSO_AUTH_TOKEN') || ''