import { useSyncExternalStore } from 'react';
import gu from './gu.json';
import businessGu from './business-gu.json';
import wixGu from './wix-gu.json';
import coverGu from './cover-gu.json';
import productUiGu from './product-ui-gu.json';
import notificationsGu from './notifications-gu.json';
import profileGu from './profile-gu.json';
import authGu from './auth-gu.json';
import purchaseGu from './purchase-gu.json';
import counterBillsGu from './counter-bills-gu.json';
import bookkeepingGu from './bookkeeping-gu.json';
import accountBookGu from './account-book-gu.json';
import counterPosGu from './counter-pos-gu.json';
import adminUxGu from './admin-ux-gu.json';
import addressGu from './address-gu.json';
import { animatePage } from './motion';
const key='raiyani-language';
const productTranslations = new Map();
export function registerProductTranslations(data) {
  if (!data || typeof data !== 'object') return;
  if (data.categoryTranslations) Object.entries(data.categoryTranslations).forEach(([source, translated]) => { if (translated) productTranslations.set(source, translated); });
  for (const field of ['name', 'description', 'category', 'unit']) {
    if (typeof data[field] === 'string' && data[field + 'Gu']) productTranslations.set(data[field], data[field + 'Gu']);
  }
  Object.values(data).forEach(value => { if (value && typeof value === 'object') registerProductTranslations(value); });
}
export function productText(product, field = 'name') {
  const source = product?.[field] || '';
  return language === 'gu' ? product?.[field + 'Gu'] || tr(source) : source;
}
let language='en';
try { if (localStorage.getItem(key)==='gu') language='gu'; } catch { /* Browser storage may be disabled. */ }
const listeners=new Set();
const subscribe=listener=>{listeners.add(listener);return ()=>listeners.delete(listener);};
const snapshot=()=>language;
function applyLanguage(){document.documentElement.lang=language;document.title=language==='gu'?'રૈયાણી એગ્રો સીડ્સ':'Raiyani Agro Seeds';}
if(typeof document!=='undefined')applyLanguage();
export function setLanguage(value){
  if(!['en','gu'].includes(value) || value===language)return;
  language=value;
  try {localStorage.setItem(key,value);} catch { /* Keep the selection for this session. */ }
  applyLanguage();listeners.forEach(listener=>listener());
  animatePage({subtle:true});
}
export function useLanguage(){return {language:useSyncExternalStore(subscribe,snapshot,()=> 'en'),setLanguage};}
export function tr(text){
  if(typeof text!=='string')return text;
  if(language!=='gu')return ({'Remove product confirmation':'Remove \"{name}\" from your catalogue and shop? Existing order history will be kept.','Change role confirmation':"Change {name}'s role to {role}?",'Delete account confirmation':"Delete {name}'s account?"})[text] || text;
  const clean=text.trim(),translated=productTranslations.get(text) || productTranslations.get(clean) || addressGu[clean] || adminUxGu[clean] || counterPosGu[clean] || accountBookGu[clean] || bookkeepingGu[clean] || counterBillsGu[clean] || purchaseGu[clean] || authGu[clean] || profileGu[clean] || notificationsGu[clean] || productUiGu[clean] || coverGu[clean] || wixGu[clean] || businessGu[clean] || gu[clean];
  if(translated)return text.slice(0,text.indexOf(clean))+translated+text.slice(text.indexOf(clean)+clean.length);
  if(clean.startsWith('Status for order '))return 'ઓર્ડરની સ્થિતિ '+clean.slice(17);
  for(const prefix of ['Cancel this order and restore its stock?','Cancel this order?','Complete cancellation and stock restoration?'])if(clean.startsWith(prefix+' '))return tr(prefix)+' '+tr(clean.slice(prefix.length+1));
  return text;
}
export function LanguageSelector(){
  const {language,setLanguage}=useLanguage();
  return <div className="language-selector language-switcher" role="group" aria-label="Language / ભાષા">
    <svg className="language-globe" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/></svg>
    <div className={'language-toggle'+(language==='gu'?' is-gu':'')}><span className="language-toggle-thumb" aria-hidden="true"/><button type="button" lang="en" aria-pressed={language==='en'} onClick={()=>setLanguage('en')}>English</button><button type="button" lang="gu" aria-pressed={language==='gu'} onClick={()=>setLanguage('gu')}>ગુજરાતી</button></div>
  </div>;
}
export function Brand({large=false}){
  const {language}=useLanguage();
  return <span className={'shop-brand ras-brand'+(large?' shop-brand-large':'')}>
    <img className="ras-emblem" src="/assets/brand/ras-badge.webp" width="320" height="320" decoding="async" alt={language==='gu'?'રૈયાણી એગ્રો સીડ્સ લોગો':'Raiyani Agro Seeds logo'} />
    <span className="ras-wordmark"><strong>{language==='gu'?'રૈયાણી':'RAIYANI'}</strong><span>{language==='gu'?'એગ્રો સીડ્સ':'AGRO SEEDS'}</span><small>{language==='gu'?'કુદરત સાથે વિકાસ':'ROOTED IN NATURE'}</small></span>
  </span>;
}
