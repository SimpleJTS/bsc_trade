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

interface SwapQuote {
  amountOut: bigint;
  route: 'v2' | 'v3';
  priceImpact: number;
}

interface SwapResult {
  hash: string;
  success: boolean;
}

// V3 fee tiers
const V3_FEE_TIERS = [100, 500, 2500, 10000];

// Get best quote from V2 and V3
async function getBestQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint
): Promise<SwapQuote> {
  const provider = await getProvider();

  // Get V2 quote
  const routerV2 = new ethers.Contract(PANCAKE_ROUTER_V2, PANCAKE_ROUTER_V2_ABI, provider);
  let v2Quote = 0n;

  try {
    const path = [tokenIn, tokenOut];
    const amounts = await routerV2.getAmountsOut(amountIn, path);
    v2Quote = amounts[amounts.length - 1];
  } catch {
    // V2 pair might not exist
  }

  // Get V3 quote (try all fee tiers)
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
      }
    } catch {
      // This fee tier might not exist
    }
  }

  // Return best route
  if (v3Quote > v2Quote) {
    return {
      amountOut: v3Quote,
      route: 'v3',
      priceImpact: 0, // TODO: Calculate actual price impact
    };
  }

  return {
    amountOut: v2Quote,
    route: 'v2',
    priceImpact: 0,
  };
}

// Buy token with BNB
export async function buyToken(
  tokenAddress: string,
  bnbAmount: string
): Promise<SwapResult> {
  const signer = await getSigner();
  const settings = await loadSettings();

  const amountIn = ethers.parseEther(bnbAmount);
  const quote = await getBestQuote(WBNB_ADDRESS, tokenAddress, amountIn);

  if (quote.amountOut === 0n) {
    throw new Error('No liquidity found for this token');
  }

  // Calculate minimum amount out with slippage
  const slippageMultiplier = BigInt(100 - settings.slippage);
  const amountOutMin = (quote.amountOut * slippageMultiplier) / 100n;

  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes
  const gasPrice = ethers.parseUnits(settings.gasPriceGwei.toString(), 'gwei');

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
    const params = {
      tokenIn: WBNB_ADDRESS,
      tokenOut: tokenAddress,
      fee: 2500, // 0.25%
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

  const receipt = await tx.wait();
  return {
    hash: tx.hash,
    success: receipt?.status === 1,
  };
}

// Sell token for BNB
export async function sellToken(
  tokenAddress: string,
  percentage: number
): Promise<SwapResult> {
  const signer = await getSigner();
  const settings = await loadSettings();

  // Get token balance
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const balance = await tokenContract.balanceOf(signer.address);

  if (balance === 0n) {
    throw new Error('No token balance to sell');
  }

  // Calculate amount to sell
  const amountIn = (balance * BigInt(percentage)) / 100n;

  // Get quote
  const quote = await getBestQuote(tokenAddress, WBNB_ADDRESS, amountIn);

  if (quote.amountOut === 0n) {
    throw new Error('No liquidity found for this token');
  }

  // Check and approve if needed
  const routerAddress = quote.route === 'v2' ? PANCAKE_ROUTER_V2 : PANCAKE_ROUTER_V3;
  const allowance = await tokenContract.allowance(signer.address, routerAddress);

  if (allowance < amountIn) {
    const approveTx = await tokenContract.approve(routerAddress, ethers.MaxUint256);
    await approveTx.wait();
  }

  // Calculate minimum amount out with slippage
  const slippageMultiplier = BigInt(100 - settings.slippage);
  const amountOutMin = (quote.amountOut * slippageMultiplier) / 100n;

  const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
  const gasPrice = ethers.parseUnits(settings.gasPriceGwei.toString(), 'gwei');

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

    // For V3, we need to use multicall to unwrap WETH
    const swapParams = {
      tokenIn: tokenAddress,
      tokenOut: WBNB_ADDRESS,
      fee: 2500,
      recipient: routerAddress, // Send to router first
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

  const receipt = await tx.wait();
  return {
    hash: tx.hash,
    success: receipt?.status === 1,
  };
}

// Get swap quote for display
export async function getSwapQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  decimals: number
): Promise<{ amountOut: string; route: string }> {
  const amount = ethers.parseUnits(amountIn, decimals);
  const quote = await getBestQuote(tokenIn, tokenOut, amount);

  return {
    amountOut: ethers.formatUnits(quote.amountOut, 18), // Assuming output is BNB/WBNB
    route: quote.route.toUpperCase(),
  };
}
