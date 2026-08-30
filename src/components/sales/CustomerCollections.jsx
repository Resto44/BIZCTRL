/**
 * CustomerCollections — DEPRECATED
 * 
 * This component has been merged into the unified Debt Management module.
 * Redirects to /debt-management.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreditCard, ArrowRight } from 'lucide-react';

export default function CustomerCollections({ branch, date }) {
  const navigate = useNavigate();

  return (
    <Card className="border-purple-200 bg-purple-50">
      <CardContent className="p-4 text-center space-y-3">
        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center mx-auto">
          <CreditCard className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <div className="font-semibold text-sm text-purple-800">Customer Collections</div>
          <div className="text-xs text-purple-600 mt-1">
            Moved to Debt Management module
          </div>
        </div>
        <Button
          size="sm"
          className="bg-purple-600 hover:bg-purple-700 text-white"
          onClick={() => navigate('/debt-management')}
        >
          Go to Debt Management <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}
