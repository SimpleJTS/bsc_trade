import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import {
  loadSettings,
  saveSettings,
  loadWalletData,
  clearAllData,
  type UserSettings,
} from '@/core/storage';
import { importWallet, exportPrivateKey, hasWallet } from '@/core/wallet';
import { isValidPrivateKey } from '@/core/crypto';

type Tab = 'wallet' | 'trading' | 'advanced';

function App() {
  const [tab, setTab] = useState<Tab>('wallet');
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load data on mount
  useEffect(() => {
    const load = async () => {
      const userSettings = await loadSettings();
      setSettings(userSettings);

      const walletData = await loadWalletData();
      if (walletData) {
        setWalletAddress(walletData.address);
      }
    };
    load();
  }, []);

  const showStatus = (type: 'success' | 'error', message: string) => {
    setStatus({ type, message });
    setTimeout(() => setStatus(null), 3000);
  };

  if (!settings) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>;
  }

  return (
    <div>
      <div class="popup-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
        <h1>BSC Quick Trade</h1>
      </div>

      <div class="tabs">
        <button class={`tab ${tab === 'wallet' ? 'active' : ''}`} onClick={() => setTab('wallet')}>
          Wallet
        </button>
        <button class={`tab ${tab === 'trading' ? 'active' : ''}`} onClick={() => setTab('trading')}>
          Trading
        </button>
        <button class={`tab ${tab === 'advanced' ? 'active' : ''}`} onClick={() => setTab('advanced')}>
          Advanced
        </button>
      </div>

      {status && <div class={`status ${status.type}`}>{status.message}</div>}

      {tab === 'wallet' && (
        <WalletTab
          walletAddress={walletAddress}
          onWalletImport={(address) => {
            setWalletAddress(address);
            showStatus('success', 'Wallet imported successfully');
          }}
          onError={(msg) => showStatus('error', msg)}
        />
      )}

      {tab === 'trading' && (
        <TradingTab
          settings={settings}
          onSave={async (newSettings) => {
            await saveSettings(newSettings);
            setSettings(newSettings);
            showStatus('success', 'Settings saved');
          }}
        />
      )}

      {tab === 'advanced' && (
        <AdvancedTab
          settings={settings}
          onSave={async (newSettings) => {
            await saveSettings(newSettings);
            setSettings(newSettings);
            showStatus('success', 'Settings saved');
          }}
          onClearData={async () => {
            await clearAllData();
            setWalletAddress(null);
            const defaultSettings = await loadSettings();
            setSettings(defaultSettings);
            showStatus('success', 'All data cleared');
          }}
        />
      )}
    </div>
  );
}

// Wallet Tab
interface WalletTabProps {
  walletAddress: string | null;
  onWalletImport: (address: string) => void;
  onError: (message: string) => void;
}

