import { ethers } from 'ethers';
import { getSigner, getProvider, resetProvider, getTransactionProvider } from './wallet';
import { loadSettings } from './storage';
import {
  WBNB_ADDRESS,
  PANCAKE_ROUTER_V2,
  PANCAKE_FACTORY_V2,
  PANCAKE_ROUTER_V2_ABI,
  PANCAKE_FACTORY_V2_ABI,
  FOURMEME_LAUNCHPAD,
  FOURMEME_LAUNCHPAD_ABI,
  UNGRADUATED_THRESHOLD,
  ERC20_ABI,
  DEFAULT_GAS_LIMIT,
  BSC_RPC_URLS,
} from '@/config/constants';
import { logger, timerStart, timerEnd, timerStep, logTransaction } from './logger';
import {
  preloadAccountInfo,
  getOptimizedGasPrice,
  getCachedTokenAllowance,
  setCachedTokenAllowance,
  clearTokenAllowanceCache,
  incrementAccountNonce,
  preloadCommonData,
  getCachedFeeData,
  getCachedChainId,
  getLocalNonce,
  incrementLocalNonce,
  resetLocalNonce,
  getPersistentApprovalStatus,
  setPersistentApprovalStatus,
} from './cache';

interface SwapQuote {
  amountOut: bigint;
  route: 'v2';
}

interface SwapResult {
  hash: string;
  status: 'sent' | 'failed';
}

// 授权缓存 (避免重复查询)
const approvalCache = new Map<string, boolean>();
// 正在处理中的授权请求（防止并发调用）
const pendingApprovals = new Set<string>();

// 毕业状态缓存（30秒过期）
const graduationCache = new Map<string, { isGraduated: boolean; timestamp: number }>();
const GRADUATION_CACHE_TTL = 30000; // 30秒

// 获取正确的 Launchpad 地址（checksum 格式，参考 buy_inner.js）
function getLaunchpadAddress(): string {
  return ethers.getAddress(FOURMEME_LAUNCHPAD.toLowerCase());
}

// 检查代币是否已毕业（参考 buy_inner.js）
async function checkTokenGraduation(tokenAddress: string): Promise<boolean> {
  // 检查缓存
  const cached = graduationCache.get(tokenAddress);
  if (cached && Date.now() - cached.timestamp < GRADUATION_CACHE_TTL) {
    logger.swap.debug(`使用缓存的毕业状态: ${cached.isGraduated ? '已毕业' : '未毕业'}`);
    return cached.isGraduated;
  }

  try {
    timerStart('check-graduation', '检查毕业状态');
    const provider = await getProvider();
    
    // 步骤1: 获取标准化地址（checksum）
    const safeToken = ethers.getAddress(tokenAddress.toLowerCase());
    const safeLaunchpad = getLaunchpadAddress();
    
    // 步骤2: 检查 launchpad 持有的代币余额
    const tokenContract = new ethers.Contract(safeToken, ERC20_ABI, provider);
    const launchpadBalance = await tokenContract.balanceOf(safeLaunchpad);
    
    logger.swap.debug(`Launchpad 持有代币: ${ethers.formatEther(launchpadBalance)}`);
    
    let isGraduated = false;
    
    if (launchpadBalance <= UNGRADUATED_THRESHOLD) {
      // Launchpad 余额低，可能已毕业，需要确认是否有 PancakeSwap V2 pair
      const factory = new ethers.Contract(PANCAKE_FACTORY_V2, PANCAKE_FACTORY_V2_ABI, provider);
      const pairAddress = await factory.getPair(WBNB_ADDRESS, safeToken);
      
      if (pairAddress !== ethers.ZeroAddress) {
        isGraduated = true;
        logger.swap.info('代币已毕业！使用 PancakeSwap V2 外盘交易');
      } else {
        logger.swap.warn('Launchpad 余额低但无 LP，可能 rug 或错误，使用内盘交易');
        isGraduated = false;
      }
    } else {
      logger.swap.info('代币未毕业！使用 Four.meme 内盘交易');
      isGraduated = false;
    }
    
    // 缓存结果
    graduationCache.set(tokenAddress, {
      isGraduated,
      timestamp: Date.now(),
    });
    
    timerEnd('check-graduation');
    return isGraduated;
  } catch (error: any) {
    logger.swap.error(`检查毕业状态失败: ${error.message}`);
    // 默认使用内盘（更安全）
    return false;
  }
}

