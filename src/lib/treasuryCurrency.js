import {formatLocalizedCurrency} from './localization';

/**
 * Old BizCTRL records sometimes store "$", "SR", or "ر.س" as a display
 * *symbol* rather than an ISO currency code. An ambiguous symbol is not USD.
 * Never change stored values or silently exchange-convert them.
 */
const AMBIGUOUS_SYMBOLS=new Set(['﷼']);
const SAUDI_RIYAL_ALIASES=new Set(['SR','S.R','ر.س','ر.س.','SAR.']);
const LEGACY_SYMBOLS=new Set([...AMBIGUOUS_SYMBOLS,...SAUDI_RIYAL_ALIASES]);
export function isUnverifiedTreasuryCurrency(value){
 const raw=String(value??'').trim();
 return AMBIGUOUS_SYMBOLS.has(raw)||(raw.length===1&&raw.charCodeAt(0)===36);
}
export function normalizeTreasuryCurrency(value,fallback='SAR'){
 const raw=String(value??'').trim();
 if(SAUDI_RIYAL_ALIASES.has(raw))return 'SAR';
 if(!raw||isUnverifiedTreasuryCurrency(raw))return String(fallback||'SAR').trim().toUpperCase();
 const code=raw.toUpperCase();
 if(/^[A-Z]{3}$/.test(code)){
  try{new Intl.NumberFormat('en-US',{style:'currency',currency:code});return code;}
  catch{/* not recognized */}
 }
 return String(fallback||'SAR').trim().toUpperCase();
}
export function resolveTreasuryCurrency({
 appCurrency='SAR',accountCurrency=null,restaurantCurrency=null,financeCurrency=null,
}={}){
 const selected=normalizeTreasuryCurrency(appCurrency);
 // Finance base is a separately configured accounting unit; if none is known,
 // fall back to an explicit ISO restaurant currency, then personal preference.
 const base=normalizeTreasuryCurrency(financeCurrency,
   normalizeTreasuryCurrency(restaurantCurrency,selected));
 const actual=normalizeTreasuryCurrency(accountCurrency,base);
 return {
  selected,base,code:actual,
  differsFromPreference:actual!==selected,
  legacySymbol:Boolean(accountCurrency)&&LEGACY_SYMBOLS.has(String(accountCurrency).trim()),
 };
}
export function formatTreasuryCurrency(value,{
 appCurrency='SAR',accountCurrency=null,restaurantCurrency=null,
 financeCurrency=null,lang='en',options={},
}={}){
 if(value===null||value===undefined||!Number.isFinite(Number(value)))return '—';
 const {code}=resolveTreasuryCurrency({
  appCurrency,accountCurrency,restaurantCurrency,financeCurrency,
 });
 return formatLocalizedCurrency(Number(value),lang,code,{
  currencyDisplay:'code',maximumFractionDigits:2,...options,
 });
}
export function treasuryCurrencyWarning({
 appCurrency='SAR',accountCurrency=null,restaurantCurrency=null,
 financeCurrency=null,lang='en',
}={}){
 const {selected,code,differsFromPreference}=resolveTreasuryCurrency({
  appCurrency,accountCurrency,restaurantCurrency,financeCurrency,
 });
 if(!differsFromPreference)return '';
 if(lang==='ar')return `عملة العرض المختارة ${selected}، لكن المبلغ مسجل بـ ${code}. لم يتم تحويل العملة.`;
 if(lang==='fa')return `ارز نمایشی انتخاب‌شده ${selected} است، اما این مبلغ با ${code} ثبت شده و تبدیل نشده است.`;
 return `Selected display currency is ${selected}, but this amount is booked in ${code}. No exchange conversion was performed.`;
}
,'﷼']);
const SAUDI_RIYAL_ALIASES=new Set(['ر.س','ر.س.','SR','S.R','SAR.']);
const LEGACY_SYMBOLS=new Set([...AMBIGUOUS_SYMBOLS,...SAUDI_RIYAL_ALIASES]);
export function isUnverifiedTreasuryCurrency(value){
 return AMBIGUOUS_SYMBOLS.has(String(value??'').trim());
}
export function normalizeTreasuryCurrency(value,fallback='SAR'){
 const raw=String(value??'').trim();
 if(!raw||LEGACY_SYMBOLS.has(raw))return String(fallback||'SAR').trim().toUpperCase();
 const code=raw.toUpperCase();
 if(/^[A-Z]{3}$/.test(code)){
  try{new Intl.NumberFormat('en-US',{style:'currency',currency:code});return code;}
  catch{/* not recognized */}
 }
 return String(fallback||'SAR').trim().toUpperCase();
}
export function resolveTreasuryCurrency({
 appCurrency='SAR',accountCurrency=null,restaurantCurrency=null,financeCurrency=null,
}={}){
 const selected=normalizeTreasuryCurrency(appCurrency);
 // Finance base is a separately configured accounting unit; if none is known,
 // fall back to an explicit ISO restaurant currency, then personal preference.
 const base=normalizeTreasuryCurrency(financeCurrency,
   normalizeTreasuryCurrency(restaurantCurrency,selected));
 const actual=normalizeTreasuryCurrency(accountCurrency,base);
 return {
  selected,base,code:actual,
  differsFromPreference:actual!==selected,
  legacySymbol:Boolean(accountCurrency)&&LEGACY_SYMBOLS.has(String(accountCurrency).trim()),
 };
}
export function formatTreasuryCurrency(value,{
 appCurrency='SAR',accountCurrency=null,restaurantCurrency=null,
 financeCurrency=null,lang='en',options={},
}={}){
 if(value===null||value===undefined||!Number.isFinite(Number(value)))return '—';
 const {code}=resolveTreasuryCurrency({
  appCurrency,accountCurrency,restaurantCurrency,financeCurrency,
 });
 return formatLocalizedCurrency(Number(value),lang,code,{
  currencyDisplay:'code',maximumFractionDigits:2,...options,
 });
}
export function treasuryCurrencyWarning({
 appCurrency='SAR',accountCurrency=null,restaurantCurrency=null,
 financeCurrency=null,lang='en',
}={}){
 const {selected,code,differsFromPreference}=resolveTreasuryCurrency({
  appCurrency,accountCurrency,restaurantCurrency,financeCurrency,
 });
 if(!differsFromPreference)return '';
 if(lang==='ar')return `عملة العرض المختارة ${selected}، لكن المبلغ مسجل بـ ${code}. لم يتم تحويل العملة.`;
 if(lang==='fa')return `ارز نمایشی انتخاب‌شده ${selected} است، اما این مبلغ با ${code} ثبت شده و تبدیل نشده است.`;
 return `Selected display currency is ${selected}, but this amount is booked in ${code}. No exchange conversion was performed.`;
}
,'﷼']);
const SAUDI_RIYAL_ALIASES=new Set(['SR','S.R','ر.س','ر.س.','SAR.']);
const LEGACY_SYMBOLS=new Set([...AMBIGUOUS_SYMBOLS,...SAUDI_RIYAL_ALIASES]);
export function isUnverifiedTreasuryCurrency(value){return AMBIGUOUS_SYMBOLS.has(String(value??'').trim());}

