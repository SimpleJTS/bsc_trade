import { useState, useEffect } from 'preact/hooks';
import { isValidAddress, getTokenInfo, getTokenBalance, formatTokenAmount, type TokenInfo } from '@/core/token';

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

      try {
        const tokenInfo = await getTokenInfo(address);
        const tokenBalance = await getTokenBalance(address, walletAddress);

        setToken(tokenInfo);
        setBalance(tokenBalance.formatted);
        onTokenChange(tokenInfo, tokenBalance.formatted);
      } catch (err: any) {
        setError(err.message || 'Invalid token');
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
      }
    } catch {
      // Clipboard access denied
    }
  };

  return (
    <div class="bsc-section">
      <div class="bsc-section-title">
        <span>Token Contract Address (CA)</span>
      </div>
      <div class="bsc-input-group">
        <input
          type="text"
          class="bsc-input"
          placeholder="Paste token contract address..."
          value={address}
          onInput={(e) => setAddress((e.target as HTMLInputElement).value)}
          onFocus={handlePaste}
        />
      </div>

      {loading && (
        <div class="bsc-token-info">
          <span style={{ color: '#888' }}>Loading...</span>
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
            Balance: {formatTokenAmount(balance)}
          </span>
        </div>
      )}
    </div>
  );
}
