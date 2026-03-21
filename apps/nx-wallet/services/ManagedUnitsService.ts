import { SecureStorage } from './SecureStorage';

const MANAGED_UNITS_KEY = 'managed_units_storage_key';

export interface ManagedUnit {
  address: string;
  name: string;
  notes: string;
  avatarUrl?: string; // Optional emoji/icon
  createdAt: string; // ISO-8601
}

export const ManagedUnitsService = {
  /**
   * Normalize and validate EVM address
   * Throws error if invalid
   */
  validateAddress(address: string): string {
    const normalized = address.toLowerCase().trim();
    if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
      throw new Error(`Invalid EVM address: ${address}`);
    }
    return normalized;
  },

  /**
   * Get all managed units
   */
  async getAll(): Promise<ManagedUnit[]> {
    const json = await SecureStorage.getItem(MANAGED_UNITS_KEY);
    if (!json) return [];
    try {
      return JSON.parse(json) as ManagedUnit[];
    } catch (e) {
      console.error('Failed to parse managed units', e);
      return [];
    }
  },

  /**
   * Add a new managed unit
   * Throws error if address already exists
   */
  async add(unit: ManagedUnit): Promise<void> {
    const normalizedAddress = this.validateAddress(unit.address);
    const newUnit = { ...unit, address: normalizedAddress };
    
    const units = await this.getAll();
    if (units.some(u => u.address === normalizedAddress)) {
      throw new Error(`Unit with address ${normalizedAddress} already exists`);
    }

    units.push(newUnit);
    await SecureStorage.setItem(MANAGED_UNITS_KEY, JSON.stringify(units));
  },

  /**
   * Remove a managed unit by address
   */
  async remove(address: string): Promise<void> {
    const normalizedAddress = this.validateAddress(address);
    const units = await this.getAll();
    const filtered = units.filter(u => u.address !== normalizedAddress);
    await SecureStorage.setItem(MANAGED_UNITS_KEY, JSON.stringify(filtered));
  },

  /**
   * Clear all managed units
   */
  async clear(): Promise<void> {
    await SecureStorage.deleteItem(MANAGED_UNITS_KEY);
  },

  /**
   * Check if a unit exists by address
   */
  async has(address: string): Promise<boolean> {
    try {
      const normalizedAddress = this.validateAddress(address);
      const units = await this.getAll();
      return units.some(u => u.address === normalizedAddress);
    } catch {
      return false;
    }
  }
};
