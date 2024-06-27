import * as bitcoin from "bitcoinjs-lib";
import DataGenerator from "./dataGenerator";

interface NetworkConfig {
  networkName: string;
  network: bitcoin.Network;
  dataGenerator: DataGenerator;
}

const createNetworkConfig = (networkName: string, network: bitcoin.Network): NetworkConfig => ({
  networkName,
  network,
  dataGenerator: new DataGenerator(network),
});

const testingNetworks: NetworkConfig[] = [
  createNetworkConfig("mainnet", bitcoin.networks.bitcoin),
  createNetworkConfig("testnet", bitcoin.networks.testnet),
];

export default testingNetworks;