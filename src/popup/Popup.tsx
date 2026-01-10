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

  // 加载数据
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
        <h1>BSC 快速交易</h1>
      </div>

      <div class="tabs">
        <button class={`tab ${tab === 'wallet' ? 'active' : ''}`} onClick={() => setTab('wallet')}>
          钱包
        </button>
        <button class={`tab ${tab === 'trading' ? 'active' : ''}`} onClick={() => setTab('trading')}>
          交易设置
        </button>
        <button class={`tab ${tab === 'advanced' ? 'active' : ''}`} onClick={() => setTab('advanced')}>
          高级设置
        </button>
      </div>

      {status && <div class={`status ${status.type}`}>{status.message}</div>}

      {tab === 'wallet' && (
        <WalletTab
          walletAddress={walletAddress}
          onWalletImport={(address) => {
            setWalletAddress(address);
            showStatus('success', '钱包导入成功');
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
            showStatus('success', '设置已保存');
          }}
        />
      )}

      {tab === 'advanced' && (
        <AdvancedTab
          settings={settings}
          onSave={async (newSettings) => {
            await saveSettings(newSettings);
            setSettings(newSettings);
            showStatus('success', '设置已保存');
          }}
          onClearData={async () => {
            await clearAllData();
            setWalletAddress(null);
            const defaultSettings = await loadSettings();
            setSettings(defaultSettings);
            showStatus('success', '所有数据已清除');
          }}
        />
      )}
    </div>
  );
}

// 钱包标签页
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
      onError('请填写所有字段');
      return;
    }

    if (password !== confirmPassword) {
      onError('两次输入的密码不一致');
      return;
    }

    if (password.length < 6) {
      onError('密码至少需要6个字符');
      return;
    }

    if (!isValidPrivateKey(privateKey)) {
      onError('私钥格式无效');
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
      onError(err.message || '钱包导入失败');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!exportPassword) {
      onError('请输入密码');
      return;
    }

    try {
      const key = await exportPrivateKey(exportPassword);
      setExportedKey(key);
    } catch (err: any) {
      onError(err.message || '密码错误');
    }
  };

  return (
    <div>
      {walletAddress ? (
        <div class="section">
          <div class="section-title">当前钱包</div>
          <div class="wallet-info">
            <div class="wallet-address">{walletAddress}</div>
          </div>

          {!showExport ? (
            <button class="btn btn-secondary" onClick={() => setShowExport(true)}>
              导出私钥
            </button>
          ) : (
            <div>
              {exportedKey ? (
                <div>
                  <div class="form-group">
                    <label class="form-label">您的私钥 (请妥善保管!)</label>
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
                    隐藏
                  </button>
                </div>
              ) : (
                <div>
                  <div class="form-group">
                    <label class="form-label">输入密码</label>
                    <input
                      type="password"
                      class="input"
                      placeholder="您的密码"
                      value={exportPassword}
                      onInput={(e) => setExportPassword((e.target as HTMLInputElement).value)}
                    />
                  </div>
                  <div class="btn-group">
                    <button class="btn btn-secondary" onClick={() => setShowExport(false)}>
                      取消
                    </button>
                    <button class="btn btn-primary" onClick={handleExport}>
                      导出
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: '20px' }}>
            <div class="section-title">导入新钱包</div>
          </div>
        </div>
      ) : null}

      <div class="section">
        {!walletAddress && <div class="section-title">导入钱包</div>}
        <div class="form-group">
          <label class="form-label">私钥</label>
          <input
            type="password"
            class="input"
            placeholder="输入您的私钥"
            value={privateKey}
            onInput={(e) => setPrivateKey((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="form-group">
          <label class="form-label">密码</label>
          <input
            type="password"
            class="input"
            placeholder="创建密码 (至少6个字符)"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="form-group">
          <label class="form-label">确认密码</label>
          <input
            type="password"
            class="input"
            placeholder="再次输入密码"
            value={confirmPassword}
            onInput={(e) => setConfirmPassword((e.target as HTMLInputElement).value)}
          />
        </div>
        <button class="btn btn-primary" onClick={handleImport} disabled={loading}>
          {loading ? <span class="spinner"></span> : '导入钱包'}
        </button>
      </div>
    </div>
  );
}

// 交易设置标签页
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
        <div class="section-title">买入金额预设 (BNB)</div>
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
            placeholder="金额"
            value={newBuyAmount}
            onInput={(e) => setNewBuyAmount((e.target as HTMLInputElement).value)}
            step="0.01"
            min="0"
          />
          <button onClick={addBuyAmount}>添加</button>
        </div>
      </div>

      <div class="section">
        <div class="section-title">卖出比例预设 (%)</div>
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
          <button onClick={addSellPct}>添加</button>
        </div>
      </div>

      <button class="btn btn-primary" onClick={handleSave}>
        保存设置
      </button>
    </div>
  );
}

// 高级设置标签页
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
        <div class="section-title">交易设置</div>
        <div class="form-group">
          <label class="form-label">滑点容忍度</label>
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
          <label class="form-label">Gas 价格</label>
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
        <div class="section-title">RPC 节点</div>
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
        保存设置
      </button>

      <div class="section">
        <div class="section-title">危险操作</div>
        {!showClearConfirm ? (
          <button class="btn btn-danger" onClick={() => setShowClearConfirm(true)}>
            清除所有数据
          </button>
        ) : (
          <div>
            <p style={{ marginBottom: '12px', color: '#ff5252' }}>
              这将删除您的钱包和所有设置。确定要继续吗？
            </p>
            <div class="btn-group">
              <button class="btn btn-secondary" onClick={() => setShowClearConfirm(false)}>
                取消
              </button>
              <button class="btn btn-danger" onClick={onClearData}>
                确认清除
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 挂载应用
render(<App />, document.getElementById('app')!);
