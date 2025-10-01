import { createClient, defaultPlugins, type UserConfig } from '@hey-api/openapi-ts'

const plugins: UserConfig['plugins'] = [
  ...defaultPlugins,
  '@hey-api/client-fetch',
]

const v0Client = createClient({
  input:
    process.env.V0_ENDPOINT_URL ??
    'https://api.v0.dev/v1/openapi.json?version=beta',
  output: 'server/lib/v0/client',
  plugins,
})

await Promise.all([v0Client])