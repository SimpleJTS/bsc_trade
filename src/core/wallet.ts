import { ethers } from 'ethers';
import { loadWalletData, saveWalletData, clearWalletData, loadSettings, encodeKey, decodeKey } from './storage';
import { BSC_RPC_URL, BSC_RPC_URLS, TRANSACTION_RPC_URL } from '@/config/constants';
import { logger, timerStart, timerEnd } from './logger';

let cachedWallet: ethers.Wallet | null = null;
let cachedProvider: ethers.JsonRpcProvider | null = null;
let currentRpcUrl: string | null = null;
let cachedTransactionProvider: ethers.JsonRpcProvider | null = null;

// 测试 RPC 节点是否可用
async function testRpcNode(url: string, timeout: number = 3000): Promise<boolean> {
  try {
    const testProvider = new ethers.JsonRpcProvider(url, {
      name: 'binance',
      chainId: 56,
    });
    
    // 使用 Promise.race 实现超时
    const testPromise = testProvider.getBlockNumber().then(() => true);
    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), timeout);
    });
    
    const result = await Promise.race([testPromise, timeoutPromise]);
    
    if (result) {
      logger.wallet.debug(`✓ RPC 节点可用: ${url}`);
      return true;
    } else {
      logger.wallet.debug(`✗ RPC 节点超时: ${url}`);
      return false;
    }
  } catch (error: any) {
    logger.wallet.debug(`✗ RPC 节点测试失败: ${url} - ${error.message?.substring(0, 50) || '未知错误'}`);
    return false;
  }
}

// 获取可用的 RPC 节点（自动故障转移，优化速度）
async function getAvailableRpcUrl(): Promise<string> {
  const settings = await loadSettings();
  
  // 如果用户设置了自定义 RPC，先尝试它（快速测试）
  if (settings.rpcUrl && settings.rpcUrl !== BSC_RPC_URL) {
    logger.wallet.info(`测试自定义 RPC: ${settings.rpcUrl}`);
    const isAvailable = await testRpcNode(settings.rpcUrl, 2000);
    if (isAvailable) {
      logger.wallet.info(`✓ 使用自定义 RPC: ${settings.rpcUrl}`);
      return settings.rpcUrl;
    }
    logger.wallet.warn(`✗ 自定义 RPC 不可用，切换到备用节点`);
  }

  // 快速测试前3个节点（通常这些是最快的）
  logger.wallet.info('快速测试 RPC 节点...');
  const quickTestUrls = BSC_RPC_URLS.slice(0, 3);
  const quickTests = quickTestUrls.map(url => testRpcNode(url, 2000).then(available => ({ url, available })));
  const quickResults = await Promise.all(quickTests);
  
  let availableNode = quickResults.find(r => r.available);
  
  // 如果前3个都不可用，再测试其他节点
  if (!availableNode) {
    logger.wallet.info('前3个节点不可用，测试其他节点...');
    const otherUrls = BSC_RPC_URLS.slice(3);
    // 并行测试其他节点（最多测试5个，避免太慢）
    const testCount = Math.min(5, otherUrls.length);
    const otherTests = otherUrls.slice(0, testCount).map(url => 
      testRpcNode(url, 2500).then(available => ({ url, available }))
    );
    const otherResults = await Promise.all(otherTests);
    availableNode = otherResults.find(r => r.available);
  }
  
  if (availableNode) {
    logger.wallet.info(`✓ 使用 RPC 节点: ${availableNode.url}`);
    return availableNode.url;
  }

  // 如果测试的节点都不可用，尝试使用第一个默认节点（不测试，直接返回）
  logger.wallet.warn('所有测试节点不可用，使用默认节点（可能不可用）');
  return BSC_RPC_URLS[0] || BSC_RPC_URL;
}

// 获取BSC Provider（带自动故障转移）
export async function getProvider(forceRefresh: boolean = false): Promise<ethers.JsonRpcProvider> {
  // 如果已有缓存的 provider 且未强制刷新，直接返回
  if (cachedProvider && !forceRefresh && currentRpcUrl) {
    // 快速验证当前 provider 是否仍然可用（只验证一次，不每次都验证）
    try {
      await Promise.race([
        cachedProvider.getBlockNumber(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)),
      ]);
      return cachedProvider;
    } catch (error) {
      logger.wallet.warn('当前 RPC 节点不可用，切换到备用节点');
      cachedProvider = null;
      currentRpcUrl = null;
    }
  }

  // 获取可用的 RPC URL
  const rpcUrl = await getAvailableRpcUrl();
  currentRpcUrl = rpcUrl;

  // 创建新的 provider
  cachedProvider = new ethers.JsonRpcProvider(rpcUrl, {
    name: 'binance',
    chainId: 56,
  });

  logger.wallet.info(`已连接到 RPC: ${rpcUrl}`);
  return cachedProvider;
}

// 获取交易专用 Provider（仅用于发送交易）
export function getTransactionProvider(): ethers.JsonRpcProvider {
  if (!cachedTransactionProvider) {
    cachedTransactionProvider = new ethers.JsonRpcProvider(TRANSACTION_RPC_URL, {
      name: 'binance',
      chainId: 56,
    });
    logger.wallet.info(`已连接到交易专用 RPC: ${TRANSACTION_RPC_URL}`);
  }
  return cachedTransactionProvider;
}

// 重置Provider（清除缓存，下次调用时会重新选择节点）
export function resetProvider(): void {
  logger.wallet.debug('重置 RPC Provider');
  cachedProvider = null;
  currentRpcUrl = null;
  
  // 如果钱包已连接，需要重新连接新的 provider
  if (cachedWallet && cachedProvider === null) {
    // 下次调用 getSigner 时会自动重新连接
  }
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

  // 立即缓存并连接 provider
  const provider = await getProvider();
  cachedWallet = wallet.connect(provider);
  
  // 如果钱包已经存在但 provider 不同，需要更新连接
  if (cachedWallet && cachedWallet.provider !== provider) {
    cachedWallet = cachedWallet.connect(provider);
  }

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
  } catch (error: any) {
    logger.wallet.error(`钱包加载失败: ${error.message}`);
    // 如果 RPC 失败，尝试重置 provider 并重试一次
    resetProvider();
    try {
      const provider = await getProvider(true);
      const privateKey = decodeKey(walletData.privateKey);
      cachedWallet = new ethers.Wallet(privateKey, provider);
      logger.wallet.success(`钱包已自动加载（重试）: ${walletData.address}`);
      return true;
    } catch (retryError: any) {
      logger.wallet.error(`钱包加载失败（重试）: ${retryError.message}`);
      return false;
    }
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
