// 账户信息缓存模块
import { ethers } from 'ethers';
import { logger, timerStart, timerEnd } from './logger';

interface AccountInfo {
  nonce: number;
  balance: bigint;
  timestamp: number;
}

interface GasInfo {
  gasPrice: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  timestamp: number;
}

interface FeeDataCache {
  maxFeePerGas: bigint | null;
  maxPriorityFeePerGas: bigint;
  timestamp: number;
}

interface TokenInfoCache {
  allowance: bigint;
  timestamp: number;
}

// 账户信息缓存（5秒过期）
const ACCOUNT_CACHE_TTL = 5000;
const accountCache = new Map<string, AccountInfo>();

// Gas信息缓存（10秒过期）
const GAS_CACHE_TTL = 10000;
let gasCache: GasInfo | null = null;

// FeeData 缓存（30秒过期，参考 test.js）
const FEE_DATA_CACHE_TTL = 30000;
let cachedFeeData: FeeDataCache | null = null;

// ChainId 缓存（永久，除非网络变化）
let cachedChainId: bigint | null = null;

// 本地 nonce 计数器（乐观递增，参考 test.js）
const localNonceMap = new Map<string, number>();

// 代币授权缓存（永久，直到交易成功）
const tokenAllowanceCache = new Map<string, TokenInfoCache>();

// 获取缓存的账户信息
export function getCachedAccountInfo(address: string): AccountInfo | null {
  const cached = accountCache.get(address);
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > ACCOUNT_CACHE_TTL) {
    accountCache.delete(address);
    return null;
  }

  return cached;
}

// 设置账户信息缓存
export function setCachedAccountInfo(address: string, nonce: number, balance: bigint): void {
  accountCache.set(address, {
    nonce,
    balance,
    timestamp: Date.now(),
  });
}

// 预加载账户信息（nonce和余额）
export async function preloadAccountInfo(
  address: string,
  provider: ethers.JsonRpcProvider
): Promise<{ nonce: number; balance: bigint }> {
  // 检查缓存
  const cached = getCachedAccountInfo(address);
  if (cached) {
    logger.cache.debug(`使用缓存的账户信息: nonce=${cached.nonce}, balance=${ethers.formatEther(cached.balance)}`);
    return { nonce: cached.nonce, balance: cached.balance };
  }

  // 并行获取 nonce 和余额
  timerStart('preload-account', '预加载账户信息');
  const [nonce, balance] = await Promise.all([
    provider.getTransactionCount(address, 'pending'),
    provider.getBalance(address),
  ]);

  setCachedAccountInfo(address, nonce, balance);
  timerEnd('preload-account');
  logger.cache.debug(`账户信息已预加载: nonce=${nonce}, balance=${ethers.formatEther(balance)}`);

  return { nonce, balance };
}

// 获取缓存的Gas信息
export function getCachedGasInfo(): GasInfo | null {
  if (!gasCache) return null;

  const age = Date.now() - gasCache.timestamp;
  if (age > GAS_CACHE_TTL) {
    gasCache = null;
    return null;
  }

  return gasCache;
}

