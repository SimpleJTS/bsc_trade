import { useState, useEffect } from 'preact/hooks';
import { TokenInput } from './components/TokenInput';
import { BuyButtons } from './components/BuyButtons';
import { SellButtons } from './components/SellButtons';
import { StatusMessage } from './components/StatusMessage';
import {
  hasWallet,
  autoLoadWallet,
  isWalletReady,
  getWalletAddress,
  getBnbBalance,
} from '@/core/wallet';
import { formatAddress } from '@/core/token';
import { buyToken, sellToken } from '@/core/swap';
import { loadSettings, type UserSettings } from '@/core/storage';
import { logger } from '@/core/logger';

interface Status {
  type: 'success' | 'error' | 'pending';
  message: string;
  txHash?: string;
}

export function Panel() {
  const [minimized, setMinimized] = useState(false);
  const [ready, setReady] = useState(false);
  const [address, setAddress] = useState('');
  const [bnbBalance, setBnbBalance] = useState('0');
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [tokenAddress, setTokenAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  // 初始化 - 自动加载钱包
  useEffect(() => {
    const init = async () => {
      logger.ui.info('初始化...');

      // 自动加载钱包
      const loaded = await autoLoadWallet();
      if (loaded) {
        setReady(true);
        const addr = await getWalletAddress();
        if (addr) {
          setAddress(addr);
          const balance = await getBnbBalance();
          setBnbBalance(balance);
        }
      }

      const userSettings = await loadSettings();
      setSettings(userSettings);
      logger.ui.success('初始化完成');
    };

    init();

    // 监听钱包变化
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.bsc_trade_settings) {
        setSettings(changes.bsc_trade_settings.newValue);
      }
      if (changes.bsc_trade_wallet) {
        autoLoadWallet().then(loaded => {
          setReady(loaded);
          if (loaded) {
            getWalletAddress().then(setAddress);
          }
        });
      }
    });
  }, []);

  // 刷新余额
  useEffect(() => {
    if (!ready) return;

    const refresh = async () => {
      try {
        const balance = await getBnbBalance();
        setBnbBalance(balance);
      } catch {}
    };

    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [ready]);

  const handleBuy = async (amount: string) => {
    if (!tokenAddress) return;

    setStatus({ type: 'pending', message: '买入中...' });

    try {
      const result = await buyToken(tokenAddress, amount);
      setStatus({
        type: 'success',
        message: '已发送',
        txHash: result.hash,
      });
      // 刷新余额
      setTimeout(async () => {
        const balance = await getBnbBalance();
        setBnbBalance(balance);
      }, 2000);
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || '失败' });
    }
  };

  const handleSell = async (percentage: number) => {
    if (!tokenAddress) return;

    setStatus({ type: 'pending', message: `卖出${percentage}%...` });

    try {
      const result = await sellToken(tokenAddress, percentage);
      setStatus({
        type: 'success',
        message: '已发送',
        txHash: result.hash,
      });
      setTimeout(async () => {
        const balance = await getBnbBalance();
        setBnbBalance(balance);
      }, 2000);
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || '失败' });
    }
  };

  const handleOpenSettings = () => {
    chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
  };

  if (!settings) return null;

  return (
    <div class={`bsc-panel ${minimized ? 'minimized' : ''}`}>
      <div class="bsc-panel-header">
        <div class="bsc-panel-title">
          <span>⚡ BSC</span>
        </div>
        <div class="bsc-panel-controls">
          {ready && (
            <span class="bsc-balance">{parseFloat(bnbBalance).toFixed(3)}</span>
          )}
          <button class="bsc-panel-btn" onClick={handleOpenSettings} title="设置">⚙</button>
          <button class="bsc-panel-btn" onClick={() => setMinimized(!minimized)}>
            {minimized ? '▢' : '−'}
          </button>
        </div>
      </div>

      <div class="bsc-panel-body">
        {!ready ? (
          <div class="bsc-no-wallet">
            <p>请先导入钱包</p>
            <button class="bsc-btn" onClick={handleOpenSettings}>
              打开设置
            </button>
          </div>
        ) : (
          <>
            <TokenInput onTokenChange={setTokenAddress} />

            <BuyButtons
              amounts={settings.buyAmounts}
              disabled={!tokenAddress}
              onBuy={handleBuy}
            />

            <SellButtons
              percentages={settings.sellPercentages}
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
    </div>
  );
}
