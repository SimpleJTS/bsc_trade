import { useState } from 'preact/hooks';

interface UnlockFormProps {
  onUnlock: (password: string) => Promise<void>;
  hasWallet: boolean;
  onImportClick: () => void;
}

export function UnlockForm({ onUnlock, hasWallet, onImportClick }: UnlockFormProps) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleUnlock = async () => {
    if (!password) return;
    setLoading(true);
    setError('');

    try {
      await onUnlock(password);
    } catch (err: any) {
      setError(err.message || 'Failed to unlock');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleUnlock();
    }
  };

  if (!hasWallet) {
    return (
      <div class="bsc-unlock-form">
        <p style={{ textAlign: 'center', color: '#888', margin: '20px 0' }}>
          No wallet found. Please import your wallet in the extension settings.
        </p>
        <button class="bsc-btn" onClick={onImportClick}>
          Open Settings
        </button>
      </div>
    );
  }

  return (
    <div class="bsc-unlock-form">
      <input
        type="password"
        class="bsc-input"
        placeholder="Enter password to unlock"
        value={password}
        onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
        disabled={loading}
      />
      {error && <div class="bsc-status error">{error}</div>}
      <button class="bsc-btn" onClick={handleUnlock} disabled={loading || !password}>
        {loading ? <span class="bsc-spinner"></span> : 'Unlock Wallet'}
      </button>
    </div>
  );
}
