import { useState } from 'preact/hooks';
import { logger } from '@/core/logger';

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
      logger.ui.error(`解锁失败: ${err.message}`);
      setError(err.message || '解锁失败');
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
          未找到钱包，请在扩展设置中导入钱包
        </p>
        <button class="bsc-btn" onClick={onImportClick}>
          打开设置
        </button>
      </div>
    );
  }

  return (
    <div class="bsc-unlock-form">
      <input
        type="password"
        class="bsc-input"
        placeholder="输入密码解锁钱包"
        value={password}
        onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
        disabled={loading}
      />
      {error && <div class="bsc-status error">{error}</div>}
      <button class="bsc-btn" onClick={handleUnlock} disabled={loading || !password}>
        {loading ? <span class="bsc-spinner"></span> : '解锁钱包'}
      </button>
    </div>
  );
}
