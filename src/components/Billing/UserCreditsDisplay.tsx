import React, { useState, useEffect } from 'react';
import { Coins, Plus, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { billingService, UserCredits, CreditTransaction } from '@/services/billing.service';

export const UserCreditsDisplay: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userCredits, setUserCredits] = useState<UserCredits | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<CreditTransaction[]>([]);
  const [showPopover, setShowPopover] = useState(false);

  useEffect(() => {
    loadCredits();
  }, []);

  const loadCredits = async () => {
    try {
      setLoading(true);
      const [creditsData, transactionsData] = await Promise.all([
        billingService.getUserCredits().catch(() => null),
        billingService.getCreditTransactions(5).catch(() => []),
      ]);
      setUserCredits(creditsData);
      setRecentTransactions(transactionsData);
    } catch (error) {
      console.error('Error loading credits:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCredits = (credits: number) => {
    return new Intl.NumberFormat('en-US').format(credits);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'purchase':
      case 'bonus':
        return 'text-green-400';
      case 'usage':
        return 'text-red-400';
      case 'refund':
        return 'text-blue-400';
      default:
        return 'text-white/60';
    }
  };

  const getTransactionSign = (type: string) => {
    return type === 'usage' ? '-' : '+';
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-lg">
        <Loader2 className="h-4 w-4 animate-spin text-white/60" />
      </div>
    );
  }

  if (!userCredits) {
    return (
      <Button
        onClick={() => navigate('/billing/credits')}
        variant="outline"
        size="sm"
        className="border-white/20 text-white hover:bg-white/10"
      >
        <Plus className="h-4 w-4 mr-1" />
        Get Credits
      </Button>
    );
  }

  return (
    <Popover open={showPopover} onOpenChange={setShowPopover}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-white/20 text-white hover:bg-white/10 gap-2"
        >
          <Coins className="h-4 w-4 text-yellow-400" />
          <span className="font-semibold">{formatCredits(userCredits.balance)}</span>
          <Badge
            variant="secondary"
            className={`ml-1 ${
              userCredits.balance < 100
                ? 'bg-red-600/20 text-red-300'
                : 'bg-green-600/20 text-green-300'
            }`}
          >
            {userCredits.balance < 100 ? 'Low' : 'OK'}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 bg-gray-900 border-white/20 text-white">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">Credit Balance</h3>
            <Button
              onClick={() => {
                setShowPopover(false);
                navigate('/billing/credits');
              }}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="h-4 w-4 mr-1" />
              Buy More
            </Button>
          </div>

          {/* Balance */}
          <div className="bg-white/5 rounded-lg p-4 text-center">
            <p className="text-white/60 text-sm mb-1">Available Credits</p>
            <div className="text-3xl font-bold text-white flex items-center justify-center gap-2">
              <Coins className="h-6 w-6 text-yellow-400" />
              {formatCredits(userCredits.balance)}
            </div>
          </div>

          {/* Recent Transactions */}
          {recentTransactions.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-white/80 mb-2">Recent Activity</h4>
              <div className="space-y-2">
                {recentTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between bg-white/5 rounded p-2 text-sm"
                  >
                    <div className="flex-1">
                      <p className="text-white/80 capitalize">{transaction.type}</p>
                      <p className="text-white/40 text-xs">{formatDate(transaction.created_at)}</p>
                    </div>
                    <span className={`font-semibold ${getTransactionColor(transaction.type)}`}>
                      {getTransactionSign(transaction.type)}
                      {formatCredits(Math.abs(transaction.amount))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