// 获取最优报价 (并行查询加速，带 RPC 重试机制)
async function getBestQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  retryCount: number = 0
): Promise<SwapQuote> {
  timerStart('quote', '获取报价');

  let provider: ethers.JsonRpcProvider;
  const errors: string[] = [];
  
  try {
    provider = await getProvider(retryCount > 0);
  } catch (error: any) {
    if (retryCount < 2) {
      logger.swap.warn('RPC 连接失败，重置并重试...');
      resetProvider();
      return getBestQuote(tokenIn, tokenOut, amountIn, retryCount + 1);
    }
    throw new Error(`RPC 节点连接失败: ${error.message}`);
  }

  // 只查询 V2（V3 已禁用）
  const routerV2 = new ethers.Contract(PANCAKE_ROUTER_V2, PANCAKE_ROUTER_V2_ABI, provider);

  // V2 报价 - 改进错误处理，特别是 BUFFER_OVERRUN 错误
  const v2Promise = (async () => {
    try {
      // ethers v6: view 函数直接调用会自动使用 callStatic
      const result = await routerV2.getAmountsOut(amountIn, [tokenIn, tokenOut]);
      
      if (result && Array.isArray(result) && result.length >= 2) {
        const amountOut = result[result.length - 1];
        if (amountOut && typeof amountOut === 'bigint' && amountOut > 0n) {
          logger.swap.debug(`V2 报价成功: ${ethers.formatEther(amountOut)}`);
          return result;
        }
      }
      
      logger.swap.debug('V2 报价返回无效结果');
      return null;
    } catch (err: any) {
      // 处理 BUFFER_OVERRUN 错误（通常表示流动性池不存在或路径无效）
      const errorCode = err.code || err.error?.code;
      const errorMessage = err.message || err.error?.message || '';
      const errorReason = err.reason || err.error?.reason || '';
      
      if (errorCode === 'BUFFER_OVERRUN' || 
          errorCode === 'CALL_EXCEPTION' ||
          errorMessage.includes('buffer') ||
          errorMessage.includes('BUFFER_OVERRUN') ||
          errorMessage.includes('cannot slice') ||
          errorMessage.includes('insufficient liquidity') ||
          errorReason.includes('insufficient liquidity') ||
          errorMessage.includes('INSUFFICIENT_LIQUIDITY')) {
        errors.push(`V2 路由: 该代币对在 PancakeSwap V2 上不存在流动性池`);
        logger.swap.debug('V2 路由失败: 流动性池不存在或流动性不足');
        return null;
      }
      
      // 处理 PancakeSwap 特定的错误
      if (errorMessage.includes('PancakeRouter') || 
          errorMessage.includes('Pancake: INSUFFICIENT') ||
          errorMessage.includes('INSUFFICIENT')) {
        errors.push(`V2 路由: 流动性不足或无有效路径`);
        logger.swap.debug('V2 路由失败: PancakeSwap 错误');
        return null;
      }
      
      // 处理其他错误
      let errorMsg = '未知错误';
      if (errorReason) {
        errorMsg = errorReason;
      } else if (errorMessage) {
        errorMsg = errorMessage.length > 100 ? errorMessage.substring(0, 100) : errorMessage;
      }
      errors.push(`V2 路由失败: ${errorMsg}`);
      logger.swap.debug(`V2 报价失败: ${errorMsg} (code: ${errorCode})`);
      return null;
    }
  })();

  // V3 已禁用，只查询 V2
  const v2Result = await v2Promise;

  let bestQuote: SwapQuote = { amountOut: 0n, route: 'v2' };
  let hasValidQuote = false;

  // V2结果（V3 已禁用）
  if (v2Result && Array.isArray(v2Result) && v2Result.length >= 2) {
    const amountOut = v2Result[v2Result.length - 1];
    if (amountOut && typeof amountOut === 'bigint' && amountOut > 0n) {
      bestQuote = { amountOut, route: 'v2' };
      hasValidQuote = true;
    }
  }

  timerEnd('quote');

  if (!hasValidQuote) {
    // 如果是 RPC 相关错误且还未重试，尝试切换 RPC 节点
    const hasRpcError = errors.some(e => 
      e.includes('timeout') ||
      e.includes('ECONNREFUSED') ||
      e.includes('network') ||
      e.includes('网络') ||
      e.includes('connection') ||
      e.includes('failed') ||
      e.includes('BUFFER_OVERRUN')
    );
    
    if (hasRpcError && retryCount < 2) {
      logger.swap.warn('检测到 RPC 错误，切换节点并重试...');
      resetProvider();
      return getBestQuote(tokenIn, tokenOut, amountIn, retryCount + 1);
    }

    // 构建用户友好的错误信息
    const hasBufferError = errors.some(e => 
      e.includes('buffer') || 
      e.includes('流动性池不存在') || 
      e.includes('不存在流动性池')
    );
    const hasNetworkError = errors.some(e => 
      e.includes('network') || 
      e.includes('网络') ||
      e.includes('timeout') ||
      e.includes('ECONNREFUSED') ||
      e.includes('connection')
    );
    
    let userMessage = '无法获取流动性报价。';
    
    if (hasBufferError) {
      userMessage = '该代币在 PancakeSwap 上不存在流动性池。请确认：\n' +
        '1) 代币地址是否正确\n' +
        '2) 该代币是否已在 PancakeSwap 上创建 WBNB/代币交易对\n' +
        '3) 流动性池是否有足够的流动性';
    } else if (hasNetworkError) {
      userMessage = 'RPC 节点连接失败，已尝试切换节点。请检查：\n' +
        '1) 网络连接是否正常\n' +
        '2) 是否可以使用其他网络\n' +
        '3) 在设置中更换自定义 RPC 节点\n' +
        '4) 稍后重试';
    } else if (errors.length > 0) {
      // 显示具体的错误信息（简化版）
      const mainError = errors[0].split(':')[1]?.trim() || errors[0];
      userMessage = `无法获取报价: ${mainError}`;
    } else {
      userMessage = '无法获取流动性报价。可能原因：\n' +
        '1) 代币没有在 PancakeSwap 创建流动性池\n' +
        '2) 代币地址无效\n' +
        '3) RPC 节点不可用（可在设置中更换）';
    }
    
    if (errors.length > 0) {
      logger.swap.error(`无法获取报价（已重试 ${retryCount} 次）。错误详情: ${errors.join('; ')}`);
    } else {
      logger.swap.error('无法获取报价：所有路由查询失败');
    }
    
    throw new Error(userMessage);
  }

  // 获取代币精度（默认18）
  let decimals = 18;
  try {
    const tokenContract = new ethers.Contract(tokenOut, ERC20_ABI, provider);
    decimals = await tokenContract.decimals().catch(() => 18);
  } catch {
    // 忽略错误，使用默认值
  }

  logger.swap.info(`最优路由: ${bestQuote.route.toUpperCase()}, 预计输出: ${ethers.formatUnits(bestQuote.amountOut, decimals)}`);

  return bestQuote;
}

