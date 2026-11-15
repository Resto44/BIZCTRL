// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const state=vi.hoisted(()=>({user:{role:'driver',permissions:{viewDashboard:true},effective_permissions:{viewDashboard:true}}}));
vi.mock('@/lib/AuthContext',()=>({useAuth:()=>({user:state.user,isLoadingAuth:false})}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({t:x=>x})}));
vi.mock('@/lib/auditLogger',()=>({audit:{securityViolation:vi.fn()}}));
import {RoleProvider} from '@/lib/RoleContext';
import RoleGuard from '@/components/rbac/RoleGuard';
function Screen(){return <RoleProvider><RoleGuard permission="viewReports"><span>private-report</span></RoleGuard></RoleProvider>;}
describe('financial report permissions',()=>{
 it('does not equate a personal dashboard with financial report permission',()=>{
  state.user={role:'driver',permissions:{viewDashboard:true},effective_permissions:{viewDashboard:true}};
  let tree;act(()=>{tree=create(<Screen/>);});
  expect(JSON.stringify(tree.toJSON())).not.toContain('private-report');
  expect(JSON.stringify(tree.toJSON())).toContain('Access Restricted');
  act(()=>tree.unmount());
 });
 it('reacts immediately to server permission revocation with unchanged legacy permissions',()=>{
  const legacy={viewReports:true};state.user={role:'employee',permissions:legacy,effective_permissions:{viewReports:true}};
  let tree;act(()=>{tree=create(<Screen/>);});
  expect(JSON.stringify(tree.toJSON())).toContain('private-report');
  state.user={...state.user,effective_permissions:{viewReports:false}};
  act(()=>tree.update(<Screen/>));
  expect(JSON.stringify(tree.toJSON())).not.toContain('private-report');
  act(()=>tree.unmount());
 });
 it('keeps report authority explicit at every financial dashboard entry point',()=>{
  const app=readFileSync('src/App.jsx','utf8');
  for(const route of ['owner-command-center','dashboard','executive-command-center','ceo-dashboard','branch-command-center','ai-copilot']){
   expect(app).toContain(`path="/${route}" element={<RoleGuard permission="viewReports">`);
  }
  expect(app).toContain('path="/network-hub" element={<RoleGuard permission="viewNetworkAccounts">');
  expect(app).toContain('path="/driver-dashboard" element={<ERPRoleGuard allowedRoles={[\'driver\']}');
 });
});
