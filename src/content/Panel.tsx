import { useState, useEffect, useRef } from 'preact/hooks';
import { TokenInput } from './components/TokenInput';
import { BuyButtons } from './components/BuyButtons';
import { SellButtons } from './components/SellButtons';
import { StatusMessage } from './components/StatusMessage';
import {
  autoLoadWallet,
  getWalletAddress,
  getBnbBalance,
} from '@/core/wallet';
import { buyToken, sellToken, preApproveToken } from '@/core/swap';
import { loadSettings, getDefaultSettings, type UserSettings } from '@/core/storage';
import { PANCAKE_ROUTER_V2 } from '@/config/constants';
import { isValidAddress } from '@/core/token';
import { preloadCommonData } from '@/core/cache';
import { getProvider, getWalletAddress } from '@/core/wallet';

interface Status {
  type: 'success' | 'error' | 'pending';
  message: string;
  txHash?: string;
}

interface PanelPosition {
  x: number;
  y: number;
  width: number;
  height?: number;
}

// 从 storage 加载面板位置和大小
async function loadPanelPosition(): Promise<PanelPosition | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['bsc_panel_position'], (result) => {
      resolve(result.bsc_panel_position || null);
    });
  });
}

// 保存面板位置和大小
async function savePanelPosition(position: PanelPosition) {
  return new Promise<void>((resolve) => {
    chrome.storage.local.set({ bsc_panel_position: position }, resolve);
  });
}