// 智能获取Gas价格（带缓存和优化）
export async function getOptimizedGasPrice(
  provider: ethers.JsonRpcProvider,
  settings: { gasPriceGwei: number }
): Promise<bigint> {
  // 检查缓存
  const cached = getCachedGasInfo();
  if (cached) {
    logger.cache.debug(`使用缓存的Gas价格: ${ethers.formatUnits(cached.gasPrice, 'gwei')} gwei`);
    return cached.gasPrice;
  }

  try {
    timerStart('gas-price', '获取Gas价格');
    
    // 优先使用用户设置面板的 gas 价格作为基础
    const baseGasPrice = ethers.parseUnits(settings.gasPriceGwei.toString(), 'gwei');
    
    // 尝试从链上获取当前 gas 价格作为参考
    let chainGasPrice: bigint | null = null;
    try {
      const feeData = await provider.getFeeData();
      if (feeData.gasPrice) {
        chainGasPrice = feeData.gasPrice;
      }
    } catch (err) {
      // 忽略获取链上 gas 价格的错误，使用设置面板的值
      logger.cache.debug('无法获取链上 gas 价格，使用设置面板的值');
    }

    // 使用设置面板的值作为基础，如果链上的值更高，则使用链上的值（确保交易能成功）
    let gasPrice: bigint;
    if (chainGasPrice && chainGasPrice > baseGasPrice) {
      // 如果链上的 gas 价格更高，使用链上的值并加5%加速
      gasPrice = (chainGasPrice * 105n) / 100n;
      logger.cache.debug(`链上 gas 价格 (${ethers.formatUnits(chainGasPrice, 'gwei')} gwei) 高于设置值，使用链上值并加速`);
    } else {
      // 使用设置面板的值，并稍微提高以加速交易（提高5%）
      gasPrice = (baseGasPrice * 105n) / 100n;
      logger.cache.debug(`使用设置面板的 gas 价格 (${ethers.formatUnits(baseGasPrice, 'gwei')} gwei) 并加速`);
    }

    // 缓存Gas信息
    gasCache = {
      gasPrice,
      timestamp: Date.now(),
    };

    timerEnd('gas-price');
    logger.cache.debug(`Gas价格已获取并缓存: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);
    return gasPrice;
  } catch (error: any) {
    logger.cache.warn(`获取Gas价格失败，使用设置面板的值: ${error.message}`);
    const defaultGasPrice = ethers.parseUnits(settings.gasPriceGwei.toString(), 'gwei');
    
    // 即使失败也缓存默认值，避免重复查询
    gasCache = {
      gasPrice: defaultGasPrice,
      timestamp: Date.now(),
    };
    return defaultGasPrice;
  }
}

// 获取缓存的代币授权
export function getCachedTokenAllowance(
  tokenAddress: string,
  routerAddress: string
): bigint | null {
  const cacheKey = `${tokenAddress}-${routerAddress}`;
  const cached = tokenAllowanceCache.get(cacheKey);
  if (!cached) return null;

  // 授权信息缓存5分钟
  const age = Date.now() - cached.timestamp;
  if (age > 300000) {
    tokenAllowanceCache.delete(cacheKey);
    return null;
  }

  return cached.allowance;
}

// 持久化授权状态缓存（使用 chrome.storage，避免页面重新加载后丢失）
const APPROVAL_STORAGE_KEY = 'bsc_trade_approvals';
const approvalStorageCache = new Map<string, boolean>();

// 从 chrome.storage 加载授权状态
async function loadApprovalFromStorage(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(APPROVAL_STORAGE_KEY);
    if (result[APPROVAL_STORAGE_KEY]) {
      const approvals = result[APPROVAL_STORAGE_KEY] as Record<string, boolean>;
      Object.entries(approvals).forEach(([key, value]) => {
        approvalStorageCache.set(key, value);
      });
    }
  } catch (error) {
    // 忽略错误
  }
}

// 保存授权状态到 chrome.storage
async function saveApprovalToStorage(cacheKey: string, approved: boolean): Promise<void> {
  try {
    approvalStorageCache.set(cacheKey, approved);
    const result = await chrome.storage.local.get(APPROVAL_STORAGE_KEY);
    const approvals = result[APPROVAL_STORAGE_KEY] || {};
    approvals[cacheKey] = approved;
    await chrome.storage.local.set({ [APPROVAL_STORAGE_KEY]: approvals });
  } catch (error) {
    // 忽略错误
  }
}

// 检查持久化授权状态
export function getPersistentApprovalStatus(
  tokenAddress: string,
  routerAddress: string
): boolean | null {
  const cacheKey = `${tokenAddress}-${routerAddress}`;
  return approvalStorageCache.get(cacheKey) || null;
}

// 设置持久化授权状态
export function setPersistentApprovalStatus(
  tokenAddress: string,
  routerAddress: string,
  approved: boolean
): void {
  const cacheKey = `${tokenAddress}-${routerAddress}`;
  saveApprovalToStorage(cacheKey, approved).catch(() => {
    // 忽略错误
  });
}

// 初始化时加载持久化缓存
loadApprovalFromStorage();

// 设置代币授权缓存
export function setCachedTokenAllowance(
  tokenAddress: string,
  routerAddress: string,
  allowance: bigint
): void {
  const cacheKey = `${tokenAddress}-${routerAddress}`;
  tokenAllowanceCache.set(cacheKey, {
    allowance,
    timestamp: Date.now(),
  });
}

// 清除授权缓存（交易后调用）
export function clearTokenAllowanceCache(tokenAddress: string, routerAddress: string): void {
  const cacheKey = `${tokenAddress}-${routerAddress}`;
  tokenAllowanceCache.delete(cacheKey);
}

// 更新账户nonce（交易发送后）
export function incrementAccountNonce(address: string): void {
  const cached = accountCache.get(address);
  if (cached) {
    cached.nonce += 1;
    cached.timestamp = Date.now();
  }
  // 同时更新本地 nonce 计数器
  const localNonce = localNonceMap.get(address);
  if (localNonce !== undefined) {
    localNonceMap.set(address, localNonce + 1);
  }
}

// 预加载通用数据（feeData 和 chainId，参考 test.js）
export async function preloadCommonData(
  provider: ethers.JsonRpcProvider,
  address: string
): Promise<void> {
  try {
    timerStart('preload-common', '预加载通用数据');
    
    // 并行获取 feeData 和 chainId
    const [feeData, network] = await Promise.all([
      provider.getFeeData(),
      provider.getNetwork(),
    ]);

    // 缓存 feeData（30秒过期）
    cachedFeeData = {
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("0.5", "gwei"),
      timestamp: Date.now(),
    };

    // 缓存 chainId
    cachedChainId = network.chainId;

    // 初始化本地 nonce（pending 状态）
    const nonce = await provider.getTransactionCount(address, "pending");
    localNonceMap.set(address, nonce);

    timerEnd('preload-common');
    logger.cache.debug(`通用数据已预加载: chainId=${cachedChainId}, nonce=${nonce}`);
  } catch (error: any) {
    logger.cache.warn(`预加载通用数据失败: ${error.message}`);
  }
}

// 获取缓存的 feeData
export function getCachedFeeData(): FeeDataCache | null {
  if (!cachedFeeData) return null;

  const age = Date.now() - cachedFeeData.timestamp;
  if (age > FEE_DATA_CACHE_TTL) {
    cachedFeeData = null;
    return null;
  }

  return cachedFeeData;
}

// 获取缓存的 chainId
export function getCachedChainId(): bigint | null {
  return cachedChainId;
}

// 获取本地 nonce（乐观递增，参考 test.js）
export function getLocalNonce(address: string): number | null {
  return localNonceMap.get(address) ?? null;
}

// 递增本地 nonce（交易发送前）
export function incrementLocalNonce(address: string): number {
  const current = localNonceMap.get(address) ?? 0;
  const next = current + 1;
  localNonceMap.set(address, next);
  return next;
}

// 重置本地 nonce（交易失败时）
export async function resetLocalNonce(
  address: string,
  provider: ethers.JsonRpcProvider
): Promise<void> {
  const nonce = await provider.getTransactionCount(address, "pending");
  localNonceMap.set(address, nonce);
  logger.cache.debug(`本地 nonce 已重置: ${nonce}`);
}

// 清除所有缓存
export function clearAllCache(): void {
  accountCache.clear();
  gasCache = null;
  tokenAllowanceCache.clear();
  logger.cache.info('所有缓存已清除');
}


