import * as SecureStore from 'expo-secure-store';

const SEED_PHRASE_KEY = 'user_seed_phrase';
const SAFE_ADDRESS_KEY = 'safe_address';
const NEXOID_MODULE_ADDRESS_KEY = 'nexoid_module_address';
const IDENTITY_REGISTRY_ADDRESS_KEY = 'identity_registry_address';
const ALLOWANCE_MODULE_ADDRESS_KEY = 'allowance_module_address';

export const SecureStorage = {
  async getItem(key: string): Promise<string | null> {
    return await SecureStore.getItemAsync(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  },

  async deleteItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  },

  // Seed phrase
  async saveSeedPhrase(seedPhrase: string) {
    await this.setItem(SEED_PHRASE_KEY, seedPhrase);
  },

  async getSeedPhrase(): Promise<string | null> {
    return await this.getItem(SEED_PHRASE_KEY);
  },

  async deleteSeedPhrase() {
    await this.deleteItem(SEED_PHRASE_KEY);
  },

  async hasWallet(): Promise<boolean> {
    const seed = await this.getSeedPhrase();
    return !!seed;
  },

  // Safe address
  async saveSafeAddress(address: string) {
    await this.setItem(SAFE_ADDRESS_KEY, address);
  },

  async getSafeAddress(): Promise<string | null> {
    return await this.getItem(SAFE_ADDRESS_KEY);
  },

  async deleteSafeAddress() {
    await this.deleteItem(SAFE_ADDRESS_KEY);
  },

  async hasSafeAddress(): Promise<boolean> {
    const address = await this.getSafeAddress();
    return !!address;
  },

  // Nexoid Module address
  async saveNexoidModuleAddress(address: string) {
    await this.setItem(NEXOID_MODULE_ADDRESS_KEY, address);
  },

  async getNexoidModuleAddress(): Promise<string | null> {
    return await this.getItem(NEXOID_MODULE_ADDRESS_KEY);
  },

  async deleteNexoidModuleAddress() {
    await this.deleteItem(NEXOID_MODULE_ADDRESS_KEY);
  },

  // Identity Registry address
  async saveIdentityRegistryAddress(address: string) {
    await this.setItem(IDENTITY_REGISTRY_ADDRESS_KEY, address);
  },

  async getIdentityRegistryAddress(): Promise<string | null> {
    return await this.getItem(IDENTITY_REGISTRY_ADDRESS_KEY);
  },

  async deleteIdentityRegistryAddress() {
    await this.deleteItem(IDENTITY_REGISTRY_ADDRESS_KEY);
  },

  // Allowance Module address
  async saveAllowanceModuleAddress(address: string) {
    await this.setItem(ALLOWANCE_MODULE_ADDRESS_KEY, address);
  },

  async getAllowanceModuleAddress(): Promise<string | null> {
    return await this.getItem(ALLOWANCE_MODULE_ADDRESS_KEY);
  },

  async deleteAllowanceModuleAddress() {
    await this.deleteItem(ALLOWANCE_MODULE_ADDRESS_KEY);
  },
};
