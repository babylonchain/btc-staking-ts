import { networks, address as addressChecker } from "bitcoinjs-lib";

/**
 * Check whether the given address is a valid Bitcoin address.
 *
 * @param {string} address - The Bitcoin address to check.
 * @param {object} network - The Bitcoin network (e.g., bitcoin.networks.bitcoin).
 * @returns {boolean} - True if the address is valid, otherwise false.
 */
export const isValidBitcoinAddress = (address: string, network: networks.Network): boolean => {
    try {
        addressChecker.toOutputScript(address, network);
      return true;
    } catch (error) {
      return false;
    }
  }
  