import { useState, useEffect, useRef } from 'preact/hooks';
import { isValidAddress } from '@/core/token';

interface TokenInputProps {
  onTokenChange: (address: string | null) => void;
  defaultValue?: string;
}

export function TokenInput({ onTokenChange, defaultValue }: TokenInputProps) {
  const [address, setAddress] = useState(defaultValue || '');
  const [valid, setValid] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // 当 defaultValue 变化时，更新地址（用于从 URL 提取）
  useEffect(() => {
    if (defaultValue && defaultValue !== address) {
      setAddress(defaultValue);
    } else if (!defaultValue && address) {
      // 如果 defaultValue 被清除，但当前有地址，不清除（允许用户手动输入）
      // 只有在 defaultValue 明确变化时才更新
    }
  }, [defaultValue]);

  useEffect(() => {
    const trimmedAddress = address.trim();
    if (trimmedAddress && isValidAddress(trimmedAddress)) {
      setValid(true);
      onTokenChange(trimmedAddress);
      console.log('[TokenInput] 有效地址:', trimmedAddress);
    } else {
      setValid(false);
      onTokenChange(null);
      if (trimmedAddress) {
        console.log('[TokenInput] 无效地址:', trimmedAddress);
      }
    }
  }, [address]);

  // 处理粘贴
  const handlePaste = async (e: ClipboardEvent) => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && isValidAddress(text.trim())) {
        setAddress(text.trim());
        e.preventDefault();
      }
    } catch (error) {
      console.error('[TokenInput] 读取剪贴板失败:', error);
    }
  };

  // 处理输入框焦点
  const handleFocus = () => {
    setFocused(true);
    // 自动尝试从剪贴板粘贴
    navigator.clipboard.readText()
      .then(text => {
        if (text && isValidAddress(text.trim()) && !address) {
          setAddress(text.trim());
        }
      })
      .catch(() => {
        // 忽略剪贴板读取错误
      });
  };

  const handleBlur = () => {
    setFocused(false);
  };

  // 清除输入
  const handleClear = () => {
    setAddress('');
    inputRef.current?.focus();
  };

  // 格式化显示地址（长地址显示省略）
  const formatDisplayAddress = (addr: string) => {
    if (addr.length <= 20) return addr;
    return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
  };

  return (
    <div class="bsc-section">
      <div class="bsc-section-title">
        <span>📍</span>
        <span>代币合约地址 (CA)</span>
      </div>
      <div class="bsc-input-group">
        <div style="position: relative; width: 100%;">
          <input
            ref={inputRef}
            type="text"
            class={`bsc-input ${valid ? 'valid' : address ? 'invalid' : ''} ${focused ? 'focused' : ''}`}
            placeholder="粘贴或输入代币合约地址 (0x...)"
            value={address}
            onInput={(e) => setAddress((e.target as HTMLInputElement).value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onPaste={handlePaste}
            spellcheck={false}
            autocomplete="off"
          />
          {address && (
            <button
              class="bsc-input-clear"
              onClick={handleClear}
              title="清除"
              type="button"
            >
              ×
            </button>
          )}
        </div>
        {address && (
          <div class="bsc-input-hint">
            {valid ? (
              <span style="color: #4ade80;">✓ 有效地址: {formatDisplayAddress(address)}</span>
            ) : (
              <span style="color: #f87171;">✗ 无效地址，请检查格式</span>
            )}
          </div>
        )}
        {!address && (
          <div class="bsc-input-hint">
            <span style="color: #888; font-size: 11px;">
              提示: 输入焦点时会自动从剪贴板粘贴
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
