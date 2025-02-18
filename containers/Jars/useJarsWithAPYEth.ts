import { useEffect, useState } from "react";

import {
  DEPOSIT_TOKENS_JAR_NAMES,
  JAR_DEPOSIT_TOKENS,
  getPriceId,
} from "./jars";
import { ChainName, NETWORK_NAMES } from "containers/config";
import { PriceIds, Prices } from "../Prices";
import {
  UNI_ETH_DAI_STAKING_REWARDS,
  UNI_ETH_USDC_STAKING_REWARDS,
  UNI_ETH_USDT_STAKING_REWARDS,
  UNI_ETH_WBTC_STAKING_REWARDS,
  SCRV_STAKING_REWARDS,
  Contracts,
  STECRV_STAKING_REWARDS,
  LQTY_LUSD_ETH_STAKING_REWARDS,
  MIRROR_MIR_UST_STAKING_REWARDS,
  MIRROR_MTSLA_UST_STAKING_REWARDS,
  MIRROR_MAAPL_UST_STAKING_REWARDS,
  MIRROR_MQQQ_UST_STAKING_REWARDS,
  MIRROR_MSLV_UST_STAKING_REWARDS,
  MIRROR_MBABA_UST_STAKING_REWARDS,
  FEI_TRIBE_STAKING_REWARDS,
  ALCHEMIX_ALCX_ETH_STAKING_POOLS,
  COMETH_USDC_WETH_REWARDS,
} from "../Contracts";
import { Jar } from "./useFetchJars";
import AaveStrategyAbi from "../ABIs/aave-strategy.json";
import { useCurveRawStats } from "./useCurveRawStats";
import { useCurveCrvAPY } from "./useCurveCrvAPY";
import { useCurveSNXAPY } from "./useCurveSNXAPY";
import { useUniPairDayData } from "./useUniPairDayData";
import { useComethPairDayData } from "./useComethPairDayData";
import { useSushiPairDayData } from "./useSushiPairDayData";
import { ethers } from "ethers";
import { formatEther, getJsonWalletAddress } from "ethers/lib/utils";
import { UniV2Pairs } from "../UniV2Pairs";
import erc20 from "@studydefi/money-legos/erc20";

import { Connection } from "../Connection";
import { SushiPairs } from "../SushiPairs";
import { useCurveLdoAPY } from "./useCurveLdoAPY";
import { Contract } from "@ethersproject/contracts";

import RewarderABI from "../ABIs/rewarder.json";

const AVERAGE_BLOCK_TIME = 13.22;
const YEARN_API = "https://vaults.finance/all";

interface SushiPoolId {
  [key: string]: number;
}

const sushiPoolIds: SushiPoolId = {
  "0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f": 2,
  "0x397FF1542f962076d0BFE58eA045FfA2d347ACa0": 1,
  "0x06da0fd433C1A5d7a4faa01111c044910A184553": 0,
  "0xCEfF51756c56CeFFCA006cD410B03FFC46dd3a58": 21,
  "0x088ee5007C98a9677165D78dD2109AE4a3D04d0C": 11,
  "0x10B47177E92Ef9D5C6059055d92DdF6290848991": 132,
  "0x795065dCc9f64b5614C407a6EFDC400DA6221FB0": 12,
  "0x9461173740D27311b176476FA27e94C681b1Ea6b": 230,
};

const sushiPoolV2Ids: SushiPoolId = {
  "0xC3f279090a47e80990Fe3a9c30d24Cb117EF91a8": 0,
  "0x05767d9EF41dC40689678fFca0608878fb3dE906": 1,
};

const fetchRes = async (url: string) => await fetch(url).then((x) => x.json());

export interface JarApy {
  [k: string]: number;
}

export interface JarWithAPY extends Jar {
  totalAPY: number;
  apr: number;
  APYs: Array<JarApy>;
}

type Input = Array<Jar> | null;
type Output = {
  jarsWithAPY: Array<JarWithAPY> | null;
};

const getCompoundingAPY = (apr: number) => {
  return 100 * (Math.pow(1 + (apr / 365), 365) - 1);
};

