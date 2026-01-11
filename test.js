// 全局/模块级预准备（启动 bot 时执行一次或定期更新）
let cachedFeeData = null;
let cachedChainId = null;
let localNonce = null;  // 本地 nonce 计数器（防重复查询）

async function preloadCommonData(provider, address) {
  // 预取 fee 和 chainId（每 10-30 秒更新一次）
  const feeData = await provider.getFeeData();
  cachedFeeData = {
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("0.5", "gwei"),
  };

  const network = await provider.getNetwork();
  cachedChainId = network.chainId;

  // 初始化本地 nonce（pending 状态）
  localNonce = await provider.getTransactionCount(address, "pending");
}

// 在看到 meme 后，快速买入（核心函数）
async function quickBuyFourMeme(launchpadContract, safeToken, amountInBNB, provider, signer) {
  const amountIn = ethers.parseEther(amountInBNB.toString());

  // 步骤1: 快速获取/递增 nonce（本地优先，fallback 到链上）
  let nonce;
  try {
    nonce = localNonce ?? await provider.getTransactionCount(signer.address, "pending");
    localNonce = nonce + 1;  // 乐观递增（成功后再确认）
  } catch (e) {
    nonce = await provider.getTransactionCount(signer.address, "pending");
    localNonce = nonce + 1;
  }

  // 步骤2: 准备 transaction request（最耗时的部分提前缓存）
  const txRequest = {
    to: launchpadContract.target,  // 或合约地址
    data: launchpadContract.interface.encodeFunctionData("buyTokenAMAP", [
      safeToken,
      signer.address,
      amountIn,
      1n,  // minAmount
    ]),
    value: amountIn,
    gasLimit: 600000n,
    nonce,
    chainId: cachedChainId,
    ...cachedFeeData,  // 用预缓存的 fee
  };

  // 步骤3: 填充（如果需要额外自动值，但基本已全）
  const populatedTx = await signer.populateTransaction(txRequest);  // 这一步很快，因为大部分已填

  // 步骤4: 签名（这是必须的最后一步）
  const signedTx = await signer.signTransaction(populatedTx);

  // 步骤5: 立即广播（broadcastTransaction 比 sendTransaction 略快）
  const txResponse = await provider.broadcastTransaction(signedTx);

  console.log("快速买入 Tx hash:", txResponse.hash);

  // 成功后可监听确认，失败时重置 localNonce = await getTransactionCount("pending")
  return txResponse;
}