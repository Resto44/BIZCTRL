import React, { memo } from 'react';
import { Card } from '@/components/ui/card';

const KPICardView = function KPICard({ label, value, sublabel, icon: Icon, color = 'text-primary' }) {
  return (
    <Card className="p-4 flex items-start gap-3 bg-card border-border/50 shadow-sm">
      {Icon && (
        <div className={`p-2.5 rounded-xl bg-primary/10 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-bold text-foreground mt-0.5 truncate">{value}</p>
        {sublabel && <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>}
      </div>
    </Card>
  );
};

const KPICard = memo(KPICardView);

export default KPICard;