// 预授权代币（可在用户输入CA时调用）
export async function preApproveToken(
  tokenAddress: string,
  routerAddress: string = PANCAKE_ROUTER_V2
): Promise<{ approved: boolean; txHash?: string; error?: string }> {
  const cacheKey = `${tokenAddress}-${routerAddress}`;

  // 0. 先检查是否正在处理中（防止并发调用，必须在最前面）
  if (pendingApprovals.has(cacheKey)) {
    logger.swap.debug('授权请求已在进行中，跳过重复调用');
    return { approved: false, error: '授权请求已在进行中' };
  }

  // 1. 先检查内存缓存（最快）
  if (approvalCache.get(cacheKey)) {
    logger.swap.debug('代币已授权（内存缓存）');
    return { approved: true };
  }

  // 2. 检查持久化存储缓存（避免页面重新加载后重复请求）
  const persistentApproval = getPersistentApprovalStatus(tokenAddress, routerAddress);
  if (persistentApproval === true) {
    logger.swap.debug('代币已授权（持久化存储缓存）');
    approvalCache.set(cacheKey, true);
    return { approved: true };
  }

  // 3. 标记为正在处理（在开始异步操作之前立即设置）
  pendingApprovals.add(cacheKey);

  try {
    const signer = await getSigner();
    const provider = await getProvider();

    // 5. 检查持久化缓存中的授权状态
    const cachedAllowance = getCachedTokenAllowance(tokenAddress, routerAddress);
    if (cachedAllowance !== null && cachedAllowance >= ethers.MaxUint256 / 2n) {
      logger.swap.debug('代币已授权（持久化缓存）');
      approvalCache.set(cacheKey, true);
      setPersistentApprovalStatus(tokenAddress, routerAddress, true);
      pendingApprovals.delete(cacheKey);
      return { approved: true };
    }

    // 6. 检查实际授权状态
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const allowance = await tokenContract.allowance(signer.address, routerAddress);
    setCachedTokenAllowance(tokenAddress, routerAddress, allowance);

    if (allowance >= ethers.MaxUint256 / 2n) {
      logger.swap.debug('代币已授权（链上检查）');
      approvalCache.set(cacheKey, true);
      setPersistentApprovalStatus(tokenAddress, routerAddress, true);
      pendingApprovals.delete(cacheKey);
      return { approved: true };
    }

    // 7. 需要授权
    logger.swap.info('预授权代币...');
    const tokenContractWithSigner = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const tx = await tokenContractWithSigner.approve(routerAddress, ethers.MaxUint256, {
      gasLimit: 50000,
    });

    // 后台等待确认，不阻塞
    // 注意：pendingApprovals 在交易完成或失败后才删除，防止重复调用
    tx.wait().then(() => {
      logger.swap.success('预授权完成');
      approvalCache.set(cacheKey, true);
      setCachedTokenAllowance(tokenAddress, routerAddress, ethers.MaxUint256);
      setPersistentApprovalStatus(tokenAddress, routerAddress, true);
      pendingApprovals.delete(cacheKey);
    }).catch((err: any) => {
      logger.swap.error(`预授权失败: ${err.message}`);
      clearTokenAllowanceCache(tokenAddress, routerAddress);
      approvalCache.delete(cacheKey);
      setPersistentApprovalStatus(tokenAddress, routerAddress, false);
      pendingApprovals.delete(cacheKey);
    });

    // 立即返回，不等待确认
    // 注意：不在这里删除 pendingApprovals，让它在交易完成/失败后删除
    return { approved: false, txHash: tx.hash };
  } catch (error: any) {
    logger.swap.error(`预授权错误: ${error.message}`);
    approvalCache.delete(cacheKey);
    pendingApprovals.delete(cacheKey);
    return { approved: false, error: error.message };
  }
}

