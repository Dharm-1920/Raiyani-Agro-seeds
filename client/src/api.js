import axios from 'axios';
import { registerProductTranslations } from './language.jsx';
const api = axios.create({ baseURL: '/api', withCredentials: true });
api.interceptors.response.use(response => { registerProductTranslations(response.data); return response; });
export const errMsg = (e) => e?.response?.data?.message || e.message || 'Something went wrong';
export default api;
