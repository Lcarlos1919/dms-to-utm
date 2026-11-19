/** @type {import('next').NextConfig} */
const nextConfig = {
  // Somente valores públicos: tudo aqui é embutido no bundle do navegador.
  env: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "pk_test_YWJvdmUtb3JjYS04NzA5LmNsZXJrLmFjY291bnRzLmRldiQ",
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? "/sign-in",
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL ?? "/sign-up",
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL:
      process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL ?? "/dashboard",
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL:
      process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL ?? "/dashboard",
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? process.env.SUPABASE_URL_2 ?? "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.SUPABASE_PUBLISHABLE_KEY ??
      process.env.SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.SUPABASE_PUBLISHABLE_KEY_2 ??
      process.env.SUPABASE_ANON_KEY_2 ??
      "",
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  // Pacotes com binário nativo, WebAssembly ou arquivos de dados: ficam fora do bundle.
  serverExternalPackages: ["unpdf", "pdfjs-dist", "@napi-rs/canvas", "tesseract.js", "tesseract.js-core", "@tesseract.js-data/por"],
  // Arquivos lidos em tempo de execução pela leitura de PDFs escaneados (OCR).
  outputFileTracingIncludes: {
    "/api/projetos/**": [
      "./node_modules/pdfjs-dist/legacy/build/**",
      "./node_modules/pdfjs-dist/wasm/**",
      "./node_modules/@tesseract.js-data/por/4.0.0_best_int/**",
      "./node_modules/tesseract.js/src/**",
      "./node_modules/tesseract.js-core/**",
      "./node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/legacy/build/**",
      "./node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/wasm/**",
      "./node_modules/.pnpm/@tesseract.js-data+por@*/node_modules/@tesseract.js-data/por/4.0.0_best_int/**",
      "./node_modules/.pnpm/tesseract.js@*/node_modules/tesseract.js/src/**",
      "./node_modules/.pnpm/tesseract.js-core@*/node_modules/tesseract.js-core/**",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ]
  },
  experimental: {
    // Isola o compilador Webpack para evitar que o processo principal
    // acumule todos os módulos até atingir o limite de memória da Vercel.
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true,
  },
}

export default nextConfig
