// fourmeme-sell-complete.js
const { ethers } = require("ethers");
require("dotenv").config();

async function sellFourMemeToken() {
  // ====================== 配置 ======================
  const RPC = "https://bsc-dataseed.binance.org/";  // 或更快 RPC
  const PRIVATE_KEY = process.env.PRIVATE_KEY;      // 你的私钥（小心安全！）
  const TOKEN_ADDRESS = "0x...你的meme币合约地址...";  // 改这里
  const SELL_AMOUNT = "1000000";                    // 要卖的 token 数量（字符串，根据 decimals 调整）
  const MIN_BNB_OUT = "0.001";                      // 最小接收 BNB（防滑点/最低输出，单位 BNB）

  let LAUNCHPAD_ADDRESS = "0x5c952063c7fc8610ffdb798152d69f0b9550762b";
  LAUNCHPAD_ADDRESS = ethers.getAddress(LAUNCHPAD_ADDRESS.toLowerCase());

  // ABI
  const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)"
  ];

  const SELL_ABI = [
    {
      "inputs": [
        { "internalType": "address", "name": "token", "type": "address" },
        { "internalType": "uint256", "name": "amount", "type": "uint256" },
        { "internalType": "uint256", "name": "minEth", "type": "uint256" }
      ],
      "name": "sellTokenAMAP",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ];

  // ======================================================

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log(`卖出钱包: ${wallet.address}`);

  const safeToken = ethers.getAddress(TOKEN_ADDRESS);

  // 步骤1: 获取 decimals 并计算精确数量（BigInt）
  const tokenContract = new ethers.Contract(safeToken, ERC20_ABI, provider);
  const decimals = await tokenContract.decimals();
  const amountToSell = ethers.parseUnits(SELL_AMOUNT, decimals);
  const minEthWei = ethers.parseEther(MIN_BNB_OUT);

  // 可选: 检查余额是否足够
  const balance = await tokenContract.balanceOf(wallet.address);
  if (balance < amountToSell) {
    console.error("余额不足！当前:", ethers.formatUnits(balance, decimals));
    return;
  }

  console.log(`准备卖出: ${SELL_AMOUNT} token (精确: ${amountToSell})`);
  console.log(`最小接收: ${MIN_BNB_OUT} BNB (精确: ${minEthWei})`);

  try {
    // 步骤2: 先 approve launchpad 合约（如果没授权过）
    const approveTx = await tokenContract.connect(wallet).approve(
      LAUNCHPAD_ADDRESS,
      amountToSell  // 或 ethers.MaxUint256 以永久授权
    );
    console.log("Approve Tx 发送:", approveTx.hash);
    await approveTx.wait();
    console.log("Approve 确认成功！");

    // 步骤3: 执行 sellTokenAMAP
    const sellContract = new ethers.Contract(LAUNCHPAD_ADDRESS, SELL_ABI, wallet);
    const sellTx = await sellContract.sellTokenAMAP(
      safeToken,
      amountToSell,
      1n,
      {
        gasLimit: 500000,          // 内盘 sell 通常 30-50 万 gas
        // maxPriorityFeePerGas: ethers.parseUnits("2", "gwei") // 如需加速
      }
    );

    console.log("Sell Tx 发送！Hash:", sellTx.hash);
    console.log("查看: https://bscscan.com/tx/" + sellTx.hash);

    const receipt = await sellTx.wait();
    console.log("卖出确认成功！区块:", receipt.blockNumber);
    console.log("实际消耗 gas:", receipt.gasUsed.toString());
  } catch (e) {
    console.error("卖出失败:", e.shortMessage || e.message || e);
    // 常见错误:
    // - execution reverted: 可能 minEth 太高、曲线已毕业、未 approve
    // - out of gas: 调高 gasLimit 到 600000-800000
    // - bonding curve 已满: 检查 balanceOf(launchpad) ≈0 → 切换 Pancake sell
  }
}

sellFourMemeToken().catch(console.error);