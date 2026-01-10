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
  fee?: number;
}

interface SwapResult {
  hash: string;
  status: 'sent' | 'failed';
}

// V3手续费档位
const V3_FEE_TIERS = [500, 2500, 10000]; // 移除100，加快速度
const FEE_LABELS: Record<number, string> = {
  500: '0.05%',
  2500: '0.25%',
  10000: '1%',
};

// 授权缓存 (避免重复查询)
const approvalCache = new Map<string, boolean>();

// 获取最优报价 (并行查询加速)
async function getBestQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint
): Promise<SwapQuote> {
  timerStart('quote', '获取报价');

  const provider = await getProvider();

  // 并行查询V2和V3
  const routerV2 = new ethers.Contract(PANCAKE_ROUTER_V2, PANCAKE_ROUTER_V2_ABI, provider);
  const quoterV3 = new ethers.Contract(PANCAKE_QUOTER_V3, PANCAKE_QUOTER_V3_ABI, provider);

  const v2Promise = routerV2.getAmountsOut(amountIn, [tokenIn, tokenOut]).catch(() => null);

  const v3Promises = V3_FEE_TIERS.map(fee =>
    quoterV3.quoteExactInputSingle.staticCall({
      tokenIn,
      tokenOut,
      amountIn,
      fee,
      sqrtPriceLimitX96: 0n,
    }).then(r => ({ fee, amountOut: r.amountOut })).catch(() => null)
  );

  const [v2Result, ...v3Results] = await Promise.all([v2Promise, ...v3Promises]);

  let bestQuote: SwapQuote = { amountOut: 0n, route: 'v2' };

  // V2结果
  if (v2Result) {
    bestQuote = { amountOut: v2Result[v2Result.length - 1], route: 'v2' };
  }

  // V3结果
  for (const result of v3Results) {
    if (result && result.amountOut > bestQuote.amountOut) {
      bestQuote = { amountOut: result.amountOut, route: 'v3', fee: result.fee };
    }
  }

  timerEnd('quote');
  logger.swap.info(`最优路由: ${bestQuote.route.toUpperCase()}${bestQuote.fee ? ` (${FEE_LABELS[bestQuote.fee]})` : ''}`);

  return bestQuote;
}

// 后台授权 (不等待)
async function ensureApproval(
  tokenAddress: string,
  routerAddress: string,
  signer: ethers.Wallet
): Promise<void> {
  const cacheKey = `${tokenAddress}-${routerAddress}`;

  // 检查缓存
  if (approvalCache.get(cacheKey)) {
    return;
  }

  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const allowance = await tokenContract.allowance(signer.address, routerAddress);

  if (allowance < ethers.MaxUint256 / 2n) {
    logger.swap.info('发送授权交易...');
    const tx = await tokenContract.approve(routerAddress, ethers.MaxUint256);
    // 不等待确认，后台处理
    tx.wait().then(() => {
      logger.swap.success('授权完成');
      approvalCache.set(cacheKey, true);
    }).catch(() => {
      logger.swap.error('授权失败');
    });

    // 等待一小段时间让交易广播
    await new Promise(r => setTimeout(r, 500));
  } else {
    approvalCache.set(cacheKey, true);
  }
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
    const [signer, settings] = await Promise.all([getSigner(), loadSettings()]);

    const amountIn = ethers.parseEther(bnbAmount);

    timerStep(txId, '获取报价');
    const quote = await getBestQuote(WBNB_ADDRESS, tokenAddress, amountIn);

    if (quote.amountOut === 0n) {
      throw new Error('无流动性');
    }

    // 计算滑点
    const amountOutMin = (quote.amountOut * BigInt(100 - settings.slippage)) / 100n;
    const deadline = Math.floor(Date.now() / 1000) + 300; // 5分钟
    const gasPrice = ethers.parseUnits(settings.gasPriceGwei.toString(), 'gwei');

    timerStep(txId, '发送交易');

    let tx: ethers.TransactionResponse;

    if (quote.route === 'v2') {
      const router = new ethers.Contract(PANCAKE_ROUTER_V2, PANCAKE_ROUTER_V2_ABI, signer);
      tx = await router.swapExactETHForTokensSupportingFeeOnTransferTokens(
        amountOutMin,
        [WBNB_ADDRESS, tokenAddress],
        signer.address,
        deadline,
        { value: amountIn, gasLimit: DEFAULT_GAS_LIMIT, gasPrice }
      );
    } else {
      const router = new ethers.Contract(PANCAKE_ROUTER_V3, PANCAKE_ROUTER_V3_ABI, signer);
      tx = await router.exactInputSingle({
        tokenIn: WBNB_ADDRESS,
        tokenOut: tokenAddress,
        fee: quote.fee || 2500,
        recipient: signer.address,
        amountIn,
        amountOutMinimum: amountOutMin,
        sqrtPriceLimitX96: 0n,
      }, { value: amountIn, gasLimit: DEFAULT_GAS_LIMIT, gasPrice });
    }

    const elapsed = timerEnd(txId);

    logTransaction('买入已发送', {
      '交易哈希': tx.hash,
      '金额': `${bnbAmount} BNB`,
      '路由': quote.route.toUpperCase(),
      '耗时': `${elapsed.toFixed(0)}ms`,
    });

    // 后台监控交易状态
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
    logger.swap.error(`买入失败: ${error.message}`);
    throw error;
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
    const [signer, settings] = await Promise.all([getSigner(), loadSettings()]);

    // 获取余额
    timerStep(txId, '查询余额');
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const balance = await tokenContract.balanceOf(signer.address);

    if (balance === 0n) {
      throw new Error('余额为0');
    }

    const amountIn = (balance * BigInt(percentage)) / 100n;

    // 并行: 获取报价 + 检查授权
    timerStep(txId, '报价+授权');
    const quote = await getBestQuote(tokenAddress, WBNB_ADDRESS, amountIn);

    if (quote.amountOut === 0n) {
      throw new Error('无流动性');
    }

    const routerAddress = quote.route === 'v2' ? PANCAKE_ROUTER_V2 : PANCAKE_ROUTER_V3;
    await ensureApproval(tokenAddress, routerAddress, signer);

    // 计算滑点
    const amountOutMin = (quote.amountOut * BigInt(100 - settings.slippage)) / 100n;
    const deadline = Math.floor(Date.now() / 1000) + 300;
    const gasPrice = ethers.parseUnits(settings.gasPriceGwei.toString(), 'gwei');

    timerStep(txId, '发送交易');

    let tx: ethers.TransactionResponse;

    if (quote.route === 'v2') {
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
      const router = new ethers.Contract(PANCAKE_ROUTER_V3, PANCAKE_ROUTER_V3_ABI, signer);
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

    const elapsed = timerEnd(txId);

    logTransaction('卖出已发送', {
      '交易哈希': tx.hash,
      '比例': `${percentage}%`,
      '预计': `${ethers.formatEther(quote.amountOut)} BNB`,
      '路由': quote.route.toUpperCase(),
      '耗时': `${elapsed.toFixed(0)}ms`,
    });

    // 后台监控
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
    logger.swap.error(`卖出失败: ${error.message}`);
    throw error;
  }
}
