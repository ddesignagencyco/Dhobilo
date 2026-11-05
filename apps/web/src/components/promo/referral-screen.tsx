'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function ReferralScreen() {
  const referralCode = 'CUST12345';
  const referralLink = `https://dhobilo.app/join?ref=${referralCode}`;
  const earnedBonus = 500;
  const referrals = 3;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-200">
        <h3 className="font-semibold mb-4">Share & Earn</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Your Earnings</p>
            <p className="text-2xl font-bold text-green-600">Rs. {earnedBonus}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Referrals</p>
            <p className="text-2xl font-bold">{referrals}</p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <p className="text-sm font-medium mb-3">Your Referral Code</p>
        <div className="flex gap-2 bg-muted p-3 rounded-lg">
          <code className="flex-1 font-mono font-bold">{referralCode}</code>
          <Button size="sm" onClick={handleCopy}>
            Copy
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <p className="text-sm font-medium mb-3">Referral Link</p>
        <div className="flex gap-2 bg-muted p-3 rounded-lg break-all text-xs">
          <span className="flex-1">{referralLink}</span>
          <Button size="sm" onClick={handleCopy}>
            Share
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h4 className="font-semibold mb-4">How it Works</h4>
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">
            <Badge>1</Badge>
            <span>Share your code with friends</span>
          </li>
          <li className="flex gap-3">
            <Badge>2</Badge>
            <span>They sign up and place their first order</span>
          </li>
          <li className="flex gap-3">
            <Badge>3</Badge>
            <span>You earn Rs. 200 per referral</span>
          </li>
        </ol>
      </Card>
    </div>
  );
}
