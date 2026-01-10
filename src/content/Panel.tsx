import { useState, useEffect } from 'preact/hooks';
import { UnlockForm } from './components/UnlockForm';
import { TokenInput } from './components/TokenInput';
import { BuyButtons } from './components/BuyButtons';
import { SellButtons } from './components/SellButtons';
import { StatusMessage } from './components/StatusMessage';
import {
  hasWallet,
  unlockWallet,
  isWalletUnlocked,
  getWalletAddress,
  lockWallet,
} from '@/core/wallet';
import { getBnbBalance, formatAddress, type TokenInfo } from '@/core/token';
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
  const [walletExists, setWalletExists] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [address, setAddress] = useState('');
  const [bnbBalance, setBnbBalance] = useState('0');
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [currentToken, setCurrentToken] = useState<TokenInfo | null>(null);
  const [tokenBalance, setTokenBalance] = useState('0');
  const [status, setStatus] = useState<Status | null>(null);

  // 初始化
  useEffect(() => {
    const init = async () => {
      logger.ui.info('初始化交易面板');

      const exists = await hasWallet();
      setWalletExists(exists);

      if (exists && isWalletUnlocked()) {
        setUnlocked(true);
        const addr = await getWalletAddress();
        if (addr) {
          setAddress(addr);
          const balance = await getBnbBalance(addr);
          setBnbBalance(balance.formatted);
        }
      }

      const userSettings = await loadSettings();
      setSettings(userSettings);
      logger.ui.success('面板初始化完成');
    };

    init();

    // 监听设置变化
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.bsc_trade_settings) {
        logger.ui.info('设置已更新');
        setSettings(changes.bsc_trade_settings.newValue);
      }
      if (changes.bsc_trade_wallet) {
        hasWallet().then(setWalletExists);
      }
    });
  }, []);

  // 定时刷新余额
  useEffect(() => {
    if (!unlocked || !address) return;

    const refresh = async () => {
      try {
        const balance = await getBnbBalance(address);
        setBnbBalance(balance.formatted);
      } catch {
        // 忽略错误
      }
    };

    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [unlocked, address]);

  const handleUnlock = async (password: string) => {
    logger.ui.info('解锁钱包中...');
    await unlockWallet(password);
    setUnlocked(true);
    const addr = await getWalletAddress();
    if (addr) {
      setAddress(addr);
      const balance = await getBnbBalance(addr);
      setBnbBalance(balance.formatted);
    }
    logger.ui.success('钱包已解锁');
  };

  const handleOpenSettings = () => {
    chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
  };

  const handleTokenChange = (token: TokenInfo | null, balance: string) => {
    setCurrentToken(token);
    setTokenBalance(balance);
    setStatus(null);
    if (token) {
      logger.ui.info(`已选择代币: ${token.symbol}`);
    }
  };

  const handleBuy = async (amount: string) => {
    if (!currentToken) return;

    logger.ui.info(`开始买入 ${currentToken.symbol}, 金额: ${amount} BNB`);
    setStatus({ type: 'pending', message: '正在执行买入...' });

    try {
      const result = await buyToken(currentToken.address, amount);
      if (result.success) {
        setStatus({
          type: 'success',
          message: `已买入 ${currentToken.symbol}`,
          txHash: result.hash,
        });
        // 刷新余额
        const balance = await getBnbBalance(address);
        setBnbBalance(balance.formatted);
      } else {
        setStatus({ type: 'error', message: '交易失败' });
      }
    } catch (err: any) {
      logger.ui.error(`买入失败: ${err.message}`);
      setStatus({ type: 'error', message: err.message || '买入失败' });
    }
  };

  const handleSell = async (percentage: number) => {
    if (!currentToken) return;

    logger.ui.info(`开始卖出 ${currentToken.symbol}, 比例: ${percentage}%`);
    setStatus({ type: 'pending', message: `正在卖出 ${percentage}%...` });

    try {
      const result = await sellToken(currentToken.address, percentage);
      if (result.success) {
        setStatus({
          type: 'success',
          message: `已卖出 ${percentage}% ${currentToken.symbol}`,
          txHash: result.hash,
        });
        // 刷新余额
        const balance = await getBnbBalance(address);
        setBnbBalance(balance.formatted);
      } else {
        setStatus({ type: 'error', message: '交易失败' });
      }
    } catch (err: any) {
      logger.ui.error(`卖出失败: ${err.message}`);
      setStatus({ type: 'error', message: err.message || '卖出失败' });
    }
  };

  const handleLock = () => {
    logger.ui.info('锁定钱包');
    lockWallet();
    setUnlocked(false);
    setAddress('');
    setBnbBalance('0');
  };

  if (!settings) return null;

  return (
    <div class={`bsc-panel ${minimized ? 'minimized' : ''}`}>
      <div class="bsc-panel-header">
        <div class="bsc-panel-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          <span>BSC 快速交易</span>
        </div>
        <div class="bsc-panel-controls">
          <button class="bsc-panel-btn" onClick={handleOpenSettings} title="设置">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m17.5-6.5l-4.2 4.2m-6.6 0L3.5 5.5m17 13l-4.2-4.2m-6.6 0l-4.2 4.2" />
            </svg>
          </button>
          <button class="bsc-panel-btn" onClick={() => setMinimized(!minimized)} title={minimized ? '展开' : '最小化'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              {minimized ? (
                <polyline points="15 3 21 3 21 9" />
              ) : (
                <line x1="5" y1="12" x2="19" y2="12" />
              )}
            </svg>
          </button>
        </div>
      </div>

      <div class="bsc-panel-body">
        {!unlocked ? (
          <UnlockForm
            onUnlock={handleUnlock}
            hasWallet={walletExists}
            onImportClick={handleOpenSettings}
          />
        ) : (
          <>
            {/* 钱包信息 */}
            <div class="bsc-wallet-info">
              <span class="bsc-wallet-address">{formatAddress(address)}</span>
              <span class="bsc-wallet-balance">
                {parseFloat(bnbBalance).toFixed(4)} BNB
              </span>
            </div>

            {/* 代币输入 */}
            <TokenInput
              walletAddress={address}
              onTokenChange={handleTokenChange}
            />

            {/* 买入按钮 */}
            <BuyButtons
              amounts={settings.buyAmounts}
              disabled={!currentToken}
              onBuy={handleBuy}
            />

            {/* 卖出按钮 */}
            <SellButtons
              percentages={settings.sellPercentages}
              disabled={!currentToken || parseFloat(tokenBalance) === 0}
              onSell={handleSell}
            />

            {/* 状态 */}
            {status && (
              <StatusMessage
                type={status.type}
                message={status.message}
                txHash={status.txHash}
              />
            )}

            {/* 设置行 */}
            <div class="bsc-settings-row">
              <div class="bsc-setting-item">
                <span>滑点:</span>
                <span>{settings.slippage}%</span>
              </div>
              <div class="bsc-setting-item">
                <span>Gas:</span>
                <span>{settings.gasPriceGwei} Gwei</span>
              </div>
              <button
                class="bsc-link"
                onClick={handleLock}
                style={{ marginLeft: 'auto' }}
              >
                锁定
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
