import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readdirSync } from 'fs';

// Automatically discover widget entry points
function getWidgetEntries() {
  const widgetsDir = resolve(__dirname, 'src/widgets');
  const files = readdirSync(widgetsDir);
  
  const entries: Record<string, string> = {};
  
  files.forEach((file) => {
    if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const name = file.replace(/\.(tsx?|jsx?)$/, '');
      // Convert camelCase to kebab-case for output filename
      const kebabName = name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
      entries[`${kebabName}-component`] = resolve(widgetsDir, file);
    }
  });
  
  return entries;
}

export default defineConfig(({ mode: _mode }) => {
  // Get all widget entries
  const entries = getWidgetEntries();
  const entryName = process.env.WIDGET_ENTRY || Object.keys(entries)[0];
  
  return {
    plugins: [
      react({
        // Use automatic JSX runtime
        jsxRuntime: 'automatic',
      }),
    ],
    
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    
    build: {
      lib: {
        // Build one entry at a time to prevent code splitting
        // Use object with entry name as key so Vite uses it for output filename
        entry: { [entryName]: entries[entryName] },
        formats: ['es'],
        fileName: (format, name) => `${name}.js`,
        name: entryName,
      },
    
    rollupOptions: {
      output: {
        // Ensure predictable output names
        entryFileNames: '[name].js',
        
        // Disable code splitting - bundle everything into single files
        manualChunks: undefined,
        
        // Inline CSS by not extracting it
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return '[name].css';
          }
          return '[name].[ext]';
        },
      },
    },
    
    // Output to dist/
    outDir: 'dist',
    // Only empty on first build (poster)
    emptyOutDir: entryName === 'poster-component',
    
    // Generate sourcemaps for debugging
    sourcemap: true,
    
    // Minify for production
    minify: true,
    
    // Target modern browsers (ES2020)
    target: 'es2020',
    
    // CSS code splitting - keep it bundled with JS
    cssCodeSplit: false,
  },
  
    // CSS handling
    css: {
      postcss: './postcss.config.js',
    },
  };
});

