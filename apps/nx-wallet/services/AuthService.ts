/**
 * AuthService -- DEMO STUB
 *
 * No backend exists for the hackathon demo.  This stub keeps the same
 * public API so that callers compile, but every method is a no-op or
 * returns a sensible default.
 */

class AuthServiceClass {
  private address: string | null = null;
  private safeAddress: string | null = null;

  getToken(): string | null {
    return 'demo-token';
  }

  getAddress(): string | null {
    return this.address;
  }

  getSafeAddress(): string | null {
    return this.safeAddress;
  }

  getAuthenticatedAs(): 'eoa' | 'safe' {
    return 'safe';
  }

  isAuthenticated(): boolean {
    return !!this.address;
  }

  async authenticate(address: string, safeAddress?: string): Promise<string> {
    this.address = address.toLowerCase();
    this.safeAddress = safeAddress ? safeAddress.toLowerCase() : null;
    console.log('[AuthService DEMO] authenticate', this.address, this.safeAddress);
    return 'demo-token';
  }

  async loadStoredToken(): Promise<string | null> {
    return null;
  }

  async logout(): Promise<void> {
    this.address = null;
    this.safeAddress = null;
  }

  getAuthHeaders(): Record<string, string> {
    return {};
  }
}

export const authService = new AuthServiceClass();
