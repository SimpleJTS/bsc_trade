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
}

export interface WalletData {
  encryptedPrivateKey: string;
  address: string;
  iv: string;
  salt: string;
}

const STORAGE_KEYS = {
  SETTINGS: 'bsc_trade_settings',
  WALLET: 'bsc_trade_wallet',
};

// Get default settings
export function getDefaultSettings(): UserSettings {
  return {
    buyAmounts: DEFAULT_BUY_AMOUNTS,
    sellPercentages: DEFAULT_SELL_PERCENTAGES,
    slippage: DEFAULT_SLIPPAGE,
    gasPriceGwei: DEFAULT_GAS_PRICE_GWEI,
    rpcUrl: BSC_RPC_URL,
  };
}

// Load settings from Chrome storage
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

// Save settings to Chrome storage
export async function saveSettings(settings: UserSettings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings }, resolve);
  });
}

// Load wallet data from Chrome storage
export async function loadWalletData(): Promise<WalletData | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.WALLET], (result) => {
      resolve(result[STORAGE_KEYS.WALLET] || null);
    });
  });
}

// Save wallet data to Chrome storage
export async function saveWalletData(data: WalletData): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.WALLET]: data }, resolve);
  });
}

// Clear wallet data
export async function clearWalletData(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove([STORAGE_KEYS.WALLET], resolve);
  });
}

// Clear all data
export async function clearAllData(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.clear(resolve);
  });
}
