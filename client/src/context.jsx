import { createContext, useContext, useEffect, useRef, useState } from 'react';
import api, { errMsg } from './api';
const AuthCtx = createContext(), CartCtx = createContext();
export const useAuth = () => useContext(AuthCtx);
export const useCart = () => useContext(CartCtx);
export function Providers({ children }) {
  const [user,setUser] = useState(null), [ready,setReady] = useState(false);
  const [cart,setCart] = useState({ owner:null, items:[], ready:false }), [cartError,setCartError] = useState(''), [saving,setSaving] = useState(false);
  const userRef = useRef(user), cartRef = useRef(cart), queue = useRef(Promise.resolve()), generation = useRef(0);
  userRef.current=user;cartRef.current=cart;
  useEffect(() => { api.get('/auth/me').then(r => setUser(r.data.user)).catch(() => {}).finally(() => setReady(true)); }, []);
  const loadCart = async () => {
    const accountId=userRef.current?.id, version=++generation.current;
    setCartError('');setCart({owner:accountId,items:[],ready:false});
    if(!accountId)return;
    try { const {data}=await api.get('/account/cart');if(version===generation.current && userRef.current?.id===accountId && data.accountId===accountId)setCart({owner:accountId,items:data.items,ready:true}); }
    catch(e){if(version===generation.current)setCartError(errMsg(e));}
  };
  useEffect(() => { loadCart(); return () => { generation.current++; }; }, [user?.id]);
  const saveCart = (items, accountId) => {
    setSaving(true);
    const write=queue.current.catch(()=>{}).then(()=>api.put('/account/cart',{accountId,items:items.map(i=>({productId:i.id,qty:i.qty}))}));
    queue.current=write;
    write.then(()=>{if(userRef.current?.id===accountId)setCartError('');}).catch(e=>{if(userRef.current?.id===accountId)setCartError(errMsg(e));}).finally(()=>{if(queue.current===write)setSaving(false);});
    return write;
  };
  const change = fn => {
    const current=cartRef.current,accountId=userRef.current?.id;
    if(!accountId || current.owner!==accountId || !current.ready)return;
    const next={...current,items:fn(current.items)};cartRef.current=next;setCart(next);saveCart(next.items,accountId).catch(()=>{});
  };
  const switchSession = async request => { await queue.current.catch(()=>{});const result=await request();userRef.current=result?.data?.user || null;cartRef.current={owner:null,items:[],ready:false};setCart(cartRef.current);setUser(userRef.current);return result?.data?.user; };
  const auth={user,ready,
    login:b=>switchSession(()=>api.post('/auth/login',b)),
    adminLogin:b=>switchSession(()=>api.post('/auth/admin/login',b)),
    register:b=>switchSession(()=>api.post('/auth/register',b)),
    logout:()=>switchSession(()=>api.post('/auth/logout')),
    updateProfile:async b=>{const accountId=userRef.current?.id;const {data}=await api.put('/auth/me',{...b,accountId});if(userRef.current?.id!==accountId)throw new Error('Your account changed. Please sign in again.');setUser(data.user);return data.user;},
  };
  const items=user && cart.owner===user.id ? cart.items : [];
  const c={items,ready:Boolean(user && cart.owner===user.id && cart.ready),saving,error:cartError,
    retry:()=>{const current=cartRef.current;if(current.ready && current.owner===userRef.current?.id)return saveCart(current.items,current.owner).catch(()=>{});return loadCart();},
    add:(p,qty=1)=>change(cur=>{const found=cur.find(i=>i.id===p._id);return found?cur.map(i=>i.id===p._id?{...i,nameGu:p.nameGu,qty:Math.min(i.qty+qty,p.stock)}:i):[...cur,{id:p._id,name:p.name,nameGu:p.nameGu,price:p.price,image:p.images?.[0],stock:p.stock,qty:Math.min(qty,p.stock)}];}),
    setQty:(id,qty)=>change(cur=>cur.map(i=>i.id===id?{...i,qty:Math.max(1,Math.min(qty,i.stock))}:i)),
    remove:id=>change(cur=>cur.filter(i=>i.id!==id)),
    clear:()=>change(()=>[]),
    flush:()=>queue.current,
    total:items.reduce((sum,i)=>sum+i.price*i.qty,0),count:items.reduce((sum,i)=>sum+i.qty,0),
  };
  return <AuthCtx.Provider value={auth}><CartCtx.Provider value={c}>{children}</CartCtx.Provider></AuthCtx.Provider>;
}
