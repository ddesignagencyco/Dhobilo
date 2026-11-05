'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ComplaintForm({ orderId: _orderId }: { orderId: string }) {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const categories = ['Quality Issue', 'Delayed Delivery', 'Wrong Item', 'Damage', 'Other'];

  const handleSubmit = () => {
    if (!category || !description) return;
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <Card className="p-6 text-center space-y-3">
        <p className="text-2xl">✓</p>
        <p className="font-semibold">Complaint registered</p>
        <p className="text-sm text-muted-foreground">We will review this within 24 hours</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <div>
        <label className="text-sm font-medium">Issue Category</label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="mt-2">
            <SelectValue placeholder="Select issue type" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium">Description</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the issue..."
          className="mt-2"
          rows={4}
        />
      </div>

      <Button onClick={handleSubmit} disabled={!category || !description} className="w-full">
        File Complaint
      </Button>
    </Card>
  );
}
