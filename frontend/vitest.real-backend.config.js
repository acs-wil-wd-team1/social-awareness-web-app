import { defineConfig } from 'vitest/config'

const tag = process.env.CAUSECONNECT_TEST_RUN || ''
if (process.env.RUN_REAL_BACKEND_TESTS !== '1' || !/^[a-f0-9]{12}$/.test(tag)
  || process.env.NODE_ENV !== 'test' || process.env.DB_HOST !== '127.0.0.1'
  || process.env.DB_NAME_TEST !== `cc_frontend_${tag}_test`
  || process.env.DB_NAME === process.env.DB_NAME_TEST
  || !/^http:\/\/127\.0\.0\.1:\d+\/api$/.test(process.env.VITE_API_BASE_URL || '')
  || process.env.VITE_DEMO_MODE !== 'false') {
  throw new Error('Use npm run test:real-backend. Direct or remote integration execution is disabled.')
}

export default defineConfig({
  // Ignore .env files; the runner supplies the isolated local API address explicitly.
  envDir: false,
  test: {
    include: ['integration/**/*.real-backend.jsx'],
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost:5173/' } },
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
})
