import { useState, useEffect } from 'preact/hooks';
import { isValidAddress } from '@/core/token';
import { logger } from '@/core/logger';

interface TokenInputProps {
  onTokenChange: (address: string | null) => void;
}

export function TokenInput({ onTokenChange }: TokenInputProps) {
  const [address, setAddress] = useState('');
  const [valid, setValid] = useState(false);

  useEffect(() => {
    if (address && isValidAddress(address)) {
      setValid(true);
      onTokenChange(address);
      logger.ui.info(`代币地址: ${address}`);
    } else {
      setValid(false);
      onTokenChange(null);
    }
  }, [address]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && isValidAddress(text.trim())) {
        setAddress(text.trim());
      }
    } catch {
      // 忽略
    }
  };

  return (
    <div class="bsc-section">
      <div class="bsc-input-group">
        <input
          type="text"
          class={`bsc-input ${valid ? 'valid' : ''}`}
          placeholder="粘贴代币CA..."
          value={address}
          onInput={(e) => setAddress((e.target as HTMLInputElement).value)}
          onFocus={handlePaste}
        />
      </div>
    </div>
  );
}
