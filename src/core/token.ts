import { ethers } from 'ethers';
import { getProvider } from './wallet';
import { ERC20_ABI, WBNB_ADDRESS } from '@/config/constants';

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

// Validate token address
export function isValidAddress(address: string): boolean {
  return ethers.isAddress(address);
}

// Format address for display
export function formatAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Get token info
export async function getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
  if (!isValidAddress(tokenAddress)) {
    throw new Error('Invalid token address');
  }

  const provider = await getProvider();
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

  try {
    const [name, symbol, decimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
    ]);

    return {
      address: tokenAddress,
      name,
      symbol,
      decimals: Number(decimals),
    };
  } catch (error) {
    throw new Error('Failed to fetch token info. Invalid token contract.');
  }
}

// Get token balance
export async function getTokenBalance(
  tokenAddress: string,
  walletAddress: string
): Promise<TokenBalance> {
  const provider = await getProvider();
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

  const [balance, decimals] = await Promise.all([
    contract.balanceOf(walletAddress),
    contract.decimals(),
  ]);

  return {
    raw: balance,
    formatted: ethers.formatUnits(balance, decimals),
  };
}

// Get BNB balance
export async function getBnbBalance(walletAddress: string): Promise<TokenBalance> {
  const provider = await getProvider();
  const balance = await provider.getBalance(walletAddress);

  return {
    raw: balance,
    formatted: ethers.formatEther(balance),
  };
}

// Check if token is WBNB
export function isWBNB(tokenAddress: string): boolean {
  return tokenAddress.toLowerCase() === WBNB_ADDRESS.toLowerCase();
}

// Format token amount for display
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

// Parse token amount from input
export function parseTokenAmount(amount: string, decimals: number): bigint {
  return ethers.parseUnits(amount, decimals);
}
