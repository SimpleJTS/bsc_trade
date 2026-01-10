import { useState } from 'preact/hooks';

interface BuyButtonsProps {
  amounts: number[];
  disabled: boolean;
  onBuy: (amount: string) => Promise<void>;
}

export function BuyButtons({ amounts, disabled, onBuy }: BuyButtonsProps) {
  const [customAmount, setCustomAmount] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const handleBuy = async (amount: string) => {
    if (loading || disabled) return;
    setLoading(amount);
    try {
      await onBuy(amount);
    } finally {
      setLoading(null);
    }
  };

  const handleCustomBuy = () => {
    if (customAmount && parseFloat(customAmount) > 0) {
      handleBuy(customAmount);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCustomBuy();
    }
  };

  return (
    <div class="bsc-section">
      <div class="bsc-section-title">
        <span>⚡</span>
        <span>Quick Buy (BNB)</span>
      </div>
      <div class="bsc-btn-grid with-custom">
        {amounts.map((amount) => (
          <button
            key={amount}
            class="bsc-btn bsc-btn-buy"
            disabled={disabled || loading !== null}
            onClick={() => handleBuy(amount.toString())}
          >
            {loading === amount.toString() ? (
              <span class="bsc-spinner"></span>
            ) : (
              amount
            )}
          </button>
        ))}
        <input
          type="number"
          class="bsc-custom-input"
          placeholder="Custom"
          value={customAmount}
          onInput={(e) => setCustomAmount((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || loading !== null}
          step="0.01"
          min="0"
        />
      </div>
    </div>
  );
}
