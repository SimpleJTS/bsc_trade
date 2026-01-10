import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import {
  loadSettings,
  saveSettings,
  loadWalletData,
  clearAllData,
  type UserSettings,
} from '@/core/storage';
import { importWallet, isValidPrivateKey } from '@/core/wallet';

type Tab = 'wallet' | 'trading' | 'advanced';

function App() {
  const [tab, setTab] = useState<Tab>('wallet');
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
    return <div style={{ padding: '20px', textAlign: 'center' }}>加载中...</div>;
  }

  return (
    <div>
      <div class="popup-header">
        <h1>⚡ BSC 快速交易</h1>
      </div>

      <div class="tabs">
        <button class={`tab ${tab === 'wallet' ? 'active' : ''}`} onClick={() => setTab('wallet')}>
          钱包
        </button>
        <button class={`tab ${tab === 'trading' ? 'active' : ''}`} onClick={() => setTab('trading')}>
          交易
        </button>
        <button class={`tab ${tab === 'advanced' ? 'active' : ''}`} onClick={() => setTab('advanced')}>
          高级
        </button>
      </div>

      {status && <div class={`status ${status.type}`}>{status.message}</div>}

      {tab === 'wallet' && (
        <WalletTab
          walletAddress={walletAddress}
          onWalletImport={(address) => {
            setWalletAddress(address);
            showStatus('success', '钱包已导入');
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
            showStatus('success', '已保存');
          }}
        />
      )}

      {tab === 'advanced' && (
        <AdvancedTab
          settings={settings}
          onSave={async (newSettings) => {
            await saveSettings(newSettings);
            setSettings(newSettings);
            showStatus('success', '已保存');
          }}
          onClearData={async () => {
            await clearAllData();
            setWalletAddress(null);
            const defaultSettings = await loadSettings();
            setSettings(defaultSettings);
            showStatus('success', '已清除');
          }}
        />
      )}
    </div>
  );
}

// 钱包
function WalletTab({ walletAddress, onWalletImport, onError }: {
  walletAddress: string | null;
  onWalletImport: (address: string) => void;
  onError: (message: string) => void;
}) {
  const [privateKey, setPrivateKey] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!privateKey) {
      onError('请输入私钥');
      return;
    }

    if (!isValidPrivateKey(privateKey)) {
      onError('私钥格式无效');
      return;
    }

    setLoading(true);
    try {
      const address = await importWallet(privateKey);
      onWalletImport(address);
      setPrivateKey('');
    } catch (err: any) {
      onError(err.message || '导入失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {walletAddress && (
        <div class="section">
          <div class="section-title">当前钱包</div>
          <div class="wallet-info">
            <div class="wallet-address">{walletAddress}</div>
          </div>
        </div>
      )}

      <div class="section">
        <div class="section-title">{walletAddress ? '更换钱包' : '导入钱包'}</div>
        <div class="form-group">
          <input
            type="password"
            class="input"
            placeholder="输入私钥"
            value={privateKey}
            onInput={(e) => setPrivateKey((e.target as HTMLInputElement).value)}
          />
        </div>
        <button class="btn btn-primary" onClick={handleImport} disabled={loading}>
          {loading ? '...' : '导入'}
        </button>
      </div>
    </div>
  );
}

// 交易设置
function TradingTab({ settings, onSave }: {
  settings: UserSettings;
  onSave: (settings: UserSettings) => Promise<void>;
}) {
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

  const addSellPct = () => {
    const pct = parseInt(newSellPct);
    if (pct > 0 && pct <= 100 && !sellPercentages.includes(pct)) {
      setSellPercentages([...sellPercentages, pct].sort((a, b) => a - b));
      setNewSellPct('');
    }
  };

  return (
    <div>
      <div class="section">
        <div class="section-title">买入金额 (BNB)</div>
        <div class="preset-editor">
          {buyAmounts.map((amount) => (
            <div class="preset-tag" key={amount}>
              <span>{amount}</span>
              <button onClick={() => setBuyAmounts(buyAmounts.filter(a => a !== amount))}>×</button>
            </div>
          ))}
        </div>
        <div class="preset-add">
          <input
            type="number"
            placeholder="金额"
            value={newBuyAmount}
            onInput={(e) => setNewBuyAmount((e.target as HTMLInputElement).value)}
            step="0.01"
          />
          <button onClick={addBuyAmount}>+</button>
        </div>
      </div>

      <div class="section">
        <div class="section-title">卖出比例 (%)</div>
        <div class="preset-editor">
          {sellPercentages.map((pct) => (
            <div class="preset-tag" key={pct}>
              <span>{pct}%</span>
              <button onClick={() => setSellPercentages(sellPercentages.filter(p => p !== pct))}>×</button>
            </div>
          ))}
        </div>
        <div class="preset-add">
          <input
            type="number"
            placeholder="%"
            value={newSellPct}
            onInput={(e) => setNewSellPct((e.target as HTMLInputElement).value)}
            max="100"
          />
          <button onClick={addSellPct}>+</button>
        </div>
      </div>

      <button class="btn btn-primary" onClick={() => onSave({ ...settings, buyAmounts, sellPercentages })}>
        保存
      </button>
    </div>
  );
}

// 高级设置
function AdvancedTab({ settings, onSave, onClearData }: {
  settings: UserSettings;
  onSave: (settings: UserSettings) => Promise<void>;
  onClearData: () => Promise<void>;
}) {
  const [slippage, setSlippage] = useState(settings.slippage.toString());
  const [gasPrice, setGasPrice] = useState(settings.gasPriceGwei.toString());
  const [rpcUrl, setRpcUrl] = useState(settings.rpcUrl);

  const handleSave = () => {
    onSave({
      ...settings,
      slippage: parseFloat(slippage) || 12,
      gasPriceGwei: parseFloat(gasPrice) || 5,
      rpcUrl: rpcUrl || settings.rpcUrl,
    });
  };

  return (
    <div>
      <div class="section">
        <div class="form-group">
          <label class="form-label">滑点 (%)</label>
          <input
            type="number"
            class="input"
            value={slippage}
            onInput={(e) => setSlippage((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="form-group">
          <label class="form-label">Gas (Gwei)</label>
          <input
            type="number"
            class="input"
            value={gasPrice}
            onInput={(e) => setGasPrice((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="form-group">
          <label class="form-label">RPC</label>
          <input
            type="text"
            class="input"
            value={rpcUrl}
            onInput={(e) => setRpcUrl((e.target as HTMLInputElement).value)}
          />
        </div>
      </div>

      <button class="btn btn-primary" onClick={handleSave} style={{ marginBottom: '12px' }}>
        保存
      </button>

      <button class="btn btn-danger" onClick={onClearData}>
        清除数据
      </button>
    </div>
  );
}

render(<App />, document.getElementById('app')!);
