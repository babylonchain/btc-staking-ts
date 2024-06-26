import * as bitcoin from "bitcoinjs-lib";
import DataGenerator from "./dataGenerator";

const testingNetworks = [
  {
    networkName: "mainnet",
    network: bitcoin.networks.bitcoin,
    dataGenerator: new DataGenerator(bitcoin.networks.bitcoin),
  },
  {
    networkName: "testnet",
    network: bitcoin.networks.testnet,
    dataGenerator: new DataGenerator(bitcoin.networks.testnet),
  },
];

export default testingNetworks;