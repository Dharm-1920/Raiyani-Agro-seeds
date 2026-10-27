import {useEffect,useState} from 'react';
import api,{errMsg} from './api';
import {tr} from './language.jsx';
export default function PaymentStatus(){
  const [config,setConfig]=useState(null),[error,setError]=useState('');
  const load=async()=>{setError('');try{setConfig((await api.get('/admin/payment-config')).data);}catch(e){setError(errMsg(e));}};
  useEffect(()=>{load();},[]);
  const instructions={missing_id:'Set SHOP_UPI_ID in server/.env to the shop’s real receiving UPI ID, then restart the backend.',invalid_id:'SHOP_UPI_ID is invalid. Copy the complete receiving UPI ID from your bank or UPI app, then restart the backend.',missing_name:'Set SHOP_UPI_NAME in server/.env to the receiving account name, then restart the backend.'};
  return <section className="admin-panel payment-status"><div className="row"><h3>{tr('UPI QR setup')}</h3><button className="secondary" onClick={load}>{tr('Check payment setup')}</button></div>{error?<p className="err" role="alert">{tr(error)}</p>:config?<><p className={config.enabled?'ok':'payment-note'}>{tr(config.enabled?'UPI QR payment is enabled.':'UPI QR payment is disabled.')}</p>{config.enabled?<p>{config.name} · {config.upiId}</p>:<p>{tr(instructions[config.reason]||'Payment setup could not be checked.')}</p>}<small>{tr('Verify the receiving UPI ID before accepting payments. The shop confirms bank receipt manually.')}</small></>:<p>{tr('Checking payment options…')}</p>}</section>;
}
