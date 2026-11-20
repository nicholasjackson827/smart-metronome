import { defineConfig } from 'vite';

// BASE_PATH lets the same build serve from a subpath, e.g. /smart-metronome/ on GitHub Pages.
export default defineConfig({ base: process.env.BASE_PATH || '/' });
