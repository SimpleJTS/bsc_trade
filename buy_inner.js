// fourmeme-simple-buy.js
const { ethers } = require("ethers");

async function main() {
  // ====================== 配置部分 ======================
  const RPC = "https://bsc.publicnode.com";           // 或者用更快的节点
  const PRIVATE_KEY = '';               // 你的私钥！！注意安全
  let TOKEN_ADDRESS = "";        // 目标 token CA
  const AMOUNT_BNB = "0.01";                                 // 要买多少 BNB（字符串格式）

  // 核心交互合约（Four.meme 主路由/launchpad 合约）
  let LAUNCHPAD_ADDRESS = "0x5c952063c7fc8610ffdb798152D69F0B9550762b";

  // 强制修正 checksum（防报错）
  //TOKEN_ADDRESS = ethers.getAddress(TOKEN_ADDRESS.toLowerCase());
  LAUNCHPAD_ADDRESS = ethers.getAddress(LAUNCHPAD_ADDRESS.toLowerCase());

  // PancakeSwap V2 Router + Factory（外盘用）
  const V2_ROUTER_ADDRESS = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
  const V2_FACTORY_ADDRESS = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
  const WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

  // 阈值：如果 launchpad 持有的 token > 这个值 → 未毕业（调整根据 token totalSupply，通常 1e8+ 安全）
  const UNGRADUATED_THRESHOLD = 100000000n;  // 1e8 BigInt

  // ABI 片段
  const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
  const FOURMEME_ABI = [
    {
      "inputs": [
        {"internalType": "address", "name": "token", "type": "address"},
        {"internalType": "address", "name": "to", "type": "address"},
        {"internalType": "uint256", "name": "funds", "type": "uint256"},
        {"internalType": "uint256", "name": "minAmount", "type": "uint256"}
      ],
      "name": "buyTokenAMAP",
      "outputs": [],
      "stateMutability": "payable",
      "type": "function"
    },
    [
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
    ]
  ];
  // ======================================================

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log(`钱包: ${wallet.address}`);

  // 步骤1: 强制 checksum 地址
  const safeToken = ethers.getAddress(TOKEN_ADDRESS);

  // 步骤2: 判断毕业状态
  const tokenContract = new ethers.Contract(safeToken, ERC20_ABI, provider);
  const launchpadBalance = await tokenContract.balanceOf(LAUNCHPAD_ADDRESS);
  console.log(`Launchpad 持有的 token: ${launchpadBalance}`);

  let isGraduated = false;
  if (launchpadBalance <= UNGRADUATED_THRESHOLD) {
    // 额外确认: 查 Pancake V2 pair 是否存在（>0 LP）
    const factory = new ethers.Contract(V2_FACTORY_ADDRESS, V2_FACTORY_ABI, provider);
    const pairAddress = await factory.getPair(WBNB_ADDRESS, safeToken);
    if (pairAddress !== ethers.ZeroAddress) {
      isGraduated = true;
      console.log("已毕业！使用 V2 交易");
    } else {
      console.log("Launchpad 余额低但无 LP，可能 rug 或错误 → 退出");
      return;
    }
  } else {
    console.log("未毕业！使用 Four.meme 内盘买入");
  }

  const amountWei = ethers.parseEther(AMOUNT_BNB);

  try {
    let tx;
    if (!isGraduated) {
      // 内盘买入
      const contract = new ethers.Contract(LAUNCHPAD_ADDRESS, FOURMEME_ABI, wallet);
      tx = await contract.buyTokenAMAP(
        safeToken,
        wallet.address,
        amountWei,
        1n,  // min out
        { value: amountWei, gasLimit: 600000 }
      );
    } else {
      // 外盘 V2 买入
      
    }

    console.log("Tx 发送！Hash:", tx.hash);
    console.log("查: https://bscscan.com/tx/" + tx.hash);

    await tx.wait();
    console.log("确认成功！");
  } catch (e) {
    console.error("失败:", e.shortMessage || e.message);
    // 常见: "execution reverted" → 可能毕业中途/滑点不够/流动性浅
  }
}

main().catch(console.error);