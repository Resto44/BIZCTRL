#!/usr/bin/env python3
import json
import os
import re
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'src' / 'lib' / 'localizedPhrases.js'
PHRASES = [
  'Enterprise ERP', 'Features', 'Industries', 'Testimonials', 'Sign In', 'Create Organization',
  'The All-in-One Business ERP Platform', 'Run Your Entire Business', 'From One Platform',
  'BizCTRL is a multi-tenant ERP SaaS built for restaurants, retail stores, pharmacies, warehouses, factories, and more. Manage inventory, sales, purchasing, HR, finance, and suppliers — all in one place.',
  'Staff sign in', 'No credit card required', 'Free 14-day trial', 'Cancel anytime', 'GDPR compliant',
  'Built for Every Industry', 'Whether you run a restaurant, pharmacy, or factory — BizCTRL adapts to your business type with tailored modules and workflows.',
  'Restaurant', 'Retail', 'Warehouse', 'Factory', 'Pharmacy', 'Clinic', 'Wholesale', 'Services', 'Café',
  'Enterprise Features', 'Everything You Need to Run Your Business',
  'From inventory to payroll, from supplier management to AI analytics — BizCTRL covers every aspect of your operations.',
  'Unified Owner Dashboard', 'Real-time KPIs, operating results, branch comparisons, and AI-powered insights — all in one command center.',
  'Role-Based Access Control', 'Owner, Manager, Employee, and Supplier access is protected by tailored dashboards and granular permissions.',
  'Supplier Management', 'Owner-issued supplier invitations, purchase orders, invoices, and outstanding balance tracking.',
  'Smart Inventory', 'Multi-branch inventory, batch/lot tracking, expiry alerts, serial numbers, and automatic reorder points.',
  'Sales & POS', 'Cash register, invoicing, customer debts, loyalty programs, and multi-channel sales analytics.',
  'Finance & Treasury', 'Profit & Loss, cash flow, payroll, expense tracking, network settlement, and multi-currency support.',
  'BI & Analytics', 'Advanced reports, scheduled exports, AI business copilot, and predictive inventory forecasting.',
  'Multi-Tenant & Secure', 'Each business is fully isolated. Row-level security, audit logs, and role-based data access.',
  'Role-Based Access', 'The Right Access for Every Team Member',
  'BizCTRL gives each role a dedicated, purpose-built experience. Owners see everything; employees see only what they need.',
  'Owner', 'Manager', 'Employee', 'Supplier',
  'Full command center with KPIs, P&L, and approvals', 'Branch operations, staff, inventory, and sales',
  'Attendance, tasks, payslips, and shift schedule', 'Purchase orders, invoices, payments, and balance',
  'Trusted by Business Owners', 'Join thousands of businesses already running on BizCTRL.',
  'Owner, Al-Nakheel Restaurant Group', 'Manager, Bloom Pharmacy Chain', 'Director, FastTrack Wholesale',
  'BizCTRL transformed how we manage 6 branches. The owner dashboard gives me everything I need in seconds.',
  'The inventory expiry tracking and supplier approval system saved us countless hours every week.',
  'Finally an ERP that works for wholesale. The purchase order and supplier portal features are outstanding.',
  'Ready to Transform Your Business?', 'Start your free 14-day trial today. No credit card required. Set up in minutes.',
  'ERP Sign In', '© 2026 BizCTRL. All rights reserved.',
]


def read_catalog():
    source = TARGET.read_text()
    match = re.search(r'export const localizedPhrases = (.*);\n\nexport default', source, re.S)
    if not match:
        raise RuntimeError('Could not parse centralized phrase catalog.')
    return json.loads(match.group(1))


def main():
    catalog = read_catalog()
    pending = [phrase for phrase in PHRASES if phrase not in catalog]
    if not pending:
        print('All landing phrases already exist in the central catalog.')
        return
    schema = {'type': 'json_schema', 'json_schema': {'name': 'landing_phrase_translations', 'strict': True, 'schema': {'type': 'object', 'properties': {'translations': {'type': 'array', 'items': {'type': 'object', 'properties': {'phrase': {'type': 'string'}, 'fa': {'type': 'string'}, 'ar': {'type': 'string'}}, 'required': ['phrase', 'fa', 'ar'], 'additionalProperties': False}}}, 'required': ['translations'], 'additionalProperties': False}}}
    prompt = 'Translate each supplied ERP landing-page UI phrase into professional Persian (fa) and Modern Standard Arabic (ar). Keep BizCTRL, ERP, KPI, P&L, POS, GDPR, personal names, company names, numbers, and abbreviations unchanged. Return every phrase exactly once as strict JSON.'
    response = requests.post(f"{os.environ['OPENAI_API_BASE'].rstrip('/')}/chat/completions", headers={'Authorization': f"Bearer {os.environ['OPENAI_API_KEY']}", 'Content-Type': 'application/json'}, json={'model': 'gpt-5-mini', 'messages': [{'role': 'system', 'content': 'Output strict JSON only.'}, {'role': 'user', 'content': prompt + '\n\n' + json.dumps(pending, ensure_ascii=False)}], 'response_format': schema, 'max_completion_tokens': 16000}, timeout=120)
    response.raise_for_status()
    results = json.loads(response.json()['choices'][0]['message']['content'])['translations']
    returned = {item['phrase']: {'fa': item['fa'], 'ar': item['ar']} for item in results}
    if set(returned) != set(pending) or any(not item['fa'].strip() or not item['ar'].strip() for item in returned.values()):
        raise RuntimeError('Landing translation response failed completeness validation.')
    catalog.update(returned)
    TARGET.write_text('/**\n * Centrally managed translations for audited ERP interface phrases.\n * Source phrases remain stable lookup keys; database IDs and business values are never modified.\n */\nexport const localizedPhrases = ' + json.dumps(catalog, ensure_ascii=False, indent=2) + ';\n\nexport default localizedPhrases;\n')
    print(f'Added {len(returned)} landing phrases to {TARGET}.')


if __name__ == '__main__':
    main()
