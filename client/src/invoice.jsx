import {useState} from 'react';
import api,{errMsg} from './api';
import {tr,useLanguage} from './language.jsx';
export default function InvoiceButton({orderId}){
  const {language}=useLanguage();const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const download=async()=>{
    setBusy(true);setError('');
    try{
      const response=await api.get(`/orders/${orderId}/invoice`,{params:{lang:language},responseType:'blob'});
      if(!String(response.headers['content-type']).includes('application/pdf'))throw new Error('Invoice could not be generated. Please retry.');
      const url=URL.createObjectURL(response.data),a=document.createElement('a');a.href=url;a.download=`purchase-invoice-${orderId}.pdf`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){
      let message=errMsg(e);
      if(e.response?.data instanceof Blob){try{message=JSON.parse(await e.response.data.text()).message||message;}catch{/* Preserve original network error. */}}
      setError(message);
    }finally{setBusy(false);}
  };
  return <span className="invoice-download"><button className="secondary" disabled={busy} onClick={download}>{tr(busy?'Preparing invoice…':'Download purchase invoice')}</button>{error&&<span className="err" role="alert">{tr(error)}</span>}</span>;
}
