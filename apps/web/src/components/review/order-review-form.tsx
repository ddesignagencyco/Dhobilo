'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function OrderReviewForm({ orderId: _orderId }: { orderId: string }) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <Card className="p-6 text-center space-y-3">
        <p className="text-2xl">✓</p>
        <p className="font-semibold">Thank you for your review!</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <div>
        <p className="font-medium mb-3">Rate this order</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((r) => (
            <button
              key={r}
              onClick={() => setRating(r)}
              className={`text-3xl ${r <= rating ? 'opacity-100' : 'opacity-30'}`}
            >
              ⭐
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Additional comments</label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Share your experience..."
          className="mt-2"
          rows={4}
        />
      </div>

      <Button onClick={handleSubmit} className="w-full">
        Submit Review
      </Button>
    </Card>
  );
}
