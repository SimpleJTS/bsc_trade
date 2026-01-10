import { ethers } from 'ethers';
import { getSigner, getProvider } from './wallet';
import { loadSettings } from './storage';
import {
  WBNB_ADDRESS,
  PANCAKE_ROUTER_V2,
  PANCAKE_ROUTER_V3,
  PANCAKE_QUOTER_V3,
  PANCAKE_ROUTER_V2_ABI,
  PANCAKE_ROUTER_V3_ABI,
  PANCAKE_QUOTER_V3_ABI,
  ERC20_ABI,
  DEFAULT_GAS_LIMIT,
} from '@/config/constants';
import { logger, timerStart, timerEnd, timerStep, logTransaction } from './logger';

interface SwapQuote {
  amountOut: bigint;
  route: 'v2' | 'v3';
  priceImpact: number;
  fee?: number;
}

interface SwapResult {
  hash: string;
  success: boolean;
}

// V3手续费档位
const V3_FEE_TIERS = [100, 500, 2500, 10000];
const FEE_LABELS: Record<number, string> = {
  100: '0.01%',
  500: '0.05%',
  2500: '0.25%',
  10000: '1%',
};

// 获取最优报价 (V2 vs V3)
async function getBestQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint
): Promise<SwapQuote> {
  timerStart('quote', '获取最优报价');

  const provider = await getProvider();
  logger.swap.info(`查询报价: ${ethers.formatEther(amountIn)} 输入`);

  // 获取V2报价
  timerStep('quote', '查询PancakeSwap V2');
  const routerV2 = new ethers.Contract(PANCAKE_ROUTER_V2, PANCAKE_ROUTER_V2_ABI, provider);
  let v2Quote = 0n;

  try {
    const path = [tokenIn, tokenOut];
    const amounts = await routerV2.getAmountsOut(amountIn, path);
    v2Quote = amounts[amounts.length - 1];
    logger.swap.debug(`V2报价: ${ethers.formatEther(v2Quote)}`);
  } catch {
    logger.swap.debug('V2交易对不存在');
  }

  // 获取V3报价 (尝试所有手续费档位)
  timerStep('quote', '查询PancakeSwap V3');
  const quoterV3 = new ethers.Contract(PANCAKE_QUOTER_V3, PANCAKE_QUOTER_V3_ABI, provider);
  let v3Quote = 0n;
  let bestFee = 2500;

  for (const fee of V3_FEE_TIERS) {
    try {
      const params = {
        tokenIn,
        tokenOut,
        amountIn,
        fee,
        sqrtPriceLimitX96: 0n,
      };
      const result = await quoterV3.quoteExactInputSingle.staticCall(params);
      if (result.amountOut > v3Quote) {
        v3Quote = result.amountOut;
        bestFee = fee;
        logger.swap.debug(`V3报价 (${FEE_LABELS[fee]}): ${ethers.formatEther(result.amountOut)}`);
      }
    } catch {
      // 该手续费档位不存在
    }
  }

  timerEnd('quote');

  // 返回最优路由
  if (v3Quote > v2Quote) {
    logger.swap.success(`最优路由: V3 (${FEE_LABELS[bestFee]}), 输出: ${ethers.formatEther(v3Quote)}`);
    return {
      amountOut: v3Quote,
      route: 'v3',
      priceImpact: 0,
      fee: bestFee,
    };
  }

  logger.swap.success(`最优路由: V2, 输出: ${ethers.formatEther(v2Quote)}`);
  return {
    amountOut: v2Quote,
    route: 'v2',
    priceImpact: 0,
  };
}

