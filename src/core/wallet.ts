import { ethers } from 'ethers';
import { encryptPrivateKey, decryptPrivateKey, isValidPrivateKey } from './crypto';
import { loadWalletData, saveWalletData, clearWalletData, loadSettings } from './storage';
import { BSC_RPC_URL } from '@/config/constants';
import { logger, timerStart, timerEnd, timerStep } from './logger';

let cachedWallet: ethers.Wallet | null = null;
let cachedProvider: ethers.JsonRpcProvider | null = null;

// 获取BSC Provider
export async function getProvider(): Promise<ethers.JsonRpcProvider> {
  if (cachedProvider) {
    logger.wallet.debug('使用缓存的Provider');
    return cachedProvider;
  }

  timerStart('provider', '初始化RPC Provider');
  const settings = await loadSettings();
  const rpcUrl = settings.rpcUrl || BSC_RPC_URL;
  logger.wallet.info(`连接RPC节点: ${rpcUrl}`);

  cachedProvider = new ethers.JsonRpcProvider(rpcUrl);
  timerEnd('provider');

  return cachedProvider;
}

// 重置Provider (RPC URL变更时调用)
export function resetProvider(): void {
  logger.wallet.info('重置RPC Provider');
  cachedProvider = null;
}

// 导入钱包
export async function importWallet(
  privateKey: string,
  password: string
): Promise<string> {
  timerStart('import', '导入钱包');

  if (!isValidPrivateKey(privateKey)) {
    logger.wallet.error('私钥格式无效');
    throw new Error('私钥格式无效');
  }

  const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

  timerStep('import', '创建钱包实例');
  const wallet = new ethers.Wallet(formattedKey);
  logger.wallet.info(`钱包地址: ${wallet.address}`);

  timerStep('import', '加密私钥');
  const { encrypted, iv, salt } = await encryptPrivateKey(formattedKey, password);

  timerStep('import', '保存到存储');
  await saveWalletData({
    encryptedPrivateKey: encrypted,
    address: wallet.address,
    iv,
    salt,
  });

  cachedWallet = wallet;
  timerEnd('import');
  logger.wallet.success('钱包导入成功');

  return wallet.address;
}

// 解锁钱包
export async function unlockWallet(password: string): Promise<ethers.Wallet> {
  timerStart('unlock', '解锁钱包');

  const walletData = await loadWalletData();
  if (!walletData) {
    logger.wallet.error('未找到钱包数据');
    throw new Error('未找到钱包，请先导入钱包');
  }

  try {
    timerStep('unlock', '解密私钥');
    const privateKey = await decryptPrivateKey(
      walletData.encryptedPrivateKey,
      walletData.iv,
      walletData.salt,
      password
    );

    timerStep('unlock', '连接Provider');
    const provider = await getProvider();
    cachedWallet = new ethers.Wallet(privateKey, provider);

    timerEnd('unlock');
    logger.wallet.success(`钱包解锁成功: ${walletData.address}`);

    return cachedWallet;
  } catch (error) {
    logger.wallet.error('密码错误或解密失败');
    throw new Error('密码错误');
  }
}

// 获取当前钱包 (需要先解锁)
export function getWallet(): ethers.Wallet | null {
  return cachedWallet;
}

// 获取签名器 (钱包连接Provider)
export async function getSigner(): Promise<ethers.Wallet> {
  if (!cachedWallet) {
    logger.wallet.error('钱包未解锁');
    throw new Error('钱包未解锁');
  }

  const provider = await getProvider();
  return cachedWallet.connect(provider);
}

// 检查是否已导入钱包
export async function hasWallet(): Promise<boolean> {
  const walletData = await loadWalletData();
  const exists = walletData !== null;
  logger.wallet.debug(`钱包存在: ${exists}`);
  return exists;
}

// 检查钱包是否已解锁
export function isWalletUnlocked(): boolean {
  const unlocked = cachedWallet !== null;
  logger.wallet.debug(`钱包已解锁: ${unlocked}`);
  return unlocked;
}

// 获取钱包地址 (无需解锁)
export async function getWalletAddress(): Promise<string | null> {
  if (cachedWallet) return cachedWallet.address;

  const walletData = await loadWalletData();
  return walletData?.address || null;
}

// 获取BNB余额
export async function getBnbBalance(): Promise<string> {
  timerStart('bnb-balance', '查询BNB余额');

  const signer = await getSigner();
  const balance = await signer.provider!.getBalance(signer.address);
  const formatted = ethers.formatEther(balance);

  timerEnd('bnb-balance');
  logger.wallet.info(`BNB余额: ${formatted}`);

  return formatted;
}

// 锁定钱包 (从内存清除)
export function lockWallet(): void {
  logger.wallet.info('锁定钱包');
  cachedWallet = null;
}

// 完全移除钱包
export async function removeWallet(): Promise<void> {
  logger.wallet.warn('移除钱包数据');
  cachedWallet = null;
  await clearWalletData();
  logger.wallet.success('钱包数据已清除');
}

// 导出私钥 (需要密码)
export async function exportPrivateKey(password: string): Promise<string> {
  logger.wallet.warn('导出私钥请求');

  const walletData = await loadWalletData();
  if (!walletData) {
    logger.wallet.error('未找到钱包');
    throw new Error('未找到钱包');
  }

  const privateKey = await decryptPrivateKey(
    walletData.encryptedPrivateKey,
    walletData.iv,
    walletData.salt,
    password
  );

  logger.wallet.success('私钥导出成功');
  return privateKey;
}