export function normalizeTreasuryCurrency(value,fallback='SAR'){
 const raw=String(value??'').trim();
 if(SAUDI_RIYAL_ALIASES.has(raw))return 'SAR';
 if(!raw||AMBIGUOUS_SYMBOLS.has(raw))return String(fallback||'SAR').trim().toUpperCase();
 const code=raw.toUpperCase();
 if(/^[A-Z]{3}$/.test(code)){
  try{new Intl.NumberFormat('en-US',{style:'currency',currency:code});return code;}
  catch{/* not recognized */}
 }
 return String(fallback||'SAR').trim().toUpperCase();
}
export function resolveTreasuryCurrency({
 appCurrency='SAR',accountCurrency=null,restaurantCurrency=null,financeCurrency=null,
}={}){
 const selected=normalizeTreasuryCurrency(appCurrency);
 // Finance base is a separately configured accounting unit; if none is known,
 // fall back to an explicit ISO restaurant currency, then personal preference.
 const base=normalizeTreasuryCurrency(financeCurrency,
   normalizeTreasuryCurrency(restaurantCurrency,selected));
 const actual=normalizeTreasuryCurrency(accountCurrency,base);
 return {
  selected,base,code:actual,
  differsFromPreference:actual!==selected,
  legacySymbol:Boolean(accountCurrency)&&LEGACY_SYMBOLS.has(String(accountCurrency).trim()),
 };
}
export function formatTreasuryCurrency(value,{
 appCurrency='SAR',accountCurrency=null,restaurantCurrency=null,
 financeCurrency=null,lang='en',options={},
}={}){
 if(value===null||value===undefined||!Number.isFinite(Number(value)))return '—';
 const {code}=resolveTreasuryCurrency({
  appCurrency,accountCurrency,restaurantCurrency,financeCurrency,
 });
 return formatLocalizedCurrency(Number(value),lang,code,{
  currencyDisplay:'code',maximumFractionDigits:2,...options,
 });
}
export function treasuryCurrencyWarning({
 appCurrency='SAR',accountCurrency=null,restaurantCurrency=null,
 financeCurrency=null,lang='en',
}={}){
 const {selected,code,differsFromPreference}=resolveTreasuryCurrency({
  appCurrency,accountCurrency,restaurantCurrency,financeCurrency,
 });
 if(!differsFromPreference)return '';
 if(lang==='ar')return `عملة العرض المختارة ${selected}، لكن المبلغ مسجل بـ ${code}. لم يتم تحويل العملة.`;
 if(lang==='fa')return `ارز نمایشی انتخاب‌شده ${selected} است، اما این مبلغ با ${code} ثبت شده و تبدیل نشده است.`;
 return `Selected display currency is ${selected}, but this amount is booked in ${code}. No exchange conversion was performed.`;
}
,'﷼']);
const SAUDI_RIYAL_ALIASES=new Set(['ر.س','ر.س.','SR','S.R','SAR.']);
const LEGACY_SYMBOLS=new Set([...AMBIGUOUS_SYMBOLS,...SAUDI_RIYAL_ALIASES]);
export function isUnverifiedTreasuryCurrency(value){
 return AMBIGUOUS_SYMBOLS.has(String(value??'').trim());
}
export function normalizeTreasuryCurrency(value,fallback='SAR'){
 const raw=String(value??'').trim();
 if(!raw||LEGACY_SYMBOLS.has(raw))return String(fallback||'SAR').trim().toUpperCase();
 const code=raw.toUpperCase();
 if(/^[A-Z]{3}$/.test(code)){
  try{new Intl.NumberFormat('en-US',{style:'currency',currency:code});return code;}
  catch{/* not recognized */}
 }
 return String(fallback||'SAR').trim().toUpperCase();
}
export function resolveTreasuryCurrency({
 appCurrency='SAR',accountCurrency=null,restaurantCurrency=null,financeCurrency=null,
}={}){
 const selected=normalizeTreasuryCurrency(appCurrency);
 // Finance base is a separately configured accounting unit; if none is known,
 // fall back to an explicit ISO restaurant currency, then personal preference.
 const base=normalizeTreasuryCurrency(financeCurrency,
   normalizeTreasuryCurrency(restaurantCurrency,selected));
 const actual=normalizeTreasuryCurrency(accountCurrency,base);
 return {
  selected,base,code:actual,
  differsFromPreference:actual!==selected,
  legacySymbol:Boolean(accountCurrency)&&LEGACY_SYMBOLS.has(String(accountCurrency).trim()),
 };
}
export function formatTreasuryCurrency(value,{
 appCurrency='SAR',accountCurrency=null,restaurantCurrency=null,
 financeCurrency=null,lang='en',options={},
}={}){
 if(value===null||value===undefined||!Number.isFinite(Number(value)))return '—';
 const {code}=resolveTreasuryCurrency({
  appCurrency,accountCurrency,restaurantCurrency,financeCurrency,
 });
 return formatLocalizedCurrency(Number(value),lang,code,{
  currencyDisplay:'code',maximumFractionDigits:2,...options,
 });
}
export function treasuryCurrencyWarning({
 appCurrency='SAR',accountCurrency=null,restaurantCurrency=null,
 financeCurrency=null,lang='en',
}={}){
 const {selected,code,differsFromPreference}=resolveTreasuryCurrency({
  appCurrency,accountCurrency,restaurantCurrency,financeCurrency,
 });
 if(!differsFromPreference)return '';
 if(lang==='ar')return `عملة العرض المختارة ${selected}، لكن المبلغ مسجل بـ ${code}. لم يتم تحويل العملة.`;
 if(lang==='fa')return `ارز نمایشی انتخاب‌شده ${selected} است، اما این مبلغ با ${code} ثبت شده و تبدیل نشده است.`;
 return `Selected display currency is ${selected}, but this amount is booked in ${code}. No exchange conversion was performed.`;
}
