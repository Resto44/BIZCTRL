import React, { useState, useMemo } from 'react';
import { useNotifications } from '@/lib/NotificationContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { Bell, CheckCheck, Search, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import NotificationList from '@/components/notifications/NotificationList';
import LiveOperationsCenter from '@/components/notifications/LiveOperationsCenter';
import SoundSettings from '@/components/notifications/SoundSettings';
import OwnerPushSettings from '@/components/notifications/OwnerPushSettings';

export default function NotificationCenter() {
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const { t } = useLanguage();
  const { branches } = useTenant();
  const [search, setSearch] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterRead, setFilterRead] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');

  const filtered = useMemo(() => {
    return notifications.filter(n => {
      if (filterSeverity !== 'all' && n.severity !== filterSeverity) return false;
      if (filterRead === 'unread' && n.is_read) return false;
      if (filterRead === 'read' && !n.is_read) return false;
      if (filterBranch !== 'all' && n.branch !== filterBranch) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!n.title?.toLowerCase().includes(q) && !n.message?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [notifications, filterSeverity, filterRead, filterBranch, search]);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">{t('notifications') || 'Notifications'}</h1>
          {unreadCount > 0 && (
            <Badge className="bg-red-500 text-white">{unreadCount}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SoundSettings />
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="w-4 h-4 mr-1" />
              {t('mark_all_read') || 'Mark all read'}
            </Button>
          )}
        </div>
      </div>

      <OwnerPushSettings />

      <Tabs defaultValue="history">
        <TabsList className="w-full">
          <TabsTrigger value="history" className="flex-1 gap-1.5">
            <Bell className="w-3.5 h-3.5" />
            {t('notifications') || 'History'}
          </TabsTrigger>
          <TabsTrigger value="live" className="flex-1 gap-1.5">
            <Radio className="w-3.5 h-3.5 text-red-500" />
            Live Operations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-3 mt-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[140px]">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder={t('search') || 'Search...'}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterRead} onValueChange={setFilterRead}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                <SelectItem value="unread">{t('unread') || 'Unread'}</SelectItem>
                <SelectItem value="read">{t('read') || 'Read'}</SelectItem>
              </SelectContent>
            </Select>
            {branches.length > 0 && (
              <Select value={filterBranch} onValueChange={setFilterBranch}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('all_branches') || 'All Branches'}</SelectItem>
                  {branches.map(b => <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          <NotificationList notifications={filtered} />
        </TabsContent>

        <TabsContent value="live" className="mt-3">
          <LiveOperationsCenter />
        </TabsContent>
      </Tabs>
    </div>
  );
}