export const useJarWithAPY = (network: ChainName, jars: Input): Output => {
  const { multicallProvider } = Connection.useContainer();
  const { controller, strategy } = Contracts.useContainer();
  const { prices } = Prices.useContainer();
  const { getPairData: getSushiPairData } = SushiPairs.useContainer();
  const { getPairData: getUniPairData } = UniV2Pairs.useContainer();
  const {
    stakingRewards,
    susdPool,
    susdGauge,
    renGauge,
    renPool,
    threeGauge,
    threePool,
    sushiChef,
    steCRVPool,
    steCRVGauge,
    masterchefV2,
    yearnRegistry,
  } = Contracts.useContainer();
  const { getUniPairDayAPY } = useUniPairDayData();
  const { getSushiPairDayAPY } = useSushiPairDayData();
  const { rawStats: curveRawStats } = useCurveRawStats(NETWORK_NAMES.ETH);
  const { APYs: susdCrvAPY } = useCurveCrvAPY(
    jars,
    prices?.usdc || null,
    susdGauge,
    susdPool,
  );
  const { APYs: stEthCrvAPY } = useCurveCrvAPY(
    jars,
    prices?.eth || null,
    steCRVGauge,
    steCRVPool,
  );
  const { APYs: threePoolCrvAPY } = useCurveCrvAPY(
    jars,
    prices?.usdc || null,
    threeGauge,
    threePool,
  );
  const { APYs: ren2CrvAPY } = useCurveCrvAPY(
    jars,
    prices?.wbtc || null,
    renGauge,
    renPool,
  );
  const { APYs: susdSNXAPY } = useCurveSNXAPY(
    jars,
    susdPool,
    stakingRewards ? stakingRewards.attach(SCRV_STAKING_REWARDS) : null,
  );
  const { APYs: stEthLdoAPY } = useCurveLdoAPY(
    jars,
    steCRVPool,
    stakingRewards ? stakingRewards.attach(STECRV_STAKING_REWARDS) : null,
  );

  const [jarsWithAPY, setJarsWithAPY] = useState<Array<JarWithAPY> | null>(
    null,
  );
  const [tvlData, setTVLData] = useState<Array<Object>>([]);

  const calculateMirAPY = async (rewardsAddress: string) => {
    if (stakingRewards && prices?.mir && getUniPairData && multicallProvider) {
      const multicallUniStakingRewards = new Contract(
        rewardsAddress,
        stakingRewards.interface.fragments,
        multicallProvider,
      );

      const [rewardRateBN, stakingToken, totalSupplyBN] = await Promise.all([
        multicallUniStakingRewards.rewardRate(),
        multicallUniStakingRewards.lpt(),
        multicallUniStakingRewards.totalSupply(),
      ]);

      const totalSupply = parseFloat(formatEther(totalSupplyBN));
      const mirRewardRate = parseFloat(formatEther(rewardRateBN));

      const { pricePerToken } = await getUniPairData(stakingToken);

      const mirRewardsPerYear = mirRewardRate * (360 * 24 * 60 * 60);
      const valueRewardedPerYear = prices.mir * mirRewardsPerYear;

      const totalValueStaked = totalSupply * pricePerToken;
      const mirAPY = valueRewardedPerYear / totalValueStaked;

      return [
        { mir: getCompoundingAPY(mirAPY * 0.8), apr: mirAPY * 0.8 * 100 },
      ];
    }

    return [];
  };

  const calculateLqtyStakingAPY = async () => {
    const body = {
      operationName: "FindResultDataByResult",
      query: "query FindResultDataByResult($result_id: uuid!) {\n  query_results(where: {id: {_eq: $result_id}}) {\n    id\n    job_id\n    error\n    runtime\n    generated_at\n    columns\n    __typename\n  }\n  get_result_by_result_id(args: {want_result_id: $result_id}) {\n    data\n    __typename\n  }\n}\n",
      variables: { result_id: "90b9cec0-c576-4f87-b5e3-770ceaa99e45" }
    };
    const res = await fetch(
      "https://core-hsr.duneanalytics.com/v1/graphql",
      {
        body: JSON.stringify(body),
        method: "POST",
        mode: "cors",
      },
    ).then((x) => x.json());

    let lqtyApy = 0;
    if (res) {
      lqtyApy = (res?.data?.get_result_by_result_id[0].data?.apr) / 100;
    }

    return [
      { "auto-compounded ETH and LUSD fees": getCompoundingAPY(lqtyApy * 0.8), apr: lqtyApy * 0.8 * 100 },
    ];
  };

  const calculateLqtyAPY = async (rewardsAddress: string) => {
    if (stakingRewards && prices?.mir && getUniPairData && multicallProvider) {
      const multicallUniStakingRewards = new Contract(
        rewardsAddress,
        stakingRewards.interface.fragments,
        multicallProvider,
      );
      const [rewardRateBN, stakingToken, totalSupplyBN] = await Promise.all([
        multicallUniStakingRewards.rewardRate(),
        multicallUniStakingRewards.uniToken(),
        multicallUniStakingRewards.totalSupply(),
      ]);

      const totalSupply = parseFloat(formatEther(totalSupplyBN));
      const lqtyRewardRate = parseFloat(formatEther(rewardRateBN));

      const { pricePerToken } = await getUniPairData(stakingToken);

      const mirRewardsPerYear = lqtyRewardRate * (360 * 24 * 60 * 60);
      const valueRewardedPerYear = prices.lqty * mirRewardsPerYear;

      const totalValueStaked = totalSupply * pricePerToken;
      const lqtyAPY = valueRewardedPerYear / totalValueStaked;

      return [
        { lqty: getCompoundingAPY(lqtyAPY * 0.8), apr: lqtyAPY * 0.8 * 100 },
      ];
    }

    return [];
  };

  const calculateFeiAPY = async (rewardsAddress: string) => {
    if (
      stakingRewards &&
      prices?.tribe &&
      getUniPairData &&
      multicallProvider
    ) {
      const multicallUniStakingRewards = new Contract(
        rewardsAddress,
        stakingRewards.interface.fragments,
        multicallProvider,
      );

      const [rewardRateBN, stakingToken, totalSupplyBN] = await Promise.all([
        multicallUniStakingRewards.rewardRate(),
        multicallUniStakingRewards.stakingToken(),
        multicallUniStakingRewards.totalSupply(),
      ]);

      const totalSupply = parseFloat(formatEther(totalSupplyBN));
      const tribeRewardRate = parseFloat(formatEther(rewardRateBN));

      const { pricePerToken } = await getUniPairData(stakingToken);

      const tribeRewardsPerYear = tribeRewardRate * (360 * 24 * 60 * 60);
      const valueRewardedPerYear = prices.tribe * tribeRewardsPerYear;

      const totalValueStaked = totalSupply * pricePerToken;
      const tribeAPY = valueRewardedPerYear / totalValueStaked;

      return [
        { tribe: getCompoundingAPY(tribeAPY * 0.8), apr: tribeAPY * 0.8 * 100 },
      ];
    }

    return [];
  };

  const calculateMCv2APY = async (
    lpTokenAddress: string,
    rewardToken: PriceIds,
  ) => {
    if (masterchefV2 && prices && getSushiPairData && multicallProvider) {
      const poolId = sushiPoolV2Ids[lpTokenAddress];

      const rewarder_addr = await masterchefV2.rewarder(poolId);

      const rewarder = new Contract(
        rewarder_addr,
        RewarderABI,
        multicallProvider,
      );
      const lpToken = new Contract(
        lpTokenAddress,
        erc20.abi,
        multicallProvider,
      );
      const totalSupplyBN = await lpToken.balanceOf(masterchefV2.address);
      const totalSupply = parseFloat(formatEther(totalSupplyBN));
      const { pricePerToken } = await getSushiPairData(lpTokenAddress);

      let rewardsPerYear = 0;
      if (rewardToken === "alcx") {
        const tokenPerBlockBN = await rewarder.tokenPerBlock();
        rewardsPerYear =
          (parseFloat(formatEther(tokenPerBlockBN)) * (360 * 24 * 60 * 60)) /
          AVERAGE_BLOCK_TIME;
      } else if (rewardToken === "cvx") {
        const tokenPerSecondBN = await rewarder.rewardRate();

        rewardsPerYear =
          parseFloat(formatEther(tokenPerSecondBN)) * (360 * 24 * 60 * 60);
      }

      const valueRewardedPerYear = prices[rewardToken] * rewardsPerYear;

      const totalValueStaked = totalSupply * pricePerToken;
      const rewardAPY = valueRewardedPerYear / totalValueStaked;

      return [
        {
          [rewardToken]: getCompoundingAPY(rewardAPY * 0.8),
          apr: rewardAPY * 0.8 * 100,
        },
      ];
    }

    return [];
  };

  const calculateSushiAPY = async (lpTokenAddress: string) => {
    if (sushiChef && prices?.sushi && getSushiPairData && multicallProvider) {
      const poolId = sushiPoolIds[lpTokenAddress];
      const multicallSushiChef = new Contract(
        sushiChef.address,
        sushiChef.interface.fragments,
        multicallProvider,
      );
      const lpToken = new Contract(
        lpTokenAddress,
        erc20.abi,
        multicallProvider,
      );

      const totalSupplyBN = await lpToken.balanceOf(sushiChef.address);

      const [
        sushiPerBlockBN,
        totalAllocPointBN,
        poolInfo,
        // totalSupplyBN,
      ] = await Promise.all([
        multicallSushiChef.sushiPerBlock(),
        multicallSushiChef.totalAllocPoint(),
        multicallSushiChef.poolInfo(poolId),
        // lpToken.balanceOf(sushiChef.address),
      ]);

      const totalSupply = parseFloat(formatEther(totalSupplyBN));
      const sushiRewardsPerBlock =
        (parseFloat(formatEther(sushiPerBlockBN)) *
          0.9 *
          poolInfo.allocPoint.toNumber()) /
        totalAllocPointBN.toNumber();

      const { pricePerToken } = await getSushiPairData(lpTokenAddress);

      const sushiRewardsPerYear =
        sushiRewardsPerBlock * ((360 * 24 * 60 * 60) / AVERAGE_BLOCK_TIME);
      const valueRewardedPerYear = prices.sushi * sushiRewardsPerYear;

      const totalValueStaked = totalSupply * pricePerToken;
      const sushiAPY = valueRewardedPerYear / totalValueStaked;

      // no more UNI being distributed
      return [
        { sushi: getCompoundingAPY(sushiAPY * 0.8), apr: sushiAPY * 0.8 * 100 },
      ];
    }

    return [];
  };

  const calculateSushiV2APY = async (lpTokenAddress: string) => {
    if (
      masterchefV2 &&
      prices?.sushi &&
      getSushiPairData &&
      multicallProvider
    ) {
      const poolId = sushiPoolV2Ids[lpTokenAddress];
      const multicallMasterChefV2 = new Contract(
        masterchefV2.address,
        masterchefV2.interface.fragments,
        multicallProvider,
      );
      const lpToken = new Contract(
        lpTokenAddress,
        erc20.abi,
        multicallProvider,
      );

      const [
        sushiPerBlockBN,
        totalAllocPointBN,
        poolInfo,
        totalSupplyBN,
      ] = await Promise.all([
        multicallMasterChefV2.sushiPerBlock(),
        multicallMasterChefV2.totalAllocPoint(),
        multicallMasterChefV2.poolInfo(poolId),
        lpToken.balanceOf(masterchefV2.address),
      ]);

      const totalSupply = parseFloat(formatEther(totalSupplyBN));
      const sushiRewardsPerBlock =
        (parseFloat(formatEther(sushiPerBlockBN)) *
          0.9 *
          poolInfo.allocPoint.toNumber()) /
        totalAllocPointBN.toNumber();

      const { pricePerToken } = await getSushiPairData(lpTokenAddress);

      const sushiRewardsPerYear =
        sushiRewardsPerBlock * ((360 * 24 * 60 * 60) / AVERAGE_BLOCK_TIME);
      const valueRewardedPerYear = prices.sushi * sushiRewardsPerYear;

      const totalValueStaked = totalSupply * pricePerToken;
      const sushiAPY = valueRewardedPerYear / totalValueStaked;

      // no more UNI being distributed
      return [
        { sushi: getCompoundingAPY(sushiAPY * 0.8), apr: sushiAPY * 0.8 * 100 },
      ];
    }

    return [];
  };

  const calculateYearnAPY = async (depositToken: string) => {
    if (yearnRegistry) {
      const vault = await yearnRegistry.latestVault(depositToken, {
        gasLimit: 1000000,
      });
      const yearnData = await fetchRes(YEARN_API);
      const vaultData = yearnData.find(
        (x) => x.address.toLowerCase() === vault.toLowerCase(),
      );
      if (vaultData) {
        const apr = vaultData?.apy?.data?.netApy || 0;
        return [
          {
            yearn: apr * 100,
            apr: apr * 100,
          },
          { vault: vaultData.name },
        ];
      }
    }
    return [];
  };

  const calculateAPY = async () => {
    if (jars && controller && strategy) {
      const [
        sushiEthDaiApy,
        sushiEthUsdcApy,
        sushiEthUsdtApy,
        sushiEthWBtcApy,
        sushiEthYfiApy,
        sushiEthApy,
        sushiEthAlcxApy,
      ] = await Promise.all([
        calculateSushiAPY(JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH_DAI),
        calculateSushiAPY(JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH_USDC),
        calculateSushiAPY(JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH_USDT),
        calculateSushiAPY(JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH_WBTC),
        calculateSushiAPY(JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH_YFI),
        calculateSushiAPY(JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH),
        calculateSushiV2APY(
          JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH_ALCX,
        ),
      ]);

      const [
        sushiEthyveCRVApy,
        sushiEthyvboostApy,
        alcxEthAlcxApy,
        usdcApy,
        crvLusdApy,
        cvxEthApy,
        sushiCvxEthApy,
      ] = await Promise.all([
        calculateSushiAPY(
          JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH_YVECRV,
        ),
        calculateSushiAPY(
          JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH_YVBOOST,
        ),
        calculateMCv2APY(
          JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH_ALCX,
          "alcx",
        ),
        calculateYearnAPY(JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].USDC),
        calculateYearnAPY(JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].lusdCRV),
        calculateMCv2APY(
          JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_CVX_ETH,
          "cvx",
        ),
        calculateSushiV2APY(
          JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_CVX_ETH,
        ),
      ]);

      const [
        mirrorMirUstApy,
        mirrorMtslaUstApy,
        mirrorMaaplUstApy,
        mirrorMqqqUstApy,
        mirrorMslvUstApy,
        mirrorMbabaUstApy,
        feiTribeApy,
        lqtyEthLusdApy,
        lqtyApy,
      ] = await Promise.all([
        calculateMirAPY(MIRROR_MIR_UST_STAKING_REWARDS),
        calculateMirAPY(MIRROR_MTSLA_UST_STAKING_REWARDS),
        calculateMirAPY(MIRROR_MAAPL_UST_STAKING_REWARDS),
        calculateMirAPY(MIRROR_MQQQ_UST_STAKING_REWARDS),
        calculateMirAPY(MIRROR_MSLV_UST_STAKING_REWARDS),
        calculateMirAPY(MIRROR_MBABA_UST_STAKING_REWARDS),
        calculateFeiAPY(FEI_TRIBE_STAKING_REWARDS),
        calculateLqtyAPY(LQTY_LUSD_ETH_STAKING_REWARDS),
        calculateLqtyStakingAPY(),
      ]);

      const promises = jars.map(async (jar) => {
        let APYs: Array<JarApy> = [];
        let totalAPY = 0;

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.sCRV) {
          APYs = [
            { lp: curveRawStats?.ren2 || 0 },
            ...susdCrvAPY,
            ...susdSNXAPY,
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.steCRV) {
          APYs = [
            { lp: curveRawStats?.steth || 0 },
            ...stEthLdoAPY,
            ...stEthCrvAPY,
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.renCRV) {
          APYs = [{ lp: curveRawStats?.susd || 0 }, ...ren2CrvAPY];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES["3CRV"]) {
          APYs = [
            { lp: curveRawStats ? curveRawStats["3pool"] : 0 },
            ...threePoolCrvAPY,
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.UNIV2_MIR_UST) {
          APYs = [
            ...mirrorMirUstApy,
            ...getUniPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].UNIV2_MIR_UST,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.UNIV2_MTSLA_UST) {
          APYs = [
            ...mirrorMtslaUstApy,
            ...getUniPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].UNIV2_MTSLA_UST,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.UNIV2_MAAPL_UST) {
          APYs = [
            ...mirrorMaaplUstApy,
            ...getUniPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].UNIV2_MAAPL_UST,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.UNIV2_MQQQ_UST) {
          APYs = [
            ...mirrorMqqqUstApy,
            ...getUniPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].UNIV2_MQQQ_UST,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.UNIV2_MSLV_UST) {
          APYs = [
            ...mirrorMslvUstApy,
            ...getUniPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].UNIV2_MSLV_UST,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.UNIV2_MBABA_UST) {
          APYs = [
            ...mirrorMbabaUstApy,
            ...getUniPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].UNIV2_MBABA_UST,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.UNIV2_FEI_TRIBE) {
          APYs = [
            ...feiTribeApy,
            ...getUniPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].UNIV2_FEI_TRIBE,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.UNIV2_LUSD_ETH) {
          APYs = [
            ...lqtyEthLusdApy,
            ...getUniPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].UNIV2_LUSD_ETH,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.SUSHI_ETH_DAI) {
          APYs = [
            ...sushiEthDaiApy,
            ...getSushiPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH_DAI,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.SUSHI_ETH_USDC) {
          APYs = [
            ...sushiEthUsdcApy,
            ...getSushiPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH_USDC,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.SUSHI_ETH_USDT) {
          APYs = [
            ...sushiEthUsdtApy,
            ...getSushiPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH_USDT,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.SUSHI_ETH_WBTC) {
          APYs = [
            ...sushiEthWBtcApy,
            ...getSushiPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH_WBTC,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.SUSHI_ETH_YFI) {
          APYs = [
            ...sushiEthYfiApy,
            ...getSushiPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH_YFI,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.SUSHI_ETH_YVECRV) {
          APYs = [
            ...sushiEthyveCRVApy,
            ...getSushiPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH_YVECRV,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.SUSHI_ETH_YVBOOST) {
          APYs = [
            ...sushiEthyvboostApy,
            ...getSushiPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH_YVBOOST,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.SUSHI_ETH) {
          APYs = [
            ...sushiEthApy,
            ...getSushiPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.SUSHI_ETH_ALCX) {
          APYs = [
            ...alcxEthAlcxApy,
            ...sushiEthAlcxApy,
            ...getSushiPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_ETH_ALCX,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.USDC) {
          APYs = [...usdcApy];
          totalAPY = usdcApy[0].apr;
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.lusdCRV) {
          APYs = [...crvLusdApy];
          totalAPY = crvLusdApy[0].apr;
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.SUSHI_CVX_ETH) {
          APYs = [
            ...cvxEthApy,
            ...sushiCvxEthApy,
            ...getSushiPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.ETH].SUSHI_CVX_ETH,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.LQTY) {
          APYs = [...lqtyApy];
        }

        let apr = 0;
        APYs.map((x) => {
          if (x.apr) {
            apr += x.apr;
            delete x.apr;
          }
        });

        let lp = 0;
        APYs.map((x) => {
          if (x.lp) {
            lp += x.lp;
          }
        });

        // const totalAPY = APYs.map((x) => {
        //   return Object.values(x).reduce((acc, y) => acc + y, 0);
        // }).reduce((acc, x) => acc + x, 0);
        if (!totalAPY) totalAPY = getCompoundingAPY(apr / 100) + lp;

        return {
          ...jar,
          APYs,
          totalAPY,
          apr,
        };
      });

      const newJarsWithAPY = await Promise.all(promises);

      setJarsWithAPY(newJarsWithAPY);
    }
  };

  useEffect(() => {
    if (network === NETWORK_NAMES.ETH) calculateAPY();
  }, [jars, prices, network]);

  return { jarsWithAPY };
};
