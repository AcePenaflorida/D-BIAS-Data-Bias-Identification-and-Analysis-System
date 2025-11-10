/// <reference types="vite/client" />

// Allow importing SVGs as React components or assets without TypeScript errors
declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.png';
declare module '*.jpg';
declare module '*.jpeg';