// 买入代币 (用BNB)
export async function buyToken(
  tokenAddress: string,
  bnbAmount: string
): Promise<SwapResult> {
  const txId = `buy-${Date.now()}`;
  timerStart(txId, `买入交易`);

  logger.swap.info(`========== 开始买入 ==========`);
  logger.swap.info(`代币地址: ${tokenAddress}`);
  logger.swap.info(`买入金额: ${bnbAmount} BNB`);

  timerStep(txId, '获取签名器');
  const signer = await getSigner();

  timerStep(txId, '加载设置');
  const settings = await loadSettings();

  const amountIn = ethers.parseEther(bnbAmount);

  timerStep(txId, '获取报价');
  const quote = await getBestQuote(WBNB_ADDRESS, tokenAddress, amountIn);

  if (quote.amountOut === 0n) {
    logger.swap.error('未找到流动性');
    throw new Error('未找到该代币的流动性');
  }

  // 计算滑点保护
  const slippageMultiplier = BigInt(100 - settings.slippage);
  const amountOutMin = (quote.amountOut * slippageMultiplier) / 100n;

  logger.swap.info(`滑点设置: ${settings.slippage}%`);
  logger.swap.info(`最小获得: ${ethers.formatEther(amountOutMin)}`);

  const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
  const gasPrice = ethers.parseUnits(settings.gasPriceGwei.toString(), 'gwei');

  logger.swap.info(`Gas价格: ${settings.gasPriceGwei} Gwei`);

  let tx: ethers.TransactionResponse;

  timerStep(txId, '发送交易');

  if (quote.route === 'v2') {
    logger.swap.info('使用 PancakeSwap V2 路由');
    const router = new ethers.Contract(PANCAKE_ROUTER_V2, PANCAKE_ROUTER_V2_ABI, signer);
    tx = await router.swapExactETHForTokensSupportingFeeOnTransferTokens(
      amountOutMin,
      [WBNB_ADDRESS, tokenAddress],
      signer.address,
      deadline,
      { value: amountIn, gasLimit: DEFAULT_GAS_LIMIT, gasPrice }
    );
  } else {
    logger.swap.info(`使用 PancakeSwap V3 路由 (${FEE_LABELS[quote.fee || 2500]})`);
    const router = new ethers.Contract(PANCAKE_ROUTER_V3, PANCAKE_ROUTER_V3_ABI, signer);
    const params = {
      tokenIn: WBNB_ADDRESS,
      tokenOut: tokenAddress,
      fee: quote.fee || 2500,
      recipient: signer.address,
      amountIn,
      amountOutMinimum: amountOutMin,
      sqrtPriceLimitX96: 0n,
    };
    tx = await router.exactInputSingle(params, {
      value: amountIn,
      gasLimit: DEFAULT_GAS_LIMIT,
      gasPrice,
    });
  }

  logger.swap.info(`交易已发送: ${tx.hash}`);

  timerStep(txId, '等待确认');
  const receipt = await tx.wait();

  const totalTime = timerEnd(txId);

  const success = receipt?.status === 1;

  logTransaction(success ? '买入成功' : '买入失败', {
    '交易哈希': tx.hash,
    '买入金额': `${bnbAmount} BNB`,
    '路由': quote.route.toUpperCase(),
    'Gas使用': receipt?.gasUsed?.toString() || 'N/A',
    '总耗时': `${totalTime.toFixed(0)}ms`,
  });

  return {
    hash: tx.hash,
    success,
  };
}

