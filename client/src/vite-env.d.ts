/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare module '*?raw' {
  const content: string
  export default content
}

declare global {
  const __APP_VERSION__: string

  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, string | number | boolean> }) => void
  }
}

export {}
