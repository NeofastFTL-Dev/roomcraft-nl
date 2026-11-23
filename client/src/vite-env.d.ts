/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" for the bundled Android app, which stores everything on the device. */
  readonly VITE_OFFLINE?: string;
}
