/**
 * Ambient declaration for the `powerglitch` package.
 *
 * The real package ships its types at
 * `powerglitch/build/src/index.d.ts` behind an `exports`-conditional
 * entry. Most moduleResolution modes pick those up, but on some setups
 * (older TS, strict project references, or a stale editor) the types
 * aren't found even though the runtime module resolves fine. This file
 * provides a permissive fallback that matches the surface we actually
 * use — just `PowerGlitch.glitch(...)`.
 *
 * If the real typings resolve, TypeScript will merge with them; if not,
 * this file keeps the build green.
 */
declare module 'powerglitch' {
  export type PowerGlitchPlayMode = 'always' | 'hover' | 'click' | 'manual';

  export interface PowerGlitchOptions {
    playMode?: PowerGlitchPlayMode;
    createContainers?: boolean;
    hideOverflow?: boolean;
    timing?: {
      duration?: number;
      iterations?: number;
      easing?: string;
    };
    glitchTimeSpan?: {
      start?: number;
      end?: number;
    };
    shake?: {
      velocity?: number;
      amplitudeX?: number;
      amplitudeY?: number;
    } | false;
    slice?: {
      count?: number;
      velocity?: number;
      minHeight?: number;
      maxHeight?: number;
      hueRotate?: boolean;
    } | false;
    pulse?:
      | {
          scale?: number;
        }
      | false;
    [key: string]: unknown;
  }

  export interface PowerGlitchHandle {
    startGlitch: () => void;
    stopGlitch: () => void;
  }

  export const PowerGlitch: {
    glitch: (
      target: string | Element | Element[] | NodeListOf<Element>,
      options?: Partial<PowerGlitchOptions>,
    ) => PowerGlitchHandle;
  };
}