export function Panel() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [minimized, setMinimized] = useState(false);
  const [ready, setReady] = useState(false);
  const [address, setAddress] = useState('');
  const [bnbBalance, setBnbBalance] = useState('0');
  const [settings, setSettings] = useState<UserSettings>(getDefaultSettings());
  const [tokenAddress, setTokenAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [urlTokenAddress, setUrlTokenAddress] = useState<string | null>(null);
  
  // 防重复调用标记
  const preApprovalRef = useRef<string | null>(null);
  const preApprovalTimerRef = useRef<number | null>(null);
  const preloadRef = useRef<string | null>(null);
  const preloadTimerRef = useRef<number | null>(null);
  
  // 拖拽状态
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });

  // 获取容器元素
  const getContainer = (): HTMLDivElement | null => {
    return panelRef.current?.parentElement as HTMLDivElement | null;
  };

  // 加载面板位置和大小
  useEffect(() => {
    const loadPosition = async () => {
      const position = await loadPanelPosition();
      const container = getContainer();
      if (position && container) {
        container.style.left = `${position.x}px`;
        container.style.top = `${position.y}px`;
        container.style.width = `${position.width}px`;
        if (position.height) {
          container.style.height = `${position.height}px`;
        }
      }
    };
    // 延迟加载，确保 DOM 已渲染
    setTimeout(loadPosition, 100);
  }, []);

  // 从 Axiom DOM 元素提取代币地址（支持 SPA 路由变化）
  useEffect(() => {
    const extractTokenFromDOM = () => {
      try {
        let tokenAddr: string | null = null;
        
        // 方法1: 查找包含 "CA:" 文本的元素，然后在同一容器中查找 bscscan 链接
        const caElements = Array.from(document.querySelectorAll('*')).filter(el => {
          return el.textContent?.includes('CA:');
        });
        
        for (const caElement of caElements) {
          // 在包含 "CA:" 的元素附近查找 bscscan.com/address/ 链接
          const container = caElement.closest('div') || caElement.parentElement;
          if (container) {
            const links = container.querySelectorAll('a[href*="bscscan.com/address/"]');
            for (const link of Array.from(links)) {
              const href = link.getAttribute('href');
              if (href) {
                // 匹配 bscscan.com/address/0x... 格式
                const match = href.match(/bscscan\.com\/address\/(0x[a-fA-F0-9]{40})/);
                if (match && match[1]) {
                  tokenAddr = match[1];
                  break;
                }
              }
            }
            if (tokenAddr) break;
          }
        }

        // 方法2: 如果没找到，直接查找所有 bscscan.com/address/ 链接（备用）
        if (!tokenAddr) {
          const allLinks = document.querySelectorAll('a[href*="bscscan.com/address/"]');
          for (const link of Array.from(allLinks)) {
            const href = link.getAttribute('href');
            if (href) {
              const match = href.match(/bscscan\.com\/address\/(0x[a-fA-F0-9]{40})/);
              if (match && match[1]) {
                // 验证是否在合理的上下文中（避免误提取）
                const parentText = link.parentElement?.textContent || '';
                if (parentText.includes('CA:') || parentText.includes('CA')) {
                  tokenAddr = match[1];
                  break;
                }
              }
            }
          }
        }

        if (tokenAddr && isValidAddress(tokenAddr)) {
          console.log('[BSC Trade Panel] 从 DOM 提取到代币地址:', tokenAddr);
          setUrlTokenAddress(tokenAddr);
        } else {
          // 如果没找到，清除之前提取的地址
          setUrlTokenAddress(null);
        }
      } catch (error) {
        console.error('[BSC Trade Panel] 提取地址失败:', error);
      }
    };

    // 初始提取
    extractTokenFromDOM();

    // 监听 popstate 事件（浏览器前进/后退）
    const handlePopState = () => {
      setTimeout(extractTokenFromDOM, 200);
    };
    window.addEventListener('popstate', handlePopState);

    // 重写 History API 以监听 pushState/replaceState（SPA 路由变化）
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      setTimeout(extractTokenFromDOM, 200);
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);
      setTimeout(extractTokenFromDOM, 200);
    };

    // 使用 MutationObserver 监听 DOM 变化（主要方式）
    const observer = new MutationObserver(() => {
      extractTokenFromDOM();
    });
    
    // 监听整个文档的变化
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href'], // 特别监听 href 属性变化
    });

    // 清理函数
    return () => {
      window.removeEventListener('popstate', handlePopState);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      observer.disconnect();
    };
  }, []);

  // 初始化 - 加载钱包和设置
  useEffect(() => {
    const init = async () => {
      try {
        console.log('[BSC Trade Panel] 开始初始化...');
        
        // 加载设置
        try {
          const userSettings = await loadSettings();
          setSettings(userSettings || getDefaultSettings());
          console.log('[BSC Trade Panel] 设置已加载');
        } catch (error) {
          console.error('[BSC Trade Panel] 加载设置失败:', error);
          setSettings(getDefaultSettings());
        }

        // 自动加载钱包
        const loaded = await autoLoadWallet();
        if (loaded) {
          setReady(true);
          const addr = await getWalletAddress();
          if (addr) {
            setAddress(addr);
            try {
              const balance = await getBnbBalance();
              setBnbBalance(balance);
            } catch (error) {
              console.error('[BSC Trade Panel] 获取余额失败:', error);
            }
          }
          console.log('[BSC Trade Panel] 钱包已加载:', addr);
        } else {
          console.log('[BSC Trade Panel] 未找到钱包');
        }
      } catch (error) {
        console.error('[BSC Trade Panel] 初始化错误:', error);
      } finally {
        setLoading(false);
        console.log('[BSC Trade Panel] 初始化完成');
      }
    };

    init();

    // 监听存储变化
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.bsc_trade_settings) {
        setSettings(changes.bsc_trade_settings.newValue || getDefaultSettings());
        console.log('[BSC Trade Panel] 设置已更新');
      }
      if (changes.bsc_trade_wallet) {
        autoLoadWallet().then(loaded => {
          setReady(loaded);
          if (loaded) {
            getWalletAddress().then(addr => {
              if (addr) {
                setAddress(addr);
                getBnbBalance().then(setBnbBalance).catch(console.error);
              }
            });
          } else {
            setAddress('');
            setBnbBalance('0');
          }
          console.log('[BSC Trade Panel] 钱包状态已更新:', loaded);
        });
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  // 当检测到代币地址时，预处理数据（参考 test.js，防重复调用）
  useEffect(() => {
    if (!tokenAddress || !ready || !isValidAddress(tokenAddress)) {
      preloadRef.current = null;
      if (preloadTimerRef.current) {
        clearTimeout(preloadTimerRef.current);
        preloadTimerRef.current = null;
      }
      return;
    }

    // 如果已经为这个地址预处理过，跳过
    if (preloadRef.current === tokenAddress) {
      return;
    }

    // 清除之前的定时器
    if (preloadTimerRef.current) {
      clearTimeout(preloadTimerRef.current);
    }

    // 延迟 200ms 执行，避免频繁触发
    preloadTimerRef.current = window.setTimeout(async () => {
      // 再次检查，避免重复调用
      if (preloadRef.current === tokenAddress) {
        return;
      }
      
      preloadRef.current = tokenAddress;
      
      try {
        const [provider, walletAddr] = await Promise.all([
          getProvider(),
          getWalletAddress(),
        ]);
        
        if (walletAddr) {
          // 预处理通用数据（feeData、chainId、nonce）
          await preloadCommonData(provider, walletAddr);
          console.log('[BSC Trade Panel] 预处理完成：feeData、chainId、nonce 已缓存');
        }
      } catch (error) {
        console.error('[BSC Trade Panel] 预处理失败:', error);
        // 失败时清除标记，允许重试
        if (preloadRef.current === tokenAddress) {
          preloadRef.current = null;
        }
      }
    }, 200);

    return () => {
      if (preloadTimerRef.current) {
        clearTimeout(preloadTimerRef.current);
        preloadTimerRef.current = null;
      }
    };
  }, [tokenAddress, ready]);

  // 拖拽处理
  useEffect(() => {
    if (!panelRef.current) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 只在点击 header 区域时开始拖拽，排除按钮和调整大小手柄
      if (target.closest('.bsc-panel-header') && !target.closest('.bsc-panel-controls') && !target.closest('.bsc-resize-handle')) {
        const container = getContainer();
        if (!container) return;
        
        setIsDragging(true);
        const rect = container.getBoundingClientRect();
        setDragStart({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        e.preventDefault();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const container = getContainer();
      if (!container) return;

      if (isDragging) {
        const x = e.clientX - dragStart.x;
        const y = e.clientY - dragStart.y;
        
        // 限制在窗口内
        const maxX = window.innerWidth - container.offsetWidth;
        const maxY = window.innerHeight - container.offsetHeight;
        
        container.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
        container.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
        container.style.right = 'auto';
        container.style.bottom = 'auto';
      }
      
      if (isResizing) {
        const deltaX = e.clientX - resizeStart.x;
        const newWidth = Math.max(280, Math.min(resizeStart.width + deltaX, 800));
        container.style.width = `${newWidth}px`;
      }
    };

    const handleMouseUp = () => {
      if (isDragging || isResizing) {
        setIsDragging(false);
        setIsResizing(false);
        
        // 保存位置和大小
        const container = getContainer();
        if (container) {
          const rect = container.getBoundingClientRect();
          savePanelPosition({
            x: rect.left,
            y: rect.top,
            width: rect.width,
          });
        }
      }
    };

    panelRef.current.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      panelRef.current?.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragStart, resizeStart]);

  // 调整大小处理
  const handleResizeStart = (e: MouseEvent) => {
    const container = getContainer();
    if (!container) return;
    setIsResizing(true);
    const rect = container.getBoundingClientRect();
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
    });
    e.preventDefault();
    e.stopPropagation();
  };

  // 当输入有效的代币地址时，自动预授权（后台执行，不阻塞，防重复调用）
  useEffect(() => {
    if (!tokenAddress || !ready) {
      preApprovalRef.current = null;
      if (preApprovalTimerRef.current) {
        clearTimeout(preApprovalTimerRef.current);
        preApprovalTimerRef.current = null;
      }
      return;
    }

    // 如果已经为这个地址预授权过，跳过
    if (preApprovalRef.current === tokenAddress) {
      return;
    }

    // 清除之前的定时器
    if (preApprovalTimerRef.current) {
      clearTimeout(preApprovalTimerRef.current);
    }

    // 延迟500ms，确保用户输入完成，并防抖
    preApprovalTimerRef.current = window.setTimeout(() => {
      // 再次检查，避免重复调用
      if (preApprovalRef.current === tokenAddress) {
        return;
      }
      
      preApprovalRef.current = tokenAddress;
      
      preApproveToken(tokenAddress, PANCAKE_ROUTER_V2)
        .then(result => {
          if (result.approved) {
            console.log('[BSC Trade Panel] 代币已预授权');
          } else if (result.txHash) {
            console.log(`[BSC Trade Panel] 预授权交易已发送: ${result.txHash}`);
          } else if (result.error && result.error !== '授权请求已在进行中') {
            // 如果是"正在处理中"的错误，不显示警告（这是正常的防重复机制）
            console.warn(`[BSC Trade Panel] 预授权失败: ${result.error}`);
          }
        })
        .catch(err => {
          console.error('[BSC Trade Panel] 预授权错误:', err);
          // 失败时清除标记，允许重试
          if (preApprovalRef.current === tokenAddress) {
            preApprovalRef.current = null;
          }
        });
    }, 500);

    return () => {
      if (preApprovalTimerRef.current) {
        clearTimeout(preApprovalTimerRef.current);
        preApprovalTimerRef.current = null;
      }
    };
  }, [tokenAddress, ready]);

  // 定期刷新余额
  useEffect(() => {
    if (!ready) return;

    const refresh = async () => {
      try {
        const balance = await getBnbBalance();
        setBnbBalance(balance);
      } catch (error) {
        console.error('[BSC Trade Panel] 刷新余额失败:', error);
      }
    };

    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [ready]);

  // 买入处理
  const handleBuy = async (amount: string) => {
    if (!tokenAddress) {
      setStatus({ type: 'error', message: '请先输入代币合约地址' });
      return;
    }

    setStatus({ type: 'pending', message: `买入 ${amount} BNB...` });

    try {
      const result = await buyToken(tokenAddress, amount);
      setStatus({
        type: 'success',
        message: '交易已发送',
        txHash: result.hash,
      });
      
      setTimeout(async () => {
        try {
          const balance = await getBnbBalance();
          setBnbBalance(balance);
        } catch (error) {
          console.error('[BSC Trade Panel] 刷新余额失败:', error);
        }
      }, 3000);
    } catch (err: any) {
      console.error('[BSC Trade Panel] 买入失败:', err);
      // 提取错误消息，处理长消息
      let errorMessage = err.message || '买入失败，请检查网络或余额';
      // 如果是详细的错误消息，截取关键部分
      if (errorMessage.length > 100) {
        const match = errorMessage.match(/无法获取流动性报价[^。]+/);
        if (match) {
          errorMessage = match[0] + '。请检查代币地址是否正确，或该代币是否在 PancakeSwap 上有流动性池。';
        } else {
          // 截取前50个字符
          errorMessage = errorMessage.substring(0, 100) + '...';
        }
      }
      setStatus({ type: 'error', message: errorMessage });
    }
  };

  // 卖出处理
  const handleSell = async (percentage: number) => {
    if (!tokenAddress) {
      setStatus({ type: 'error', message: '请先输入代币合约地址' });
      return;
    }

    setStatus({ type: 'pending', message: `卖出 ${percentage}%...` });

    try {
      const result = await sellToken(tokenAddress, percentage);
      setStatus({
        type: 'success',
        message: '交易已发送',
        txHash: result.hash,
      });
      
      setTimeout(async () => {
        try {
          const balance = await getBnbBalance();
          setBnbBalance(balance);
        } catch (error) {
          console.error('[BSC Trade Panel] 刷新余额失败:', error);
        }
      }, 3000);
    } catch (err: any) {
      console.error('[BSC Trade Panel] 卖出失败:', err);
      // 提取错误消息
      let errorMessage = err.message || '卖出失败，请检查网络或余额';
      // 如果是详细的错误消息，截取关键部分
      if (errorMessage.length > 100) {
        const match = errorMessage.match(/无法获取流动性报价[^。]+/);
        if (match) {
          errorMessage = match[0] + '。请检查代币地址是否正确，或该代币是否在 PancakeSwap 上有流动性池。';
        } else {
          errorMessage = errorMessage.substring(0, 100) + '...';
        }
      }
      setStatus({ type: 'error', message: errorMessage });
    }
  };

  // 打开设置页面
  const handleOpenSettings = () => {
    chrome.runtime.sendMessage({ type: 'OPEN_POPUP' }).catch(() => {
      chrome.runtime.openOptionsPage?.() || chrome.action.openPopup?.();
    });
  };

  // 清除状态消息
  useEffect(() => {
    if (status && status.type !== 'pending') {
      const timer = setTimeout(() => {
        setStatus(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);


  const displaySettings = settings || getDefaultSettings();

  if (loading) {
    return (
      <div ref={panelRef} class="bsc-panel">
        <div class="bsc-panel-header">
          <div class="bsc-panel-title">
            <span>⚡ BSC 快速交易</span>
          </div>
        </div>
        <div class="bsc-panel-body">
          <div style="text-align: center; padding: 20px; color: #888;">
            加载中...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={panelRef} class={`bsc-panel ${minimized ? 'minimized' : ''} ${isDragging ? 'dragging' : ''}`}>
      <div class="bsc-panel-header">
        <div class="bsc-panel-title">
          <span>⚡ BSC 快速交易</span>
        </div>
        <div class="bsc-panel-controls">
          {ready && (
            <span class="bsc-balance" title={`钱包: ${address}`}>
              {parseFloat(bnbBalance).toFixed(3)} BNB
            </span>
          )}
          <button 
            class="bsc-panel-btn" 
            onClick={handleOpenSettings} 
            title="打开设置"
          >
            ⚙
          </button>
          <button 
            class="bsc-panel-btn" 
            onClick={() => setMinimized(!minimized)}
            title={minimized ? '展开' : '最小化'}
          >
            {minimized ? '▢' : '−'}
          </button>
        </div>
      </div>

      <div class="bsc-panel-body">
        {!ready ? (
          <div class="bsc-no-wallet">
            <p style="margin-bottom: 12px; color: #ffa500;">⚠️ 请先导入钱包</p>
            <button class="bsc-btn bsc-btn-primary" onClick={handleOpenSettings}>
              打开设置导入钱包
            </button>
          </div>
        ) : (
          <>
            <TokenInput 
              onTokenChange={setTokenAddress} 
              defaultValue={urlTokenAddress || undefined}
            />
            <BuyButtons
              amounts={displaySettings.buyAmounts}
              disabled={!tokenAddress}
              onBuy={handleBuy}
            />
            <SellButtons
              percentages={displaySettings.sellPercentages}
              disabled={!tokenAddress}
              onSell={handleSell}
            />
            {status && (
              <StatusMessage
                type={status.type}
                message={status.message}
                txHash={status.txHash}
              />
            )}
          </>
        )}
      </div>
      
      {/* 调整大小手柄 */}
      {!minimized && (
        <div 
          class="bsc-resize-handle"
          onMouseDown={handleResizeStart}
          title="拖拽调整大小"
        />
      )}
    </div>
  );
}
