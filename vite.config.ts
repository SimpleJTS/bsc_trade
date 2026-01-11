import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

// 构建后处理插件
function buildPlugin() {
  return {
    name: 'bsc-trade-build',
    async closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      const { build } = await import('vite');

      // 重新构建 content.js 为 IIFE 格式（content script 不支持 ES 模块）
      console.log('构建 content.js (IIFE 格式)...');
      await build({
        configFile: false,
        build: {
          lib: {
            entry: resolve(__dirname, 'src/content/index.tsx'),
            name: 'BSCTrade',
            formats: ['iife'],
            fileName: () => 'content.js',
          },
          outDir: distDir,
          emptyOutDir: false,
          rollupOptions: {
            output: {
              inlineDynamicImports: true, // IIFE 需要内联所有依赖
            },
          },
          minify: false,
        },
        resolve: {
          alias: {
            '@': resolve(__dirname, 'src'),
          },
        },
        plugins: [preact()],
        define: {
          'process.env': {},
        },
      });

      // 复制 manifest.json
      copyFileSync(
        resolve(__dirname, 'manifest.json'),
        resolve(distDir, 'manifest.json')
      );

      // 复制 CSS
      const assetsDir = resolve(distDir, 'assets');
      if (!existsSync(assetsDir)) {
        mkdirSync(assetsDir, { recursive: true });
      }
      copyFileSync(
        resolve(__dirname, 'src/styles/panel.css'),
        resolve(assetsDir, 'panel.css')
      );

      // 移动 popup HTML 到正确位置
      const popupSourcePath = resolve(distDir, 'src/popup/index.html');
      const popupTargetDir = resolve(distDir, 'popup');
      
      if (existsSync(popupSourcePath)) {
        if (!existsSync(popupTargetDir)) {
          mkdirSync(popupTargetDir, { recursive: true });
        }

        let htmlContent = readFileSync(popupSourcePath, 'utf-8');
        htmlContent = htmlContent.replace(/src="\.\.\/\.\.\//g, 'src="../');
        htmlContent = htmlContent.replace(/href="\.\.\/\.\.\//g, 'href="../');
        htmlContent = htmlContent.replace(/src="\//g, 'src="../');
        htmlContent = htmlContent.replace(/href="\//g, 'href="../');
        writeFileSync(resolve(popupTargetDir, 'index.html'), htmlContent);
      }

      console.log('构建完成 ✓');
    },
  };
}

export default defineConfig({
  plugins: [preact(), buildPlugin()],
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        // 不在这里构建 content，稍后在插件中单独构建
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  define: {
    'process.env': {},
  },
});
