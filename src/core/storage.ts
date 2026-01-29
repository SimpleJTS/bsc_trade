import {
  DEFAULT_BUY_AMOUNTS,
  DEFAULT_SELL_PERCENTAGES,
  DEFAULT_SLIPPAGE,
  DEFAULT_GAS_PRICE_GWEI,
  BSC_RPC_URL,
} from '@/config/constants';

export interface UserSettings {
  buyAmounts: number[];
  sellPercentages: number[];
  slippage: number;
  gasPriceGwei: number;
  rpcUrl: string;
  aggressiveMode?: boolean; // 激进模式：跳过报价获取，直接发送交易
}

export interface WalletData {
  privateKey: string; // Base64编码的私钥
  address: string;
}

const STORAGE_KEYS = {
  SETTINGS: 'bsc_trade_settings',
  WALLET: 'bsc_trade_wallet',
};

// 简单编码 (非加密，仅混淆)
export function encodeKey(key: string): string {
  return btoa(key.split('').reverse().join(''));
}

// 简单解码
export function decodeKey(encoded: string): string {
  return atob(encoded).split('').reverse().join('');
}

// 获取默认设置
export function getDefaultSettings(): UserSettings {
  return {
    buyAmounts: DEFAULT_BUY_AMOUNTS,
    sellPercentages: DEFAULT_SELL_PERCENTAGES,
    slippage: DEFAULT_SLIPPAGE,
    gasPriceGwei: DEFAULT_GAS_PRICE_GWEI,
    rpcUrl: BSC_RPC_URL,
    aggressiveMode: false, // 默认关闭激进模式
  };
}

// 加载设置
export async function loadSettings(): Promise<UserSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.SETTINGS], (result) => {
      if (result[STORAGE_KEYS.SETTINGS]) {
        resolve({ ...getDefaultSettings(), ...result[STORAGE_KEYS.SETTINGS] });
      } else {
        resolve(getDefaultSettings());
      }
    });
  });
}

// 保存设置
export async function saveSettings(settings: UserSettings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings }, resolve);
  });
}

// 加载钱包数据
export async function loadWalletData(): Promise<WalletData | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.WALLET], (result) => {
      resolve(result[STORAGE_KEYS.WALLET] || null);
    });
  });
}

// 保存钱包数据
export async function saveWalletData(data: WalletData): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.WALLET]: data }, resolve);
  });
}

// 清除钱包数据
export async function clearWalletData(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove([STORAGE_KEYS.WALLET], resolve);
  });
}

// 清除所有数据
export async function clearAllData(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.clear(resolve);
  });
}
