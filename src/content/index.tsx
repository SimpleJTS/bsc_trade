import { render } from 'preact';
import { Panel } from './Panel';

// 全局标记，防止重复初始化
let isInitialized = false;
let panelInstance: any = null;
let checkInterval: number | null = null;

// 创建悬浮窗容器
function createPanelContainer(): HTMLElement {
  let container = document.getElementById('bsc-quick-trade-root') as HTMLElement;
  
  if (container) {
    // 如果容器存在但可能被清空了，重新渲染
    if (!container.hasChildNodes()) {
      console.log('[BSC Trade] 容器存在但为空，重新渲染');
      render(<Panel />, container);
    }
    return container;
  }

  container = document.createElement('div');
  container.id = 'bsc-quick-trade-root';
  document.body.appendChild(container);
  
  console.log('[BSC Trade] 悬浮窗容器已创建');
  return container;
}

// 初始化悬浮窗
function initPanel() {
  // 防止重复初始化
  if (isInitialized) {
    // 但检查一下容器是否还在
    const existingContainer = document.getElementById('bsc-quick-trade-root');
    if (existingContainer && existingContainer.hasChildNodes()) {
      console.log('[BSC Trade] 已初始化且容器存在，跳过');
      return;
    } else if (existingContainer) {
      console.log('[BSC Trade] 容器存在但为空，重新渲染');
      isInitialized = false;
    }
  }

  try {
    if (!document.body) {
      console.warn('[BSC Trade] body 未准备好，等待中...');
      setTimeout(initPanel, 100);
      return;
    }

    const container = createPanelContainer();
    
    // 清除之前的实例
    if (container.firstChild) {
      render(null, container);
    }
    
    panelInstance = render(<Panel />, container);
    isInitialized = true;
    
    console.log('[BSC Trade] 悬浮窗已初始化');
    
    // 启动监控，确保悬浮窗不会被移除
    startMonitoring();
  } catch (error) {
    console.error('[BSC Trade] 初始化失败:', error);
    isInitialized = false;
  }
}

// 监控悬浮窗是否存在
function startMonitoring() {
  // 清除之前的监控
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  // 每 1 秒检查一次悬浮窗是否存在
  checkInterval = window.setInterval(() => {
    const container = document.getElementById('bsc-quick-trade-root');
    
    if (!container) {
      console.warn('[BSC Trade] 检测到容器被移除，重新创建');
      isInitialized = false;
      initPanel();
      return;
    }
    
    // 如果容器存在但没有内容，重新渲染
    if (container && !container.hasChildNodes()) {
      console.warn('[BSC Trade] 检测到容器内容被清空，重新渲染');
      render(<Panel />, container);
    }
  }, 1000);
}

// 等待页面加载完成
function waitForPageReady() {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    if (document.body) {
      initPanel();
    } else {
      const observer = new MutationObserver(() => {
        if (document.body) {
          observer.disconnect();
          initPanel();
        }
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
      
      setTimeout(() => {
        observer.disconnect();
        if (document.body) {
          initPanel();
        }
      }, 5000);
    }
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body) {
        initPanel();
      } else {
        setTimeout(initPanel, 100);
      }
    });
  }
}

// 监听 DOM 变化，防止悬浮窗被移除
const domObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    // 检查是否有节点被移除
    if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
      for (const node of Array.from(mutation.removedNodes)) {
        if (node === document.getElementById('bsc-quick-trade-root')) {
          console.warn('[BSC Trade] 检测到容器被 DOM 变化移除，重新创建');
          isInitialized = false;
          setTimeout(initPanel, 100);
          return;
        }
      }
    }
  }
});

// 监听 URL 变化（SPA 路由）
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('[BSC Trade] URL 变化，检查悬浮窗');
    
    // 延迟检查，等待页面更新完成
    setTimeout(() => {
      const container = document.getElementById('bsc-quick-trade-root');
      if (!container) {
        console.warn('[BSC Trade] URL 变化后容器不存在，重新初始化');
        isInitialized = false;
        initPanel();
      } else if (!container.hasChildNodes()) {
        console.warn('[BSC Trade] URL 变化后容器为空，重新渲染');
        render(<Panel />, container);
      }
    }, 500);
  }
});

// 启动初始化
console.log('[BSC Trade] Content Script 已加载');
waitForPageReady();

// 开始监控 DOM 变化
domObserver.observe(document.body || document.documentElement, {
  childList: true,
  subtree: true,
});

// 开始监控 URL 变化
urlObserver.observe(document, {
  subtree: true,
  childList: true,
});

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
  if (checkInterval) {
    clearInterval(checkInterval);
  }
  domObserver.disconnect();
  urlObserver.disconnect();
});
