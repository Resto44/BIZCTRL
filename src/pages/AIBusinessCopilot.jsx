import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Bot, Send, Sparkles, TrendingUp, AlertTriangle, Lightbulb,
  BarChart3, DollarSign, Package, Users, Zap, ChevronRight,
  RefreshCw, Star, Target, Brain
} from 'lucide-react';
import { format, subDays } from 'date-fns';

const QUICK_PROMPTS = [
  { label: 'How is my business doing this month?', icon: TrendingUp },
  { label: 'What are my top selling items?', icon: Star },
  { label: 'Which branch is most profitable?', icon: Target },
  { label: 'What should I restock?', icon: Package },
  { label: 'Who owes me the most?', icon: DollarSign },
  { label: 'How can I reduce costs?', icon: Zap },
];

function ChatMessage({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-white" />
        </div>
      )}
      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
        isUser
          ? 'bg-primary text-white rounded-tr-sm'
          : 'bg-muted text-foreground rounded-tl-sm'
      }`}>
        {message.content}
        {message.insights && (
          <div className="mt-2 space-y-1.5">
            {message.insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-1.5 bg-background/20 rounded-lg p-2">
                <insight.icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span className="text-xs">{insight.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InsightCard({ title, value, description, icon: Icon, color = 'blue', trend }) {
  const colorMap = {
    blue:   'bg-blue-50 border-blue-100 text-blue-700',
    green:  'bg-emerald-50 border-emerald-100 text-emerald-700',
    amber:  'bg-amber-50 border-amber-100 text-amber-700',
    red:    'bg-red-50 border-red-100 text-red-700',
    purple: 'bg-purple-50 border-purple-100 text-purple-700',
  };
  return (
    <Card className={`border ${colorMap[color]?.split(' ')[1]}`}>
      <CardContent className="p-3">
        <div className={`w-8 h-8 rounded-lg ${colorMap[color]?.split(' ')[0]} flex items-center justify-center mb-2`}>
          <Icon className={`w-4 h-4 ${colorMap[color]?.split(' ')[2]}`} />
        </div>
        <p className={`text-base font-bold ${colorMap[color]?.split(' ')[2]}`}>{value}</p>
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function AIBusinessCopilot() {
  const { t, currency, lang } = useLanguage();
  const { ownerFilter } = useTenant();
  const [tab, setTab] = useState('insights');
  const [messages, setMessages] = useState([
    {
      id: '1',
      role: 'assistant',
      content: `Hello! I'm your AI Business Copilot. I can analyze your restaurant data and provide actionable insights. What would you like to know about your business today?`,
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const today = format(new Date(), 'yyyy-MM-dd');
  const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd');

  const { data: allSales = [] } = useQuery({
    queryKey: ['ai_sales', ownerFilter],
    queryFn: () => base44.entities.DailySales.filter(ownerFilter || {}, '-date', 500),
    staleTime: 120000,
    enabled: !!ownerFilter?.created_by,
  });
  const { data: allPurchases = [] } = useQuery({
    queryKey: ['ai_purchases', ownerFilter],
    queryFn: () => base44.entities.Purchase.filter(ownerFilter || {}, '-date', 200),
    staleTime: 120000,
    enabled: !!ownerFilter?.created_by,
  });
  const { data: allExpenses = [] } = useQuery({
    queryKey: ['ai_expenses', ownerFilter],
    queryFn: () => base44.entities.Expense.filter(ownerFilter || {}, '-date', 200),
    staleTime: 120000,
    enabled: !!ownerFilter?.created_by,
  });
  const { data: inventory = [] } = useQuery({
    queryKey: ['ai_inventory', ownerFilter],
    queryFn: () => base44.entities.Inventory.filter(ownerFilter || {}),
    staleTime: 300000,
    enabled: !!ownerFilter?.created_by,
  });

  const insights = useMemo(() => {
    const monthSales = allSales.filter(s => s.date >= monthStart);
    const monthPurchases = allPurchases.filter(p => p.date >= monthStart);
    const monthExpenses = allExpenses.filter(e => e.date >= monthStart);
    const revenue = monthSales.reduce((s, r) => s + (r.total_sales || 0), 0);
    const cost = monthPurchases.reduce((s, r) => s + (r.total_amount || 0), 0);
    const expTotal = monthExpenses.reduce((s, r) => s + (r.amount || 0), 0);
    const profit = revenue - cost - expTotal;
    const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;
    const lowStock = inventory.filter(i => i.quantity <= (i.low_stock_threshold || 0)).length;
    const cashSales = monthSales.reduce((s, r) => s + (r.cash || 0), 0);
    const creditSales = monthSales.reduce((s, r) => s + (r.credit || 0), 0);
    const collectionRate = (cashSales + creditSales) > 0 ? ((cashSales / (cashSales + creditSales)) * 100).toFixed(0) : 0;

    return { revenue, profit, margin, lowStock, collectionRate, cost, expTotal };
  }, [allSales, allPurchases, allExpenses, inventory, monthStart]);

  const fmt = (n) => `${currency}${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  // Generate AI response based on user input
  const generateResponse = (userMessage) => {
    const msg = userMessage.toLowerCase();
    const { revenue, profit, margin, lowStock, collectionRate, cost, expTotal } = insights;

    if (msg.includes('doing') || msg.includes('month') || msg.includes('business')) {
      return {
        content: `Here's your business summary for this month:`,
        insights: [
          { icon: TrendingUp, text: `Revenue: ${fmt(revenue)} — ${revenue > 0 ? 'Keep up the momentum!' : 'No sales recorded yet.'}` },
          { icon: DollarSign, text: `Net Profit: ${fmt(profit)} (${margin}% margin)${parseFloat(margin) < 30 ? ' — Consider reducing costs.' : ''}` },
          { icon: Package, text: lowStock > 0 ? `⚠️ ${lowStock} items need restocking` : '✅ Inventory levels are healthy' },
          { icon: Target, text: `Cash collection rate: ${collectionRate}%${collectionRate < 70 ? ' — Follow up on outstanding debts.' : ''}` },
        ]
      };
    }
    if (msg.includes('restock') || msg.includes('inventory') || msg.includes('stock')) {
      return {
        content: lowStock > 0
          ? `You have ${lowStock} items that need restocking. I recommend placing purchase orders for these items immediately to avoid stockouts.`
          : `Your inventory levels look healthy! All items are above their minimum thresholds.`,
        insights: []
      };
    }
    if (msg.includes('cost') || msg.includes('reduce') || msg.includes('expense')) {
      return {
        content: `Here are my cost reduction recommendations:`,
        insights: [
          { icon: Package, text: `Purchase costs: ${fmt(cost)} — Review supplier prices quarterly` },
          { icon: Zap, text: `Expenses: ${fmt(expTotal)} — Audit recurring expenses for savings` },
          { icon: AlertTriangle, text: `Food waste tracking can reduce costs by 5-15%` },
          { icon: Lightbulb, text: `Consider bulk purchasing for high-turnover items` },
        ]
      };
    }
    if (msg.includes('profit') || msg.includes('margin')) {
      return {
        content: `Your profit analysis for this month:`,
        insights: [
          { icon: DollarSign, text: `Gross Profit: ${fmt(profit)}` },
          { icon: BarChart3, text: `Profit Margin: ${margin}%${parseFloat(margin) < 30 ? ' (Below target of 30%)' : ' (Good!)'}` },
          { icon: Lightbulb, text: parseFloat(margin) < 30 ? 'Consider reviewing menu pricing and reducing food costs.' : 'Maintain current pricing strategy.' },
        ]
      };
    }
    return {
      content: `I understand you're asking about "${userMessage}". Based on your current data, I recommend reviewing your sales trends and inventory levels. Would you like me to provide a more specific analysis?`,
      insights: []
    };
  };

  const handleSend = async (text = input) => {
    if (!text.trim()) return;
    const userMsg = { id: Date.now().toString(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));

    const response = generateResponse(text);
    const aiMsg = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      ...response,
    };
    setMessages(prev => [...prev, aiMsg]);
    setIsTyping(false);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-2 pt-1">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{t('ai_copilot')}</h1>
          <p className="text-xs text-muted-foreground">Powered by AI · Always learning</p>
        </div>
        <Badge className="ml-auto bg-emerald-500 text-white text-[10px]">Live</Badge>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-3 h-9">
          <TabsTrigger value="insights" className="text-xs">{t('ai_insights')}</TabsTrigger>
          <TabsTrigger value="chat" className="text-xs">{t('ai_chat')}</TabsTrigger>
          <TabsTrigger value="recommendations" className="text-xs">Recommendations</TabsTrigger>
        </TabsList>

        {/* Insights Tab */}
        <TabsContent value="insights" className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <InsightCard
              title="Monthly Revenue"
              value={fmt(insights.revenue)}
              description={insights.revenue > 0 ? 'On track' : 'No data yet'}
              icon={TrendingUp}
              color="blue"
            />
            <InsightCard
              title="Net Profit"
              value={fmt(insights.profit)}
              description={`${insights.margin}% margin`}
              icon={DollarSign}
              color={parseFloat(insights.margin) >= 30 ? 'green' : 'amber'}
            />
            <InsightCard
              title="Low Stock Items"
              value={insights.lowStock}
              description={insights.lowStock > 0 ? 'Need restocking' : 'All good'}
              icon={Package}
              color={insights.lowStock > 0 ? 'red' : 'green'}
            />
            <InsightCard
              title="Collection Rate"
              value={`${insights.collectionRate}%`}
              description="Cash vs credit"
              icon={Target}
              color={parseInt(insights.collectionRate) >= 70 ? 'green' : 'amber'}
            />
          </div>

          {/* AI Recommendations */}
          <Card className="bg-gradient-to-br from-primary/5 to-purple-500/5 border-primary/20">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                AI Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {[
                insights.lowStock > 0 && { icon: Package, text: `Restock ${insights.lowStock} low-inventory items to avoid stockouts`, type: 'warning' },
                parseFloat(insights.margin) < 30 && { icon: TrendingUp, text: 'Profit margin is below 30% — review menu pricing', type: 'warning' },
                parseInt(insights.collectionRate) < 70 && { icon: DollarSign, text: 'Collection rate is low — follow up on outstanding debts', type: 'info' },
                { icon: Lightbulb, text: 'Track food waste daily to reduce costs by up to 15%', type: 'tip' },
                { icon: BarChart3, text: 'Review branch performance weekly for optimization opportunities', type: 'tip' },
              ].filter(Boolean).slice(0, 4).map((rec, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 bg-background rounded-xl">
                  <rec.icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-foreground">{rec.text}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chat Tab */}
        <TabsContent value="chat" className="mt-3">
          <div className="flex flex-col" style={{ height: 'calc(100vh - 320px)', minHeight: 300 }}>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 pb-3">
              {messages.map(msg => <ChatMessage key={msg.id} message={msg} />)}
              {isTyping && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick prompts */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p.label}
                  onClick={() => handleSend(p.label)}
                  className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-muted rounded-full text-xs text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                  <p.icon className="w-3 h-3" />
                  {p.label}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Ask about your business..."
                className="h-10 text-sm"
              />
              <Button onClick={() => handleSend()} disabled={!input.trim() || isTyping} className="h-10 w-10 p-0 shrink-0">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations" className="mt-3 space-y-3">
          {[
            {
              category: 'Revenue Growth',
              icon: TrendingUp,
              color: 'blue',
              items: [
                'Introduce combo meals to increase average order value',
                'Launch a loyalty program to retain customers',
                'Enable online ordering to capture delivery revenue',
              ]
            },
            {
              category: 'Cost Reduction',
              icon: DollarSign,
              color: 'green',
              items: [
                'Negotiate bulk purchase discounts with suppliers',
                'Implement daily waste tracking to reduce food waste',
                'Review and optimize staff scheduling',
              ]
            },
            {
              category: 'Operations',
              icon: Zap,
              color: 'amber',
              items: [
                'Set up automated low-stock alerts',
                'Review order turnaround time with branch managers',
                'Implement daily cash reconciliation',
              ]
            },
          ].map(section => (
            <Card key={section.category}>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <section.icon className={`w-4 h-4 text-${section.color}-600`} />
                  {section.category}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-2">
                {section.items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 py-1">
                    <div className={`w-1.5 h-1.5 rounded-full bg-${section.color}-500 mt-1.5 shrink-0`} />
                    <p className="text-sm text-muted-foreground">{item}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