// 卖出代币 (换BNB)
export async function sellToken(
  tokenAddress: string,
  percentage: number
): Promise<SwapResult> {
  const txId = `sell-${Date.now()}`;
  timerStart(txId, `卖出交易`);

  logger.swap.info(`========== 开始卖出 ==========`);
  logger.swap.info(`代币地址: ${tokenAddress}`);
  logger.swap.info(`卖出比例: ${percentage}%`);

  timerStep(txId, '获取签名器');
  const signer = await getSigner();

  timerStep(txId, '加载设置');
  const settings = await loadSettings();

  // 获取代币余额
  timerStep(txId, '查询代币余额');
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const balance = await tokenContract.balanceOf(signer.address);

  if (balance === 0n) {
    logger.swap.error('代币余额为0');
    throw new Error('没有可卖出的代币余额');
  }

  logger.swap.info(`代币余额: ${ethers.formatEther(balance)}`);

  // 计算卖出数量
  const amountIn = (balance * BigInt(percentage)) / 100n;
  logger.swap.info(`卖出数量: ${ethers.formatEther(amountIn)}`);

  // 获取报价
  timerStep(txId, '获取报价');
  const quote = await getBestQuote(tokenAddress, WBNB_ADDRESS, amountIn);

  if (quote.amountOut === 0n) {
    logger.swap.error('未找到流动性');
    throw new Error('未找到该代币的流动性');
  }

  // 检查授权
  timerStep(txId, '检查授权');
  const routerAddress = quote.route === 'v2' ? PANCAKE_ROUTER_V2 : PANCAKE_ROUTER_V3;
  const allowance = await tokenContract.allowance(signer.address, routerAddress);

  if (allowance < amountIn) {
    logger.swap.info('需要授权，正在发送授权交易...');
    timerStep(txId, '发送授权交易');
    const approveTx = await tokenContract.approve(routerAddress, ethers.MaxUint256);
    await approveTx.wait();
    logger.swap.success('授权成功');
  } else {
    logger.swap.debug('已有足够授权');
  }

  // 计算滑点保护
  const slippageMultiplier = BigInt(100 - settings.slippage);
  const amountOutMin = (quote.amountOut * slippageMultiplier) / 100n;

  logger.swap.info(`滑点设置: ${settings.slippage}%`);
  logger.swap.info(`最小获得: ${ethers.formatEther(amountOutMin)} BNB`);

  const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
  const gasPrice = ethers.parseUnits(settings.gasPriceGwei.toString(), 'gwei');

  let tx: ethers.TransactionResponse;

  timerStep(txId, '发送交易');

  if (quote.route === 'v2') {
    logger.swap.info('使用 PancakeSwap V2 路由');
    const router = new ethers.Contract(PANCAKE_ROUTER_V2, PANCAKE_ROUTER_V2_ABI, signer);
    tx = await router.swapExactTokensForETHSupportingFeeOnTransferTokens(
      amountIn,
      amountOutMin,
      [tokenAddress, WBNB_ADDRESS],
      signer.address,
      deadline,
      { gasLimit: DEFAULT_GAS_LIMIT, gasPrice }
    );
  } else {
    logger.swap.info(`使用 PancakeSwap V3 路由 (${FEE_LABELS[quote.fee || 2500]})`);
    const router = new ethers.Contract(PANCAKE_ROUTER_V3, PANCAKE_ROUTER_V3_ABI, signer);

    // V3需要使用multicall来解包WETH
    const swapParams = {
      tokenIn: tokenAddress,
      tokenOut: WBNB_ADDRESS,
      fee: quote.fee || 2500,
      recipient: routerAddress,
      amountIn,
      amountOutMinimum: amountOutMin,
      sqrtPriceLimitX96: 0n,
    };

    const swapData = router.interface.encodeFunctionData('exactInputSingle', [swapParams]);
    const unwrapData = router.interface.encodeFunctionData('unwrapWETH9', [amountOutMin, signer.address]);

    tx = await router.multicall(deadline, [swapData, unwrapData], {
      gasLimit: DEFAULT_GAS_LIMIT,
      gasPrice,
    });
  }

  logger.swap.info(`交易已发送: ${tx.hash}`);

  timerStep(txId, '等待确认');
  const receipt = await tx.wait();

  const totalTime = timerEnd(txId);

  const success = receipt?.status === 1;

  logTransaction(success ? '卖出成功' : '卖出失败', {
    '交易哈希': tx.hash,
    '卖出比例': `${percentage}%`,
    '路由': quote.route.toUpperCase(),
    '预计获得': `${ethers.formatEther(quote.amountOut)} BNB`,
    'Gas使用': receipt?.gasUsed?.toString() || 'N/A',
    '总耗时': `${totalTime.toFixed(0)}ms`,
  });

  return {
    hash: tx.hash,
    success,
  };
}

// 获取交换报价 (用于显示)
export async function getSwapQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  decimals: number
): Promise<{ amountOut: string; route: string }> {
  const amount = ethers.parseUnits(amountIn, decimals);
  const quote = await getBestQuote(tokenIn, tokenOut, amount);

  return {
    amountOut: ethers.formatUnits(quote.amountOut, 18),
    route: quote.route.toUpperCase(),
  };
}
