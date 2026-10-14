/** @type {import('next').NextConfig} */
const nextConfig = {
  // imagem Docker enxuta: só o server.js + dependências usadas
  output: 'standalone',
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
