import { ethers } from 'ethers';
import { getProvider } from './wallet';
import { ERC20_ABI, WBNB_ADDRESS } from '@/config/constants';
import { logger, timerStart, timerEnd } from './logger';

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
}

export interface TokenBalance {
  raw: bigint;
  formatted: string;
}

// 验证代币地址
export function isValidAddress(address: string): boolean {
  const valid = ethers.isAddress(address);
  if (!valid) {
    logger.token.debug(`地址格式无效: ${address}`);
  }
  return valid;
}

// 格式化地址显示
export function formatAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// 获取代币信息
export async function getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
  timerStart('token-info', '获取代币信息');

  if (!isValidAddress(tokenAddress)) {
    logger.token.error('代币地址无效');
    throw new Error('代币地址无效');
  }

  logger.token.info(`查询代币: ${tokenAddress}`);
  const provider = await getProvider();
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

  try {
    const [name, symbol, decimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
    ]);

    const tokenInfo = {
      address: tokenAddress,
      name,
      symbol,
      decimals: Number(decimals),
    };

    timerEnd('token-info');
    logger.token.success(`代币: ${symbol} (${name}), 精度: ${decimals}`);

    return tokenInfo;
  } catch (error) {
    timerEnd('token-info');
    logger.token.error('获取代币信息失败，可能不是有效的ERC20合约');
    throw new Error('获取代币信息失败，无效的代币合约');
  }
}

// 获取代币余额
export async function getTokenBalance(
  tokenAddress: string,
  walletAddress: string
): Promise<TokenBalance> {
  timerStart('token-balance', '查询代币余额');

  logger.token.debug(`查询余额: ${formatAddress(tokenAddress)} for ${formatAddress(walletAddress)}`);

  const provider = await getProvider();
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

  const [balance, decimals] = await Promise.all([
    contract.balanceOf(walletAddress),
    contract.decimals(),
  ]);

  const result = {
    raw: balance,
    formatted: ethers.formatUnits(balance, decimals),
  };

  timerEnd('token-balance');
  logger.token.info(`代币余额: ${result.formatted}`);

  return result;
}

// 获取BNB余额
export async function getBnbBalance(walletAddress: string): Promise<TokenBalance> {
  timerStart('bnb-balance', '查询BNB余额');

  const provider = await getProvider();
  const balance = await provider.getBalance(walletAddress);

  const result = {
    raw: balance,
    formatted: ethers.formatEther(balance),
  };

  timerEnd('bnb-balance');
  logger.token.info(`BNB余额: ${result.formatted}`);

  return result;
}

// 检查是否是WBNB
export function isWBNB(tokenAddress: string): boolean {
  return tokenAddress.toLowerCase() === WBNB_ADDRESS.toLowerCase();
}

// 格式化代币数量显示
export function formatTokenAmount(
  amount: string | number,
  decimals: number = 4
): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0';

  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;

  return num.toFixed(decimals);
}

// 解析代币数量
export function parseTokenAmount(amount: string, decimals: number): bigint {
  return ethers.parseUnits(amount, decimals);
}
