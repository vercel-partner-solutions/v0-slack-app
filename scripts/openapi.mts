import { createClient, defaultPlugins, type UserConfig } from '@hey-api/openapi-ts'

const plugins: UserConfig['plugins'] = [
  ...defaultPlugins,
  '@hey-api/client-fetch',
]

const v0Client = createClient({
  input: 'https://api.v0.dev/v1/openapi.json?includeMobileRoutes=1&version=beta',
  output: 'server/lib/v0',
  plugins,
})

await Promise.all([v0Client])