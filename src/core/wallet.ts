import { ethers } from 'ethers';
import { encryptPrivateKey, decryptPrivateKey, isValidPrivateKey } from './crypto';
import { loadWalletData, saveWalletData, clearWalletData, loadSettings } from './storage';
import { BSC_RPC_URL } from '@/config/constants';

let cachedWallet: ethers.Wallet | null = null;
let cachedProvider: ethers.JsonRpcProvider | null = null;

// Get BSC provider
export async function getProvider(): Promise<ethers.JsonRpcProvider> {
  if (cachedProvider) return cachedProvider;

  const settings = await loadSettings();
  cachedProvider = new ethers.JsonRpcProvider(settings.rpcUrl || BSC_RPC_URL);
  return cachedProvider;
}

// Reset provider (call when RPC URL changes)
export function resetProvider(): void {
  cachedProvider = null;
}

// Import wallet with private key
export async function importWallet(
  privateKey: string,
  password: string
): Promise<string> {
  if (!isValidPrivateKey(privateKey)) {
    throw new Error('Invalid private key format');
  }

  const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  const wallet = new ethers.Wallet(formattedKey);

  const { encrypted, iv, salt } = await encryptPrivateKey(formattedKey, password);

  await saveWalletData({
    encryptedPrivateKey: encrypted,
    address: wallet.address,
    iv,
    salt,
  });

  cachedWallet = wallet;
  return wallet.address;
}

// Unlock wallet with password
export async function unlockWallet(password: string): Promise<ethers.Wallet> {
  const walletData = await loadWalletData();
  if (!walletData) {
    throw new Error('No wallet found. Please import a wallet first.');
  }

  try {
    const privateKey = await decryptPrivateKey(
      walletData.encryptedPrivateKey,
      walletData.iv,
      walletData.salt,
      password
    );

    const provider = await getProvider();
    cachedWallet = new ethers.Wallet(privateKey, provider);
    return cachedWallet;
  } catch (error) {
    throw new Error('Invalid password');
  }
}

// Get current wallet (must be unlocked first)
export function getWallet(): ethers.Wallet | null {
  return cachedWallet;
}

// Get signer (wallet connected to provider)
export async function getSigner(): Promise<ethers.Wallet> {
  if (!cachedWallet) {
    throw new Error('Wallet not unlocked');
  }

  const provider = await getProvider();
  return cachedWallet.connect(provider);
}

// Check if wallet is imported
export async function hasWallet(): Promise<boolean> {
  const walletData = await loadWalletData();
  return walletData !== null;
}

// Check if wallet is unlocked
export function isWalletUnlocked(): boolean {
  return cachedWallet !== null;
}

// Get wallet address (without unlocking)
export async function getWalletAddress(): Promise<string | null> {
  if (cachedWallet) return cachedWallet.address;

  const walletData = await loadWalletData();
  return walletData?.address || null;
}

// Get BNB balance
export async function getBnbBalance(): Promise<string> {
  const signer = await getSigner();
  const balance = await signer.provider!.getBalance(signer.address);
  return ethers.formatEther(balance);
}

// Lock wallet (clear from memory)
export function lockWallet(): void {
  cachedWallet = null;
}

// Remove wallet completely
export async function removeWallet(): Promise<void> {
  cachedWallet = null;
  await clearWalletData();
}

// Export private key (requires password)
export async function exportPrivateKey(password: string): Promise<string> {
  const walletData = await loadWalletData();
  if (!walletData) {
    throw new Error('No wallet found');
  }

  return decryptPrivateKey(
    walletData.encryptedPrivateKey,
    walletData.iv,
    walletData.salt,
    password
  );
}