// 后台授权 (不等待，优化版)
async function ensureApproval(
  tokenAddress: string,
  routerAddress: string,
  signer: ethers.Wallet
): Promise<void> {
  const cacheKey = `${tokenAddress}-${routerAddress}`;

  // 检查内存缓存
  if (approvalCache.get(cacheKey)) {
    return;
  }

  // 检查持久化缓存
  const cachedAllowance = getCachedTokenAllowance(tokenAddress, routerAddress);
  if (cachedAllowance !== null && cachedAllowance >= ethers.MaxUint256 / 2n) {
    approvalCache.set(cacheKey, true);
    return;
  }

  const provider = signer.provider!;
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  
  // 快速检查授权状态（使用缓存的provider，不创建新连接）
  const allowance = await tokenContract.allowance(signer.address, routerAddress);
  setCachedTokenAllowance(tokenAddress, routerAddress, allowance);

  if (allowance >= ethers.MaxUint256 / 2n) {
    approvalCache.set(cacheKey, true);
    return;
  }

  // 需要授权
  logger.swap.info('发送授权交易...');
  const tokenContractWithSigner = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const tx = await tokenContractWithSigner.approve(routerAddress, ethers.MaxUint256, {
    gasLimit: 50000,
  });
  
  // 不等待确认，后台处理
  tx.wait().then(() => {
    logger.swap.success('授权完成');
    approvalCache.set(cacheKey, true);
    setCachedTokenAllowance(tokenAddress, routerAddress, ethers.MaxUint256);
  }).catch((err: any) => {
    logger.swap.error(`授权失败: ${err.message}`);
    clearTokenAllowanceCache(tokenAddress, routerAddress);
  });

  // 短暂等待让交易广播（减少等待时间）
  await new Promise(r => setTimeout(r, 300));
}

