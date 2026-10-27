const router=require('express').Router();
const {paymentConfig}=require('../services/payments');
router.get('/options',(req,res)=>{const config=paymentConfig();res.json({cod:true,upi:config.enabled,upiReason:config.reason});});
module.exports={router};