function WalletTab({ walletAddress, onWalletImport, onError }: WalletTabProps) {
  const [privateKey, setPrivateKey] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportedKey, setExportedKey] = useState('');

  const handleImport = async () => {
    if (!privateKey || !password) {
      onError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      onError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      onError('Password must be at least 6 characters');
      return;
    }

    if (!isValidPrivateKey(privateKey)) {
      onError('Invalid private key format');
      return;
    }

    setLoading(true);
    try {
      const address = await importWallet(privateKey, password);
      onWalletImport(address);
      setPrivateKey('');
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      onError(err.message || 'Failed to import wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!exportPassword) {
      onError('Please enter your password');
      return;
    }

    try {
      const key = await exportPrivateKey(exportPassword);
      setExportedKey(key);
    } catch (err: any) {
      onError(err.message || 'Invalid password');
    }
  };

  return (
    <div>
      {walletAddress ? (
        <div class="section">
          <div class="section-title">Current Wallet</div>
          <div class="wallet-info">
            <div class="wallet-address">{walletAddress}</div>
          </div>

          {!showExport ? (
            <button class="btn btn-secondary" onClick={() => setShowExport(true)}>
              Export Private Key
            </button>
          ) : (
            <div>
              {exportedKey ? (
                <div>
                  <div class="form-group">
                    <label class="form-label">Your Private Key (keep it safe!)</label>
                    <input
                      type="text"
                      class="input"
                      value={exportedKey}
                      readOnly
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                  </div>
                  <button class="btn btn-secondary" onClick={() => {
                    setShowExport(false);
                    setExportedKey('');
                    setExportPassword('');
                  }}>
                    Hide
                  </button>
                </div>
              ) : (
                <div>
                  <div class="form-group">
                    <label class="form-label">Enter Password</label>
                    <input
                      type="password"
                      class="input"
                      placeholder="Your password"
                      value={exportPassword}
                      onInput={(e) => setExportPassword((e.target as HTMLInputElement).value)}
                    />
                  </div>
                  <div class="btn-group">
                    <button class="btn btn-secondary" onClick={() => setShowExport(false)}>
                      Cancel
                    </button>
                    <button class="btn btn-primary" onClick={handleExport}>
                      Export
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: '20px' }}>
            <div class="section-title">Import New Wallet</div>
          </div>
        </div>
      ) : null}

      <div class="section">
        {!walletAddress && <div class="section-title">Import Wallet</div>}
        <div class="form-group">
          <label class="form-label">Private Key</label>
          <input
            type="password"
            class="input"
            placeholder="Enter your private key"
            value={privateKey}
            onInput={(e) => setPrivateKey((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input
            type="password"
            class="input"
            placeholder="Create a password (min 6 characters)"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="form-group">
          <label class="form-label">Confirm Password</label>
          <input
            type="password"
            class="input"
            placeholder="Confirm your password"
            value={confirmPassword}
            onInput={(e) => setConfirmPassword((e.target as HTMLInputElement).value)}
          />
        </div>
        <button class="btn btn-primary" onClick={handleImport} disabled={loading}>
          {loading ? <span class="spinner"></span> : 'Import Wallet'}
        </button>
      </div>
    </div>
  );
}

// Trading Tab
interface TradingTabProps {
  settings: UserSettings;
  onSave: (settings: UserSettings) => Promise<void>;
}

function TradingTab({ settings, onSave }: TradingTabProps) {
  const [buyAmounts, setBuyAmounts] = useState(settings.buyAmounts);
  const [sellPercentages, setSellPercentages] = useState(settings.sellPercentages);
  const [newBuyAmount, setNewBuyAmount] = useState('');
  const [newSellPct, setNewSellPct] = useState('');

  const addBuyAmount = () => {
    const amount = parseFloat(newBuyAmount);
    if (amount > 0 && !buyAmounts.includes(amount)) {
      setBuyAmounts([...buyAmounts, amount].sort((a, b) => a - b));
      setNewBuyAmount('');
    }
  };

  const removeBuyAmount = (amount: number) => {
    setBuyAmounts(buyAmounts.filter((a) => a !== amount));
  };

  const addSellPct = () => {
    const pct = parseInt(newSellPct);
    if (pct > 0 && pct <= 100 && !sellPercentages.includes(pct)) {
      setSellPercentages([...sellPercentages, pct].sort((a, b) => a - b));
      setNewSellPct('');
    }
  };

  const removeSellPct = (pct: number) => {
    setSellPercentages(sellPercentages.filter((p) => p !== pct));
  };

  const handleSave = () => {
    onSave({
      ...settings,
      buyAmounts,
      sellPercentages,
    });
  };

  return (
    <div>
      <div class="section">
        <div class="section-title">Buy Amounts (BNB)</div>
        <div class="preset-editor">
          {buyAmounts.map((amount) => (
            <div class="preset-tag" key={amount}>
              <span>{amount}</span>
              <button onClick={() => removeBuyAmount(amount)}>×</button>
            </div>
          ))}
        </div>
        <div class="preset-add">
          <input
            type="number"
            placeholder="Amount"
            value={newBuyAmount}
            onInput={(e) => setNewBuyAmount((e.target as HTMLInputElement).value)}
            step="0.01"
            min="0"
          />
          <button onClick={addBuyAmount}>Add</button>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Sell Percentages (%)</div>
        <div class="preset-editor">
          {sellPercentages.map((pct) => (
            <div class="preset-tag" key={pct}>
              <span>{pct}%</span>
              <button onClick={() => removeSellPct(pct)}>×</button>
            </div>
          ))}
        </div>
        <div class="preset-add">
          <input
            type="number"
            placeholder="%"
            value={newSellPct}
            onInput={(e) => setNewSellPct((e.target as HTMLInputElement).value)}
            step="1"
            min="1"
            max="100"
          />
          <button onClick={addSellPct}>Add</button>
        </div>
      </div>

      <button class="btn btn-primary" onClick={handleSave}>
        Save Settings
      </button>
    </div>
  );
}

// Advanced Tab
interface AdvancedTabProps {
  settings: UserSettings;
  onSave: (settings: UserSettings) => Promise<void>;
  onClearData: () => Promise<void>;
}

function AdvancedTab({ settings, onSave, onClearData }: AdvancedTabProps) {
  const [slippage, setSlippage] = useState(settings.slippage.toString());
  const [gasPrice, setGasPrice] = useState(settings.gasPriceGwei.toString());
  const [rpcUrl, setRpcUrl] = useState(settings.rpcUrl);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleSave = () => {
    const slip = parseFloat(slippage);
    const gas = parseFloat(gasPrice);

    if (isNaN(slip) || slip < 0 || slip > 100) {
      return;
    }

    if (isNaN(gas) || gas < 1) {
      return;
    }

    onSave({
      ...settings,
      slippage: slip,
      gasPriceGwei: gas,
      rpcUrl: rpcUrl || settings.rpcUrl,
    });
  };

  return (
    <div>
      <div class="section">
        <div class="section-title">Trading Settings</div>
        <div class="form-group">
          <label class="form-label">Slippage Tolerance</label>
          <div class="input-with-unit">
            <input
              type="number"
              class="input"
              value={slippage}
              onInput={(e) => setSlippage((e.target as HTMLInputElement).value)}
              min="0"
              max="100"
              step="0.5"
            />
            <span class="input-unit">%</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Gas Price</label>
          <div class="input-with-unit">
            <input
              type="number"
              class="input"
              value={gasPrice}
              onInput={(e) => setGasPrice((e.target as HTMLInputElement).value)}
              min="1"
              step="0.5"
            />
            <span class="input-unit">Gwei</span>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">RPC Node</div>
        <div class="form-group">
          <input
            type="text"
            class="input"
            placeholder="https://bsc-dataseed1.binance.org"
            value={rpcUrl}
            onInput={(e) => setRpcUrl((e.target as HTMLInputElement).value)}
          />
        </div>
      </div>

      <button class="btn btn-primary" onClick={handleSave} style={{ marginBottom: '16px' }}>
        Save Settings
      </button>

      <div class="section">
        <div class="section-title">Danger Zone</div>
        {!showClearConfirm ? (
          <button class="btn btn-danger" onClick={() => setShowClearConfirm(true)}>
            Clear All Data
          </button>
        ) : (
          <div>
            <p style={{ marginBottom: '12px', color: '#ff5252' }}>
              This will delete your wallet and all settings. Are you sure?
            </p>
            <div class="btn-group">
              <button class="btn btn-secondary" onClick={() => setShowClearConfirm(false)}>
                Cancel
              </button>
              <button class="btn btn-danger" onClick={onClearData}>
                Yes, Clear All
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Mount app
render(<App />, document.getElementById('app')!);
