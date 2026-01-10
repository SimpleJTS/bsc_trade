import { useState, useEffect } from 'preact/hooks';
import { isValidAddress, getTokenInfo, getTokenBalance, formatTokenAmount, type TokenInfo } from '@/core/token';
import { logger } from '@/core/logger';

interface TokenInputProps {
  walletAddress: string;
  onTokenChange: (token: TokenInfo | null, balance: string) => void;
}

export function TokenInput({ walletAddress, onTokenChange }: TokenInputProps) {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [balance, setBalance] = useState('0');

  useEffect(() => {
    const fetchToken = async () => {
      if (!address || !isValidAddress(address)) {
        setToken(null);
        setBalance('0');
        setError('');
        onTokenChange(null, '0');
        return;
      }

      setLoading(true);
      setError('');
      logger.ui.info(`查询代币信息: ${address}`);

      try {
        const tokenInfo = await getTokenInfo(address);
        const tokenBalance = await getTokenBalance(address, walletAddress);

        setToken(tokenInfo);
        setBalance(tokenBalance.formatted);
        onTokenChange(tokenInfo, tokenBalance.formatted);
        logger.ui.success(`代币加载成功: ${tokenInfo.symbol}`);
      } catch (err: any) {
        logger.ui.error(`代币查询失败: ${err.message}`);
        setError(err.message || '无效的代币');
        setToken(null);
        setBalance('0');
        onTokenChange(null, '0');
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchToken, 500);
    return () => clearTimeout(debounce);
  }, [address, walletAddress]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && isValidAddress(text.trim())) {
        setAddress(text.trim());
        logger.ui.debug('从剪贴板粘贴地址');
      }
    } catch {
      // 剪贴板访问被拒绝
    }
  };

  return (
    <div class="bsc-section">
      <div class="bsc-section-title">
        <span>代币合约地址 (CA)</span>
      </div>
      <div class="bsc-input-group">
        <input
          type="text"
          class="bsc-input"
          placeholder="粘贴代币合约地址..."
          value={address}
          onInput={(e) => setAddress((e.target as HTMLInputElement).value)}
          onFocus={handlePaste}
        />
      </div>

      {loading && (
        <div class="bsc-token-info">
          <span style={{ color: '#888' }}>加载中...</span>
        </div>
      )}

      {error && (
        <div class="bsc-token-info">
          <span style={{ color: '#ff5252' }}>{error}</span>
        </div>
      )}

      {token && !loading && (
        <div class="bsc-token-info">
          <span class="bsc-token-symbol">{token.symbol}</span>
          <span class="bsc-token-balance">
            余额: {formatTokenAmount(balance)}
          </span>
        </div>
      )}
    </div>
  );
}