// 买入代币 (快速模式 - 不等待确认)
export async function buyToken(
  tokenAddress: string,
  bnbAmount: string
): Promise<SwapResult> {
  const txId = `buy-${Date.now()}`;
  timerStart(txId, '买入交易');

  logger.swap.info(`===== 买入 ${bnbAmount} BNB =====`);

  try {
    const [signer, settings, provider] = await Promise.all([
      getSigner(),
      loadSettings(),
      getProvider(),
    ]);

    const amountIn = ethers.parseEther(bnbAmount);

    // 并行：预加载账户信息 + 检查毕业状态 + 验证代币
    timerStep(txId, '并行准备');
    const [accountInfo, isGraduated] = await Promise.all([
      // 预加载账户信息（nonce和余额）
      preloadAccountInfo(signer.address, provider).catch(() => ({ nonce: 0, balance: 0n })),
      // 检查代币是否已毕业
      checkTokenGraduation(tokenAddress),
    ]);

    // 验证代币地址
    try {
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      await tokenContract.symbol().catch(() => {
        throw new Error('代币地址无效或无法读取代币信息，请检查地址是否正确');
      });
      logger.swap.debug('代币地址验证通过');
    } catch (err: any) {
      if (err.message.includes('代币地址无效')) {
        throw err;
      }
      logger.swap.warn('代币符号查询失败，继续尝试交易');
    }

    // 检查余额
    if (accountInfo.balance < amountIn) {
      throw new Error(`余额不足: 需要 ${bnbAmount} BNB，当前余额 ${ethers.formatEther(accountInfo.balance)} BNB`);
    }

    const deadline = Math.floor(Date.now() / 1000) + 600; // 10分钟（参考 buy_meme.js）
    
    // 获取加速的 fee data（基于用户设置的 gasPriceGwei，参考 test.js）
    timerStep(txId, '获取Gas');
    
    // 使用用户设置的 gasPriceGwei 作为基础（转换为 EIP-1559 格式）
    const userGasPrice = ethers.parseUnits(settings.gasPriceGwei.toString(), 'gwei');
    
    // 获取链上的 baseFee 作为参考（用于计算 maxFeePerGas）
    let cachedFee = getCachedFeeData();
    let chainId = getCachedChainId();
    let baseFee: bigint | null = null;
    
    if (cachedFee) {
      // 使用缓存的 feeData 获取 baseFee
      if (cachedFee.maxFeePerGas) {
        // maxFeePerGas = baseFee * 2 + priorityFee，所以可以反推 baseFee
        // 但更简单的方式是直接使用用户设置的值
        baseFee = cachedFee.maxFeePerGas / 2n; // 近似值
      }
      logger.swap.debug('使用缓存的 feeData');
    } else {
      // 如果缓存不存在，获取新的并缓存
      const feeData = await provider.getFeeData();
      if (feeData.maxFeePerGas) {
        baseFee = feeData.maxFeePerGas / 2n; // 近似值
      }
      
      // 更新缓存
      await preloadCommonData(provider, signer.address);
      cachedFee = getCachedFeeData();
      chainId = getCachedChainId();
    }
    
    // 基于用户设置的 gasPrice 计算 EIP-1559 参数
    // priorityFee = 用户设置的 gasPrice（加50%加速，即1.5倍）
    const priorityFee = (userGasPrice * 150n) / 100n;
    // maxFeePerGas = baseFee * 2 + priorityFee，如果没有 baseFee，使用 priorityFee * 2
    const maxFee = baseFee 
      ? (baseFee * 2n) + priorityFee
      : priorityFee * 2n;
    
    logger.swap.debug(`Gas费用计算: 用户设置=${settings.gasPriceGwei} gwei, priorityFee=${ethers.formatUnits(priorityFee, 'gwei')} gwei, maxFee=${ethers.formatUnits(maxFee, 'gwei')} gwei`);

    // 获取 nonce（优先使用本地计数器，参考 test.js）
    let nonce: number;
    try {
      const localNonce = getLocalNonce(signer.address);
      nonce = localNonce ?? accountInfo.nonce;
      incrementLocalNonce(signer.address);  // 乐观递增
    } catch (e) {
      nonce = accountInfo.nonce;
      incrementLocalNonce(signer.address);
    }

    timerStep(txId, '发送交易');

    let tx: ethers.TransactionResponse;
    let route: string;

    if (isGraduated) {
      // 已毕业：使用 PancakeSwap V2 外盘
      const quote = await getBestQuote(WBNB_ADDRESS, tokenAddress, amountIn);
      const amountOutMin = (quote.amountOut * BigInt(100 - settings.slippage)) / 100n;
      route = 'V2外盘';

      const router = new ethers.Contract(PANCAKE_ROUTER_V2, PANCAKE_ROUTER_V2_ABI, signer);
      
      // 使用优化的交易发送方式（参考 test.js）
      const txRequest = {
        to: router.target,
        data: router.interface.encodeFunctionData("swapExactETHForTokens", [
          amountOutMin,
          [WBNB_ADDRESS, tokenAddress],
          signer.address,
          deadline,
        ]),
        value: amountIn,
        gasLimit: DEFAULT_GAS_LIMIT,
        nonce,
        chainId: chainId || undefined,
        maxPriorityFeePerGas: priorityFee,
        maxFeePerGas: maxFee,
      };

      const populatedTx = await signer.populateTransaction(txRequest);
      const signedTx = await signer.signTransaction(populatedTx);
      // 使用交易专用 RPC 发送交易
      const transactionProvider = getTransactionProvider();
      tx = await transactionProvider.broadcastTransaction(signedTx);
    } else {
      // 未毕业：使用 Four.meme 内盘（参考 buy_inner.js 和 test.js）
      const safeToken = ethers.getAddress(tokenAddress.toLowerCase());
      const safeLaunchpad = getLaunchpadAddress();
      const launchpadContract = new ethers.Contract(safeLaunchpad, FOURMEME_LAUNCHPAD_ABI, signer);
      route = 'Four.meme内盘';
      
      // 使用优化的交易发送方式（参考 test.js）
      const txRequest = {
        to: launchpadContract.target,
        data: launchpadContract.interface.encodeFunctionData("buyTokenAMAP", [
          safeToken,
          signer.address,
          amountIn,
          1n, // minAmount
        ]),
        value: amountIn,
        gasLimit: 600000n,
        nonce,
        chainId: chainId || undefined,
        maxPriorityFeePerGas: priorityFee,
        maxFeePerGas: maxFee,
      };

      const populatedTx = await signer.populateTransaction(txRequest);
      const signedTx = await signer.signTransaction(populatedTx);
      // 使用交易专用 RPC 发送交易
      const transactionProvider = getTransactionProvider();
      tx = await transactionProvider.broadcastTransaction(signedTx);
    }

    const elapsed = timerEnd(txId);

    logTransaction('买入已发送', {
      '交易哈希': tx.hash,
      '金额': `${bnbAmount} BNB`,
      '路由': route,
      '耗时': `${elapsed.toFixed(0)}ms`,
    });

    // 更新nonce缓存（交易发送后立即更新，避免重复使用）
    incrementAccountNonce(signer.address);
    // 本地 nonce 已在 incrementLocalNonce 中更新

    // 后台监控交易状态（非阻塞）
    tx.wait().then(receipt => {
      if (receipt?.status === 1) {
        logger.swap.success(`买入确认: ${tx.hash}`);
      } else {
        logger.swap.error(`买入失败: ${tx.hash}`);
      }
    }).catch(() => {
      logger.swap.error(`买入异常: ${tx.hash}`);
    });

    return { hash: tx.hash, status: 'sent' };

  } catch (error: any) {
    timerEnd(txId);
    const errorMsg = error.shortMessage || error.message || String(error);
    logger.swap.error(`买入失败: ${errorMsg}`);
    // 提取更友好的错误信息（参考 sell_innner.js）
    let friendlyMsg = errorMsg;
    if (errorMsg.includes('execution reverted')) {
      friendlyMsg = '交易失败：可能原因：\n- 代币未毕业但使用了外盘路由\n- 滑点过大\n- 流动性不足\n- 授权失败';
    } else if (errorMsg.includes('out of gas') || errorMsg.includes('gas')) {
      friendlyMsg = 'Gas 不足：请尝试在设置中增加 Gas Limit';
    } else if (errorMsg.includes('user rejected') || errorMsg.includes('denied')) {
      friendlyMsg = '交易已取消';
    }
    throw new Error(friendlyMsg);
  }
}

