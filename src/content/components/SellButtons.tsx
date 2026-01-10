import { useState } from 'preact/hooks';

interface SellButtonsProps {
  percentages: number[];
  disabled: boolean;
  onSell: (percentage: number) => Promise<void>;
}

export function SellButtons({ percentages, disabled, onSell }: SellButtonsProps) {
  const [customPercentage, setCustomPercentage] = useState('');
  const [loading, setLoading] = useState<number | null>(null);

  const handleSell = async (percentage: number) => {
    if (loading || disabled) return;
    setLoading(percentage);
    try {
      await onSell(percentage);
    } finally {
      setLoading(null);
    }
  };

  const handleCustomSell = () => {
    const pct = parseInt(customPercentage);
    if (pct > 0 && pct <= 100) {
      handleSell(pct);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCustomSell();
    }
  };

  return (
    <div class="bsc-section">
      <div class="bsc-section-title">
        <span>📤</span>
        <span>快速卖出</span>
      </div>
      <div class="bsc-btn-grid with-custom">
        {percentages.map((pct) => (
          <button
            key={pct}
            class="bsc-btn bsc-btn-sell"
            disabled={disabled || loading !== null}
            onClick={() => handleSell(pct)}
          >
            {loading === pct ? (
              <span class="bsc-spinner"></span>
            ) : (
              `${pct}%`
            )}
          </button>
        ))}
        <input
          type="number"
          class="bsc-custom-input"
          placeholder="%"
          value={customPercentage}
          onInput={(e) => setCustomPercentage((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || loading !== null}
          step="1"
          min="1"
          max="100"
        />
      </div>
    </div>
  );
}
