import { Contract } from "@ethersproject/contracts";
import { useState, useEffect } from "react";

import { Connection } from "../Connection";
import { Contracts, GAUGE_PROXY } from "../Contracts";

export interface RawGauge {
  token: string;
  gaugeAddress: string;
  allocPoint: number;
  derivedSupply: number;
  rewardRate: number;
  gaugeWeight: number;
  totalSupply: number;
}

export const useFetchGauges = (): { rawGauges: Array<RawGauge> | null } => {
  const {
    blockNum,
    multicallProvider,
    chainName,
    provider
  } = Connection.useContainer();
  const { gaugeProxy, gauge } = Contracts.useContainer();

  const [gauges, setGauges] = useState<Array<RawGauge> | null>(null);

  const getGauges = async () => {
    if (gaugeProxy && multicallProvider && gauge && chainName === "Ethereum") {
      const tokens = await gaugeProxy.tokens();
      const totalWeight = await gaugeProxy.totalWeight();

      const gaugeAddresses = await Promise.all(
        tokens.map((token) => {
          return gaugeProxy.getGauge(token);
        }),
      );

      const gaugeWeights = await Promise.all(
        tokens.map((token) => {
          return gaugeProxy.weights(token);
        }),
      );

      const gaugeRewardRates = await Promise.all(
        tokens.map((token, index) => {
          return new Contract(
            gaugeAddresses[index],
            gauge.interface.fragments,
            provider,
          ).rewardRate();
        }),
      );

      const derivedSupplies = await Promise.all(
        tokens.map((token, index) => {
          return new Contract(
            gaugeAddresses[index],
            gauge.interface.fragments,
            provider,
          ).derivedSupply();
        }),
      );

      const totalSupplies = await Promise.all(
        tokens.map((token, index) => {
          return new Contract(
            gaugeAddresses[index],
            gauge.interface.fragments,
            provider,
          ).totalSupply();
        }),
      );

      // extract response and convert to something we can use
      const gauges = tokens.map((token, idx) => {
        return {
          allocPoint:
            +gaugeWeights[idx].toString() / +totalWeight.toString() || 0,
          token: token,
          gaugeAddress: gaugeAddresses[idx],
          gaugeWeight: +gaugeWeights[idx].toString(),
          totalWeight: +totalWeight.toString(),
          rewardRate: +gaugeRewardRates[idx].toString(),
          derivedSupply: +derivedSupplies[idx].toString(),
          totalSupply: +totalSupplies[idx].toString(),
        };
      });

      setGauges(gauges);
    }
  };

  useEffect(() => {
    getGauges();
  }, [blockNum]);

  return { rawGauges: gauges };
};