// 卖出代币 (快速模式 - 不等待确认)
export async function sellToken(
  tokenAddress: string,
  percentage: number
): Promise<SwapResult> {
  const txId = `sell-${Date.now()}`;
  timerStart(txId, '卖出交易');

  logger.swap.info(`===== 卖出 ${percentage}% =====`);

  try {
    const [signer, settings, provider] = await Promise.all([
      getSigner(),
      loadSettings(),
      getProvider(),
    ]);

    // 并行：预加载账户信息 + 检查毕业状态 + 获取代币余额
    timerStep(txId, '并行准备');
    const [accountInfo, isGraduated, balance] = await Promise.all([
      // 预加载账户信息（nonce）
      preloadAccountInfo(signer.address, provider).catch(() => ({ nonce: 0, balance: 0n })),
      // 检查代币是否已毕业
      checkTokenGraduation(tokenAddress),
      // 获取代币余额
      (async () => {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        return await tokenContract.balanceOf(signer.address);
      })(),
    ]);

    if (balance === 0n) {
      throw new Error('余额为0');
    }

    // 计算卖出数量：balanceOf 返回的是 raw balance（已包含 decimals），直接按百分比计算
    const amountIn = (balance * BigInt(percentage)) / 100n;
    
    if (amountIn === 0n) {
      throw new Error('卖出数量为0');
    }

    // 获取代币精度用于日志显示（参考 sell_innner.js）
    let decimals = 18;
    try {
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      decimals = await tokenContract.decimals().catch(() => 18);
    } catch {
      // 忽略错误，使用默认值
    }
    
    logger.swap.info(`余额: ${ethers.formatUnits(balance, decimals)} (raw: ${balance.toString()})`);
    logger.swap.info(`卖出数量: ${ethers.formatUnits(amountIn, decimals)} (${percentage}%, raw: ${amountIn.toString()})`);

    const deadline = Math.floor(Date.now() / 1000) + 600; // 10分钟
    
    // 获取加速的 fee data（基于用户设置的 gasPriceGwei，参考 test.js）
    timerStep(txId, '获取Gas');
    
    // 使用用户设置的 gasPriceGwei 作为基础（转换为 EIP-1559 格式）
    const userGasPrice = ethers.parseUnits(settings.gasPriceGwei.toString(), 'gwei');
    
    // 获取链上的 baseFee 作为参考（用于计算 maxFeePerGas）
    let cachedFee = getCachedFeeData();
    let chainId = getCachedChainId();
    let baseFee: bigint | null = null;
    
    if (cachedFee) {
      // 使用缓存的 feeData 获取 baseFee
      if (cachedFee.maxFeePerGas) {
        // maxFeePerGas = baseFee * 2 + priorityFee，所以可以反推 baseFee
        // 但更简单的方式是直接使用用户设置的值
        baseFee = cachedFee.maxFeePerGas / 2n; // 近似值
      }
      logger.swap.debug('使用缓存的 feeData');
    } else {
      // 如果缓存不存在，获取新的并缓存
      const feeData = await provider.getFeeData();
      if (feeData.maxFeePerGas) {
        baseFee = feeData.maxFeePerGas / 2n; // 近似值
      }
      
      // 更新缓存
      await preloadCommonData(provider, signer.address);
      cachedFee = getCachedFeeData();
      chainId = getCachedChainId();
    }
    
    // 基于用户设置的 gasPrice 计算 EIP-1559 参数
    // priorityFee = 用户设置的 gasPrice（加50%加速，即1.5倍）
    const priorityFee = (userGasPrice * 150n) / 100n;
    // maxFeePerGas = baseFee * 2 + priorityFee，如果没有 baseFee，使用 priorityFee * 2
    const maxFee = baseFee 
      ? (baseFee * 2n) + priorityFee
      : priorityFee * 2n;
    
    logger.swap.debug(`Gas费用计算: 用户设置=${settings.gasPriceGwei} gwei, priorityFee=${ethers.formatUnits(priorityFee, 'gwei')} gwei, maxFee=${ethers.formatUnits(maxFee, 'gwei')} gwei`);

    // 获取 nonce（优先使用本地计数器，参考 test.js）
    let nonce: number;
    try {
      const localNonce = getLocalNonce(signer.address);
      nonce = localNonce ?? accountInfo.nonce;
      incrementLocalNonce(signer.address);  // 乐观递增
    } catch (e) {
      nonce = accountInfo.nonce;
      incrementLocalNonce(signer.address);
    }

    timerStep(txId, '发送交易');

    let tx: ethers.TransactionResponse;
    let route: string;
    let finalRouterAddress: string | null = null;

    if (isGraduated) {
      // 已毕业：使用 PancakeSwap V2 外盘
      // 并行: 获取报价 + 检查授权
      timerStep(txId, '报价+授权');
      const routerAddress = PANCAKE_ROUTER_V2;
      const [quote, _] = await Promise.all([
        getBestQuote(tokenAddress, WBNB_ADDRESS, amountIn),
        // 后台检查授权（不阻塞）
        ensureApproval(tokenAddress, routerAddress, signer).catch(() => {
          logger.swap.warn('授权检查失败，继续尝试交易');
        }),
      ]);

      // 只使用 V2 路由（V3 已禁用）
      finalRouterAddress = PANCAKE_ROUTER_V2;

      // 计算滑点
      const amountOutMin = (quote.amountOut * BigInt(100 - settings.slippage)) / 100n;
      route = 'V2外盘';

      const router = new ethers.Contract(PANCAKE_ROUTER_V2, PANCAKE_ROUTER_V2_ABI, signer);
      
      // 使用优化的交易发送方式（参考 test.js）
      const txRequest = {
        to: router.target,
        data: router.interface.encodeFunctionData("swapExactTokensForETH", [
          amountIn,
          amountOutMin,
          [tokenAddress, WBNB_ADDRESS],
          signer.address,
          deadline,
        ]),
        gasLimit: DEFAULT_GAS_LIMIT,
        nonce,
        chainId: chainId || undefined,
        maxPriorityFeePerGas: priorityFee,
        maxFeePerGas: maxFee,
      };

      const populatedTx = await signer.populateTransaction(txRequest);
      const signedTx = await signer.signTransaction(populatedTx);
      // 使用交易专用 RPC 发送交易
      const transactionProvider = getTransactionProvider();
      tx = await transactionProvider.broadcastTransaction(signedTx);
    } else {
      // 未毕业：使用 Four.meme 内盘（参考 buy_inner.js）
      const safeToken = ethers.getAddress(tokenAddress.toLowerCase());
      const safeLaunchpad = getLaunchpadAddress();
      const launchpadContract = new ethers.Contract(safeLaunchpad, FOURMEME_LAUNCHPAD_ABI, signer);
      route = 'Four.meme内盘';
      
      // 内盘卖出：需要先授权（如果还没授权）
      await ensureApproval(tokenAddress, safeLaunchpad, signer);
      
      logger.swap.info(`内盘卖出: token=${safeToken}, amount=${amountIn.toString()}`);
      
      // 使用优化的交易发送方式（参考 test.js）
      const txRequest = {
        to: launchpadContract.target,
        data: launchpadContract.interface.encodeFunctionData("sellToken", [
          safeToken,
          amountIn,
        ]),
        gasLimit: 600000n,
        nonce,
        chainId: chainId || undefined,
        maxPriorityFeePerGas: priorityFee,
        maxFeePerGas: maxFee,
      };

      const populatedTx = await signer.populateTransaction(txRequest);
      const signedTx = await signer.signTransaction(populatedTx);
      // 使用交易专用 RPC 发送交易
      const transactionProvider = getTransactionProvider();
      tx = await transactionProvider.broadcastTransaction(signedTx);
    }

    const elapsed = timerEnd(txId);

    // 获取预计输出（仅已毕业时可用）
    let estimatedOutput = 'N/A';
    if (isGraduated && finalRouterAddress) {
      try {
        const quote = await getBestQuote(tokenAddress, WBNB_ADDRESS, amountIn);
        estimatedOutput = `${ethers.formatEther(quote.amountOut)} BNB`;
      } catch {
        // 忽略报价错误
      }
    }

    logTransaction('卖出已发送', {
      '交易哈希': tx.hash,
      '比例': `${percentage}%`,
      '预计': estimatedOutput,
      '路由': route,
      '耗时': `${elapsed.toFixed(0)}ms`,
    });

    // 更新nonce缓存（交易发送后立即更新）
    incrementAccountNonce(signer.address);
    // 清除授权缓存（交易后可能需要重新授权）
    if (finalRouterAddress) {
      clearTokenAllowanceCache(tokenAddress, finalRouterAddress);
    } else {
      clearTokenAllowanceCache(tokenAddress, getLaunchpadAddress());
    }

    // 后台监控（非阻塞）
    tx.wait().then(receipt => {
      if (receipt?.status === 1) {
        logger.swap.success(`卖出确认: ${tx.hash}`);
      } else {
        logger.swap.error(`卖出失败: ${tx.hash}`);
      }
    }).catch(() => {
      logger.swap.error(`卖出异常: ${tx.hash}`);
    });

    return { hash: tx.hash, status: 'sent' };

  } catch (error: any) {
    timerEnd(txId);
    const errorMsg = error.shortMessage || error.message || String(error);
    logger.swap.error(`卖出失败: ${errorMsg}`);
    // 提取更友好的错误信息（参考 sell_innner.js）
    let friendlyMsg = errorMsg;
    if (errorMsg.includes('execution reverted')) {
      friendlyMsg = '交易失败：可能原因：\n- minEth 过高（内盘已毕业）\n- 未授权代币\n- 流动性不足\n- 曲线已满';
    } else if (errorMsg.includes('out of gas') || errorMsg.includes('gas')) {
      friendlyMsg = 'Gas 不足：内盘卖出需要更多 Gas，请尝试增加 Gas Limit';
    } else if (errorMsg.includes('user rejected') || errorMsg.includes('denied')) {
      friendlyMsg = '交易已取消';
    } else if (errorMsg.includes('余额不足') || errorMsg.includes('余额为0')) {
      friendlyMsg = errorMsg; // 余额相关错误直接使用原消息
    }
    throw new Error(friendlyMsg);
  }
}
