import { ethers } from 'ethers';
import { loadWalletData, saveWalletData, clearWalletData, loadSettings, encodeKey, decodeKey } from './storage';
import { BSC_RPC_URL } from '@/config/constants';
import { logger, timerStart, timerEnd } from './logger';

let cachedWallet: ethers.Wallet | null = null;
let cachedProvider: ethers.JsonRpcProvider | null = null;

// 获取BSC Provider
export async function getProvider(): Promise<ethers.JsonRpcProvider> {
  if (cachedProvider) return cachedProvider;

  const settings = await loadSettings();
  const rpcUrl = settings.rpcUrl || BSC_RPC_URL;
  logger.wallet.info(`连接RPC: ${rpcUrl}`);

  cachedProvider = new ethers.JsonRpcProvider(rpcUrl);
  return cachedProvider;
}

// 重置Provider
export function resetProvider(): void {
  cachedProvider = null;
}

// 验证私钥格式
export function isValidPrivateKey(privateKey: string): boolean {
  const key = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  return /^[a-fA-F0-9]{64}$/.test(key);
}

// 导入钱包 (直接保存，无需密码)
export async function importWallet(privateKey: string): Promise<string> {
  timerStart('import', '导入钱包');

  if (!isValidPrivateKey(privateKey)) {
    logger.wallet.error('私钥格式无效');
    throw new Error('私钥格式无效');
  }

  const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  const wallet = new ethers.Wallet(formattedKey);

  // 保存钱包 (简单编码)
  await saveWalletData({
    privateKey: encodeKey(formattedKey),
    address: wallet.address,
  });

  // 立即缓存
  const provider = await getProvider();
  cachedWallet = wallet.connect(provider);

  timerEnd('import');
  logger.wallet.success(`钱包已导入: ${wallet.address}`);

  return wallet.address;
}

// 自动加载钱包 (页面打开时调用)
export async function autoLoadWallet(): Promise<boolean> {
  const walletData = await loadWalletData();
  if (!walletData) {
    logger.wallet.debug('未找到钱包数据');
    return false;
  }

  try {
    const privateKey = decodeKey(walletData.privateKey);
    const provider = await getProvider();
    cachedWallet = new ethers.Wallet(privateKey, provider);
    logger.wallet.success(`钱包已自动加载: ${walletData.address}`);
    return true;
  } catch (error) {
    logger.wallet.error('钱包加载失败');
    return false;
  }
}

// 获取当前钱包
export function getWallet(): ethers.Wallet | null {
  return cachedWallet;
}

// 获取签名器
export async function getSigner(): Promise<ethers.Wallet> {
  if (!cachedWallet) {
    // 尝试自动加载
    const loaded = await autoLoadWallet();
    if (!loaded || !cachedWallet) {
      throw new Error('钱包未导入');
    }
  }
  return cachedWallet;
}

// 检查是否有钱包
export async function hasWallet(): Promise<boolean> {
  if (cachedWallet) return true;
  const walletData = await loadWalletData();
  return walletData !== null;
}

// 钱包是否已加载
export function isWalletReady(): boolean {
  return cachedWallet !== null;
}

// 获取钱包地址
export async function getWalletAddress(): Promise<string | null> {
  if (cachedWallet) return cachedWallet.address;
  const walletData = await loadWalletData();
  return walletData?.address || null;
}

// 获取BNB余额
export async function getBnbBalance(): Promise<string> {
  const signer = await getSigner();
  const balance = await signer.provider!.getBalance(signer.address);
  return ethers.formatEther(balance);
}

// 移除钱包
export async function removeWallet(): Promise<void> {
  logger.wallet.warn('移除钱包');
  cachedWallet = null;
  await clearWalletData();
}

// 导出私钥
export async function exportPrivateKey(): Promise<string> {
  const walletData = await loadWalletData();
  if (!walletData) {
    throw new Error('未找到钱包');
  }
  return decodeKey(walletData.privateKey);
}
