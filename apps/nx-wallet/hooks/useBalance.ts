import { useEffect, useState } from 'react';
import { balanceService } from '@/services/BalanceService';

export function useBalance(address: string | null) {
  const [balance, setBalance] = useState<string | null>(
    address ? balanceService.getBalance(address) : null
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!address) return;

    // Load initial persisted balance
    const current = balanceService.getBalance(address);
    if (current) {
        setBalance(current);
    }

    // Subscribe to updates
    const unsubscribe = balanceService.addChangeListener(() => {
      const updated = balanceService.getBalance(address);
      setBalance(updated);
    });

    // Initial refresh on mount
    const refresh = async () => {
      // If we don't have a balance, show loading state
      if (!current) setIsLoading(true);
      
      await balanceService.refreshBalance(address);
      
      if (!current) setIsLoading(false);
    };

    refresh();

    return () => {
      unsubscribe();
    };
  }, [address]);

  // Method to manually trigger refresh
  const refresh = async () => {
    if (address) {
        setIsLoading(true);
        await balanceService.refreshBalance(address);
        setIsLoading(false);
    }
  };

  return { balance, isLoading, refresh };
}
